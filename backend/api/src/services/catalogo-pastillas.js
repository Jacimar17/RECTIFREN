const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
const normalizarCodigo = require("../proveedores/normalizar-codigo");

const CATEGORY = "PASTILLA DE FRENO";
const NOMBRES = {
  fichas: "catalogo_pastillas_fichas",
  versiones: "catalogo_pastillas_versiones",
  estado: "catalogo_pastillas_estado",
  bloqueos: "catalogo_pastillas_bloqueos",
  ejecuciones: "catalogo_pastillas_ejecuciones",
};
const WRITE = { writeConcern: { w: "majority" } };
const clave = s => s.trim().toUpperCase();
const ocultarUrisMongo = mensaje => String(mensaje).replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[URI MongoDB omitida]");
const texto = (value, campo) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Campo inválido: ${campo}`);
  }
  return value.trim();
};

function validarFichas(fichas) {
  if (!Array.isArray(fichas) || !fichas.length) throw new Error("Catálogo vacío o inválido");
  const codigos = new Set();
  return fichas.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) || row.error != null) {
      throw new Error("Ficha inválida o con error de extracción");
    }
    for (const k of Object.keys(row)) {
      if (!["code", "name", "brand", "category", "supplierCode", "substitutes"].includes(k)) {
        throw new Error(`Campo de ficha desconocido: ${k}`);
      }
    }
    const code = texto(row.code, "code");
    const codeKey = normalizarCodigo(code);
    if (!codeKey) throw new Error(`Código de ficha inválido: ${code}`);
    if (codigos.has(codeKey)) throw new Error(`Código duplicado: ${code}`);
    codigos.add(codeKey);
    const name = texto(row.name, "name");
    const brand = texto(row.brand, "brand");
    const category = texto(row.category, "category");
    if (category !== CATEGORY) throw new Error(`Categoría inválida: ${category}`);
    const supplierCode = texto(row.supplierCode, "supplierCode");
    if (!Array.isArray(row.substitutes)) throw new Error(`Equivalencias inválidas: ${code}`);
    const equivalencias = new Set();
    const substitutes = row.substitutes.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Equivalencia inválida: ${code}`);
      for (const k of Object.keys(item)) {
        if (!["code", "value", "_id"].includes(k)) throw new Error(`Campo de equivalencia desconocido: ${k}`);
      }
      const marca = texto(item.code, "substitutes.code");
      if (typeof item.value !== "string") throw new Error(`Campo inválido: substitutes.value en ${code}`);
      if (item._id != null && (typeof item._id !== "string" || !item._id.trim())) throw new Error("Identificador de equivalencia inválido");
      const valor = item.value.trim();
      if (!valor || valor === "-") return [];
      const key = JSON.stringify([clave(marca), clave(valor)]);
      if (equivalencias.has(key)) throw new Error(`Equivalencia duplicada en ${code}`);
      equivalencias.add(key);
      return [item._id == null ? { code: marca, value: valor } : { code: marca, value: valor, _id: item._id }];
    });
    return { code, name, brand, category, supplierCode, substitutes };
  }).sort((a, b) => clave(a.code) < clave(b.code) ? -1 : clave(a.code) > clave(b.code) ? 1 : 0);
}

function hashFichas(fichas) {
  return crypto.createHash("sha256").update(JSON.stringify(validarFichas(fichas))).digest("hex");
}

function diferencias(anteriores, nuevas) {
  const old = new Map(anteriores.map(f => [clave(f.code), f]));
  const next = new Map(nuevas.map(f => [clave(f.code), f]));
  const altas = [], cambios = [], bajas = [];
  for (const [key, ficha] of next) {
    if (!old.has(key)) altas.push(ficha.code);
    else if (JSON.stringify(old.get(key)) !== JSON.stringify(ficha)) cambios.push(ficha.code);
  }
  for (const [key, ficha] of old) if (!next.has(key)) bajas.push(ficha.code);
  return { altas, cambios, bajas };
}

const schemas = {
  fichas: { required: ["_id", "version", "ficha"], properties: {
    _id: { bsonType: "string" }, version: { bsonType: "string" }, ficha: {
      bsonType: "object", additionalProperties: false,
      required: ["code", "name", "brand", "category", "supplierCode", "substitutes"],
      properties: {
        code: { bsonType: "string", minLength: 1 }, name: { bsonType: "string", minLength: 1 },
        brand: { bsonType: "string", minLength: 1 }, category: { enum: [CATEGORY] },
        supplierCode: { bsonType: "string", minLength: 1 }, substitutes: {
          bsonType: "array", items: { bsonType: "object", additionalProperties: false,
            required: ["code", "value"], properties: {
              code: { bsonType: "string", minLength: 1 },
              value: { bsonType: "string", pattern: "^(?!\\s*$)(?!\\s*-\\s*$)[\\s\\S]+$" },
              _id: { bsonType: "string", minLength: 1 },
            } },
        },
      },
    },
  } },
  versiones: { required: ["_id", "cantidad", "sha256", "origen", "fecha", "diferencias"], properties: {
    _id: { bsonType: "string" }, cantidad: { bsonType: ["int", "long", "double"], minimum: 1 },
    sha256: { bsonType: "string", pattern: "^[0-9a-f]{64}$" }, origen: { enum: ["inicial", "litton"] },
    fecha: { bsonType: "date" }, diferencias: { bsonType: "object" },
  } },
  estado: { required: ["_id", "version"], properties: { _id: { enum: ["activo"] }, version: { bsonType: "string" } } },
  bloqueos: { required: ["_id", "token", "fecha"], properties: {
    _id: { enum: ["publicacion"] }, token: { bsonType: "string" }, fecha: { bsonType: "date" },
  } },
  ejecuciones: { required: ["_id", "fecha", "estado"], properties: {
    _id: { bsonType: "string" }, fecha: { bsonType: "date" }, estado: { enum: ["error"] },
  } },
};

async function prepararColecciones(db) {
  for (const [key, name] of Object.entries(NOMBRES)) {
    const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
    if (!exists) {
      await db.createCollection(name, { validator: { $jsonSchema: { bsonType: "object", ...schemas[key] } },
        validationLevel: "strict", validationAction: "error", ...WRITE });
    }
  }
  await db.collection(NOMBRES.fichas).createIndex({ version: 1 }, WRITE);
}

function crearServicioCatalogo(db) {
  const coleccion = key => db.collection(NOMBRES[key]);
  async function leerVersion(id) {
    const meta = await coleccion("versiones").findOne({ _id: id });
    if (!meta) throw new Error(`Catálogo activo inválido: falta versión ${id}`);
    const docs = await coleccion("fichas").find({ version: id }).toArray();
    const fichas = validarFichas(docs.map(doc => doc.ficha));
    if (fichas.length !== meta.cantidad || hashFichas(fichas) !== meta.sha256) {
      throw new Error(`Catálogo activo inválido: integridad de ${id}`);
    }
    return { version: id, fichas };
  }
  async function obtenerCatalogoActivo() {
    const estado = await coleccion("estado").findOne({ _id: "activo" });
    if (!estado || !estado.version) throw new Error("No existe un catálogo de pastillas activo");
    return leerVersion(estado.version);
  }
  async function publicar({ origen, obtenerFichas }) {
    if (!["inicial", "litton"].includes(origen) || typeof obtenerFichas !== "function") throw new Error("Origen inválido");
    await prepararColecciones(db);
    const token = crypto.randomUUID();
    try {
      await coleccion("bloqueos").insertOne({ _id: "publicacion", token, fecha: new Date() }, WRITE);
    } catch (error) {
      if (error.code === 11000) throw new Error("Ya existe una publicación de catálogo en curso o un bloqueo pendiente");
      throw error;
    }
    let falloPrincipal = false;
    try {
      const estado = await coleccion("estado").findOne({ _id: "activo" });
      if (origen === "inicial" && estado) throw new Error("Ya existe un catálogo activo; la importación inicial está prohibida");
      if (origen === "litton" && !estado) throw new Error("Se requiere una importación inicial antes de sincronizar");
      const anterior = estado ? await leerVersion(estado.version) : null;
      const fichas = validarFichas(await obtenerFichas());
      const diff = diferencias(anterior ? anterior.fichas : [], fichas);
      if (anterior && (fichas.length < anterior.fichas.length * 0.9 || diff.bajas.length > anterior.fichas.length * 0.1)) {
        throw new Error("Reducción sospechosa del catálogo: publicación cancelada");
      }
      const sha256 = hashFichas(fichas);
      if (anterior && sha256 === hashFichas(anterior.fichas)) return { version: anterior.version, sinCambios: true, diferencias: diff };
      const version = crypto.randomUUID();
      const docs = fichas.map(ficha => ({ _id: `${version}:${clave(ficha.code)}`, version, ficha }));
      await coleccion("fichas").insertMany(docs, { ordered: true, ...WRITE });
      await coleccion("versiones").insertOne({ _id: version, cantidad: fichas.length, sha256, origen,
        fecha: new Date(), diferencias: diff, anterior: anterior ? anterior.version : null }, WRITE);
      await leerVersion(version);
      if (estado) {
        const result = await coleccion("estado").updateOne({ _id: "activo", version: estado.version },
          { $set: { version, anterior: estado.version, fecha: new Date() } }, WRITE);
        if (result.modifiedCount !== 1) throw new Error("La versión activa cambió durante la publicación");
      } else {
        await coleccion("estado").insertOne({ _id: "activo", version, anterior: null, fecha: new Date() }, WRITE);
      }
      return { version, anterior: anterior ? anterior.version : null, sha256, diferencias: diff };
    } catch (error) {
      falloPrincipal = true;
      try {
        const mensaje = ocultarUrisMongo(error?.message ?? error);
        await coleccion("ejecuciones").insertOne({ _id: crypto.randomUUID(), fecha: new Date(), estado: "error",
          origen, mensaje: mensaje.slice(0, 1000) }, WRITE);
      } catch (_) {
        console.error("ALERTA: no se pudo registrar el fallo de catálogo en auditoría.");
      }
      throw error;
    } finally {
      try {
        const liberado = await coleccion("bloqueos").deleteOne({ _id: "publicacion", token }, WRITE);
        if (liberado.deletedCount !== 1) throw new Error("Bloqueo no encontrado");
      } catch (_) {
        console.error("ALERTA: no se pudo confirmar la liberación del bloqueo de catálogo; revisar el estado.");
        if (!falloPrincipal) throw new Error("No se pudo confirmar la liberación del bloqueo; la publicación podría haberse completado");
      }
    }
  }
  return { obtenerCatalogoActivo, publicar };
}

async function obtenerCatalogoActivo() {
  if (!mongoose.connection.db) throw new Error("MongoDB no está conectado; no se puede leer el catálogo activo");
  return crearServicioCatalogo(mongoose.connection.db).obtenerCatalogoActivo();
}

class CatalogoLocalError extends Error {
  constructor(cause) {
    super("No se pudo cargar el catálogo local de pastillas.", { cause });
    this.name = "CatalogoLocalError";
  }
}

let catalogoLocal;
async function obtenerCatalogoLocal() {
  if (!catalogoLocal) {
    catalogoLocal = (async () => {
      const archivo = path.resolve(__dirname, "..", "..", "..", "..", "litton-pastillas.json");
      const fichas = validarFichas(JSON.parse(await fs.readFile(archivo, "utf8")));
      return { version: `local-${hashFichas(fichas)}`, fichas };
    })();
  }
  const carga = catalogoLocal;
  try {
    return await carga;
  } catch (error) {
    if (catalogoLocal === carga) catalogoLocal = undefined;
    throw new CatalogoLocalError(error);
  }
}

module.exports = { CatalogoLocalError, obtenerCatalogoActivo, obtenerCatalogoLocal, crearServicioCatalogo, validarFichas, hashFichas, diferencias, ocultarUrisMongo };
