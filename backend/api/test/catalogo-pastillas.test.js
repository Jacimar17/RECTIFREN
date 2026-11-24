const test = require("node:test");
const assert = require("node:assert/strict");
const { crearServicioCatalogo, obtenerCatalogoLocal, validarFichas, hashFichas } = require("../src/services/catalogo-pastillas");
const { extraerCatalogo } = require("../scripts/export-litton-pastillas");
const { main } = require("../scripts/catalogo-pastillas");

const ficha = code => ({ code, name: `Pastilla ${code}`, brand: "LITTON", category: "PASTILLA DE FRENO",
  supplierCode: code, substitutes: [{ code: "FRASLE", value: `PD/${code}` }] });
const copiar = x => structuredClone(x);

function dbFalsa() {
  const collections = new Map();
  return {
    collections,
    listCollections: ({ name }) => ({ hasNext: async () => collections.has(name) }),
    createCollection: async (name) => { if (!collections.has(name)) collections.set(name, new Map()); },
    collection(name) {
      if (!collections.has(name)) collections.set(name, new Map());
      const datos = collections.get(name);
      const match = (doc, filter) => Object.entries(filter).every(([k, v]) => doc[k] === v);
      return {
        createIndex: async () => {},
        findOne: async filter => copiar([...datos.values()].find(doc => match(doc, filter)) || null),
        find: filter => ({ toArray: async () => copiar([...datos.values()].filter(doc => match(doc, filter)).reverse()) }),
        insertOne: async doc => {
          if (datos.has(doc._id)) { const e = new Error("duplicate"); e.code = 11000; throw e; }
          datos.set(doc._id, copiar(doc));
        },
        insertMany: async docs => { for (const doc of docs) {
          if (datos.has(doc._id)) throw new Error("duplicate");
          datos.set(doc._id, copiar(doc));
        } },
        updateOne: async (filter, update) => {
          const doc = [...datos.values()].find(row => match(row, filter));
          if (!doc) return { modifiedCount: 0 };
          Object.assign(doc, copiar(update.$set));
          return { modifiedCount: 1 };
        },
        deleteOne: async filter => {
          const doc = [...datos.values()].find(row => match(row, filter));
          if (doc) datos.delete(doc._id);
          return { deletedCount: doc ? 1 : 0 };
        },
      };
    },
  };
}

test("carga el catálogo local validado y reintenta después de un error", async () => {
  const fs = require("node:fs/promises");
  const leer = fs.readFile;
  let llamadas = 0;
  fs.readFile = async (...args) => {
    llamadas++;
    if (llamadas === 1) throw new Error("archivo no disponible");
    if (llamadas === 2) return "[]";
    return leer(...args);
  };
  try {
    await assert.rejects(obtenerCatalogoLocal(), error =>
      error.name === "CatalogoLocalError" && error.cause.message === "archivo no disponible");
    await assert.rejects(obtenerCatalogoLocal(), error =>
      error.name === "CatalogoLocalError" && /vacío/.test(error.cause.message));
    const catalogo = await obtenerCatalogoLocal();
    assert.ok(catalogo.fichas.some(f => f.code === "44980NA"));
    assert.match(catalogo.version, /^local-[a-f0-9]{64}$/);
    assert.strictEqual(await obtenerCatalogoLocal(), catalogo);
    assert.equal(llamadas, 3);
  } finally {
    fs.readFile = leer;
  }
});

test("validación estricta, duplicados y huella estable", () => {
  assert.throws(() => validarFichas([]), /vacío/);
  assert.throws(() => validarFichas([ficha("x"), ficha(" X ")]), /duplicado/);
  assert.throws(() => validarFichas([ficha("A-B"), ficha("ab")]), /duplicado/);
  assert.throws(() => validarFichas([ficha("---")]), /inválido/);
  assert.throws(() => validarFichas([{ ...ficha("x"), error: "falló" }]), /error/);
  assert.throws(() => validarFichas([{ ...ficha("x"), substitutes: [{ code: "X", value: null }] }]), /inválido/);
  assert.throws(() => validarFichas([{ ...ficha("x"), substitutes: [ficha("x").substitutes[0], { code: " frasle ", value: "pd/X" }] }]), /duplicada/);
  assert.equal(hashFichas([ficha("B"), ficha("A")]), hashFichas([ficha("A"), ficha("B")]));
});

test("omite marcadores de código ausente sin indexar ni perder la ficha", async () => {
  const db = dbFalsa(), servicio = crearServicioCatalogo(db);
  const entrada = { ...ficha("A"), substitutes: [
    { code: "TRW - BRASIL", value: " - " },
    { code: "ECOPADS", value: "\r" },
    { code: "FRASLE", value: " PD/528 " },
  ] };
  await servicio.publicar({ origen: "inicial", obtenerFichas: async () => [entrada] });
  assert.deepEqual((await servicio.obtenerCatalogoActivo()).fichas[0].substitutes,
    [{ code: "FRASLE", value: "PD/528" }]);
  assert.equal(hashFichas([entrada]), hashFichas([{ ...entrada, substitutes: [{ code: "FRASLE", value: "PD/528" }] }]));
  assert.throws(() => validarFichas([{ ...entrada, substitutes: [{ code: "TRW", value: "-", error: true }] }]), /desconocido/);
});

test("el archivo real de 2647 fichas se importa completo sin marcadores de ausencia", async () => {
  const path = require("node:path"), fs = require("node:fs");
  const fuente = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../litton-pastillas.json"), "utf8"));
  const marcadores = fuente.flatMap(row => row.substitutes)
    .filter(item => typeof item.value === "string" && ["", "-"].includes(item.value.trim()));
  assert.equal(fuente.length, 2647);
  assert.ok(marcadores.some(item => item.value.trim() === "-"));
  assert.ok(fuente.find(row => row.code === "46970ULT").substitutes.some(item => item.code === "ECOPADS" && item.value === "\r"));
  const db = dbFalsa(), servicio = crearServicioCatalogo(db);
  await servicio.publicar({ origen: "inicial", obtenerFichas: async () => fuente });
  const { fichas } = await servicio.obtenerCatalogoActivo();
  assert.equal(fichas.length, fuente.length);
  const equivalencias = fichas.flatMap(row => row.substitutes);
  assert.equal(equivalencias.length, fuente.flatMap(row => row.substitutes).length - marcadores.length);
  assert.ok(equivalencias.every(item => item.value && item.value !== "-"));
  assert.ok(!fichas.find(row => row.code === "46970ULT").substitutes.some(item => item.code === "ECOPADS"));
});

test("importación inicial es dry-run sin conexión por defecto", async () => {
  const fs = require("node:fs"), mongoose = require("mongoose");
  const leer = fs.readFileSync, conectar = mongoose.connect, log = console.log;
  let salida;
  fs.readFileSync = () => JSON.stringify([ficha("A")]);
  mongoose.connect = () => { throw new Error("No debe conectarse"); };
  console.log = value => { salida = JSON.parse(value); };
  try {
    await main(["--inicial", "revisar.json"]);
    assert.equal(salida.modo, "dry-run");
    assert.equal(salida.cantidad, 1);
    assert.equal(salida.sha256, hashFichas([ficha("A")]));
    await assert.rejects(main(["--inicial", "revisar.json", "--apply"]), /Uso/);
  } finally {
    fs.readFileSync = leer;
    mongoose.connect = conectar;
    console.log = log;
  }
});

test("sincronización seca y publicación no leen el JSON local", async () => {
  const fs = require("node:fs"), mongoose = require("mongoose");
  const db = dbFalsa(), servicio = crearServicioCatalogo(db);
  await servicio.publicar({ origen: "inicial", obtenerFichas: async () => [ficha("A")] });
  const original = {
    leer: fs.readFileSync, fetch: global.fetch, connect: mongoose.connect,
    disconnect: mongoose.disconnect, db: mongoose.connection.db,
    log: console.log, uri: process.env.CATALOGO_MONGODB_URI,
  };
  let salida;
  fs.readFileSync = () => { throw new Error("La sincronización no debe leer archivos"); };
  global.fetch = async url => ({
    ok: true, json: async () => url.includes("simple-search")
      ? { pagination: { total: 1, perPage: 20, page: 1 }, results: [ficha("A")] }
      : { ...ficha("A"), subcategory: "LITTON", supplier_code: "A" },
  });
  mongoose.connect = async () => { mongoose.connection.db = db; };
  mongoose.disconnect = async () => {};
  process.env.CATALOGO_MONGODB_URI = "mongodb://no-se-conecta";
  console.log = value => { salida = JSON.parse(value); };
  try {
    await main(["--sync"]);
    assert.equal(salida.modo, "dry-run");
    await main(["--sync", "--apply"]);
    assert.equal(salida.sinCambios, true);
  } finally {
    fs.readFileSync = original.leer;
    global.fetch = original.fetch;
    mongoose.connect = original.connect;
    mongoose.disconnect = original.disconnect;
    mongoose.connection.db = original.db;
    console.log = original.log;
    if (original.uri === undefined) delete process.env.CATALOGO_MONGODB_URI;
    else process.env.CATALOGO_MONGODB_URI = original.uri;
  }
});

test("publicación, respaldo, diferencias, lecturas deterministas y detección de alteración", async () => {
  const db = dbFalsa(), servicio = crearServicioCatalogo(db);
  await assert.rejects(servicio.obtenerCatalogoActivo(), /No existe/);
  const inicial = await servicio.publicar({ origen: "inicial", obtenerFichas: async () => [ficha("B"), ficha("A")] });
  const primero = await servicio.obtenerCatalogoActivo();
  assert.deepEqual(primero, { version: inicial.version, fichas: [ficha("A"), ficha("B")] });
  const huellaObjeto = x => require("node:crypto").createHash("sha256").update(JSON.stringify(x)).digest("hex");
  assert.equal(huellaObjeto(primero), huellaObjeto(await servicio.obtenerCatalogoActivo()));
  await assert.rejects(servicio.publicar({ origen: "inicial", obtenerFichas: async () => [ficha("A")] }), /Ya existe/);
  const sync = await servicio.publicar({ origen: "litton", obtenerFichas: async () => [ficha("A"), { ...ficha("B"), name: "Nueva" }, ficha("C")] });
  assert.equal(sync.anterior, inicial.version);
  assert.deepEqual(sync.diferencias, { altas: ["C"], cambios: ["B"], bajas: [] });
  assert.equal(db.collections.get("catalogo_pastillas_versiones").has(inicial.version), true);
  assert.equal(db.collections.get("catalogo_pastillas_fichas").size, 5);
  const repetido = await servicio.publicar({ origen: "litton", obtenerFichas: async () => [ficha("C"), ficha("A"), { ...ficha("B"), name: "Nueva" }] });
  assert.equal(repetido.sinCambios, true);
  const rows = db.collections.get("catalogo_pastillas_fichas");
  [...rows.values()].find(row => row.version === sync.version).ficha.name = "corrupta";
  await assert.rejects(servicio.obtenerCatalogoActivo(), /integridad/);
});

test("fallos y reducción sospechosa nunca publican; bloqueo concurrente", async () => {
  const db = dbFalsa(), servicio = crearServicioCatalogo(db);
  const fichas = Array.from({ length: 10 }, (_, i) => ficha(String(i)));
  const inicial = await servicio.publicar({ origen: "inicial", obtenerFichas: async () => fichas });
  await assert.rejects(servicio.publicar({ origen: "litton", obtenerFichas: async () => fichas.slice(0, 8) }), /sospechosa/);
  await assert.rejects(servicio.publicar({ origen: "litton", obtenerFichas: async () => [...fichas, ficha("0-")] }), /duplicado/);
  await assert.rejects(servicio.publicar({ origen: "litton", obtenerFichas: async () => { throw new Error("página incompleta"); } }), /incompleta/);
  assert.equal((await servicio.obtenerCatalogoActivo()).version, inicial.version);
  assert.equal(db.collections.get("catalogo_pastillas_ejecuciones").size, 3);
  let liberar, inicio;
  const iniciado = new Promise(resolve => { inicio = resolve; });
  const pausa = new Promise(resolve => { liberar = resolve; });
  const primera = servicio.publicar({ origen: "litton", obtenerFichas: async () => { inicio(); await pausa; return fichas; } });
  await iniciado;
  await assert.rejects(servicio.publicar({ origen: "litton", obtenerFichas: async () => fichas }), /bloqueo/);
  liberar();
  await primera;
});

test("una escritura parcial no altera la versión publicada", async () => {
  const db = dbFalsa(), servicio = crearServicioCatalogo(db);
  const inicial = await servicio.publicar({ origen: "inicial", obtenerFichas: async () => [ficha("A")] });
  const collection = db.collection;
  db.collection = function(name) {
    const c = collection.call(db, name);
    if (name === "catalogo_pastillas_fichas") {
      c.insertMany = async docs => { await c.insertOne(docs[0]); throw new Error("escritura interrumpida"); };
    }
    return c;
  };
  await assert.rejects(servicio.publicar({ origen: "litton", obtenerFichas: async () => [ficha("A"), ficha("B")] }), /interrumpida/);
  assert.equal((await servicio.obtenerCatalogoActivo()).version, inicial.version);
});

test("fallas de auditoría y desbloqueo se notifican sin ocultar el error original ni filtrar URI", async () => {
  const db = dbFalsa(), servicio = crearServicioCatalogo(db);
  const anterior = await servicio.publicar({ origen: "inicial", obtenerFichas: async () => [ficha("A")] });
  const uri = "mongodb://usuario:secreto@servidor/base";
  const errorOriginal = new Error("Extracción incompleta");
  const collection = db.collection;
  db.collection = function(name) {
    const c = collection.call(db, name);
    if (name === "catalogo_pastillas_ejecuciones") c.insertOne = async () => { throw new Error(uri); };
    if (name === "catalogo_pastillas_bloqueos") c.deleteOne = async () => { throw new Error(uri); };
    return c;
  };
  const errores = [], log = console.error;
  console.error = mensaje => errores.push(mensaje);
  try {
    await assert.rejects(servicio.publicar({ origen: "litton", obtenerFichas: async () => { throw errorOriginal; } }),
      error => error === errorOriginal);
  } finally {
    console.error = log;
  }
  assert.equal(errores.length, 2);
  assert.match(errores[0], /auditoría/);
  assert.match(errores[1], /bloqueo/);
  assert.ok(errores.every(mensaje => !mensaje.includes(uri) && !mensaje.includes("secreto")));
  assert.equal((await servicio.obtenerCatalogoActivo()).version, anterior.version);
});

test("la auditoría omite URI y una liberación fallida tras publicar informa resultado incierto", async () => {
  const db = dbFalsa(), servicio = crearServicioCatalogo(db);
  const uri = "mongodb+srv://usuario:secreto@servidor/base";
  const original = new Error(`Conexión falló en ${uri}`);
  await assert.rejects(servicio.publicar({ origen: "inicial", obtenerFichas: async () => { throw original; } }),
    error => error === original);
  const registro = [...db.collections.get("catalogo_pastillas_ejecuciones").values()][0];
  assert.doesNotMatch(registro.mensaje, /secreto|mongodb\+srv:\/\//);

  const collection = db.collection;
  db.collection = function(name) {
    const c = collection.call(db, name);
    if (name === "catalogo_pastillas_bloqueos") c.deleteOne = async () => { throw new Error(uri); };
    return c;
  };
  const errores = [], log = console.error;
  console.error = mensaje => errores.push(mensaje);
  try {
    await assert.rejects(servicio.publicar({ origen: "inicial", obtenerFichas: async () => [ficha("A")] }), /podría haberse completado/);
  } finally {
    console.error = log;
  }
  assert.equal((await servicio.obtenerCatalogoActivo()).fichas.length, 1);
  assert.match(errores[0], /bloqueo/);
  assert.doesNotMatch(errores.join(" "), /secreto/);
});

test("el cierre fallido de conexión no oculta el error original", async () => {
  const mongoose = require("mongoose"), db = dbFalsa();
  const original = { connect: mongoose.connect, disconnect: mongoose.disconnect,
    db: mongoose.connection.db, uri: process.env.CATALOGO_MONGODB_URI, log: console.error };
  const errores = [];
  mongoose.connect = async () => { mongoose.connection.db = db; };
  mongoose.disconnect = async () => { throw new Error("mongodb://usuario:secreto@servidor"); };
  process.env.CATALOGO_MONGODB_URI = "mongodb://no-se-conecta";
  console.error = mensaje => errores.push(mensaje);
  try {
    await assert.rejects(main(["--sync", "--apply"]), /requiere una importación inicial/);
    assert.match(errores[0], /cerrar la conexión/);
    assert.doesNotMatch(errores.join(" "), /secreto/);
  } finally {
    mongoose.connect = original.connect;
    mongoose.disconnect = original.disconnect;
    mongoose.connection.db = original.db;
    console.error = original.log;
    if (original.uri === undefined) delete process.env.CATALOGO_MONGODB_URI;
    else process.env.CATALOGO_MONGODB_URI = original.uri;
  }
});

test("extracción exige páginas y fichas completas y sin duplicados", async () => {
  const lista = [ficha("A"), ficha("B"), ficha("C")];
  const consultar = async url => {
    if (url.includes("simple-search")) {
      const page = Number(new URL(url).searchParams.get("page"));
      return { pagination: { total: 3, perPage: 2, page }, results: lista.slice((page - 1) * 2, page * 2) };
    }
    const r = lista.find(x => x.code === decodeURIComponent(url.split("/").pop()));
    return { ...r, subcategory: r.brand, supplier_code: r.supplierCode };
  };
  assert.deepEqual(await extraerCatalogo({ consultar, pausa: async () => {} }), lista);
  await assert.rejects(extraerCatalogo({ pausa: async () => {}, consultar: async url => {
    const result = await consultar(url);
    if (url.includes("page=2")) result.results = [];
    return result;
  } }), /incompleta/);
  await assert.rejects(extraerCatalogo({ pausa: async () => {}, consultar: async url => {
    const result = await consultar(url);
    if (url.endsWith("/B")) delete result.substitutes;
    return result;
  } }), /incompleta/);
  await assert.rejects(extraerCatalogo({ pausa: async () => {}, consultar: async url => {
    const result = await consultar(url);
    if (url.includes("page=2")) result.results[0] = lista[0];
    return result;
  } }), /repetido/);
});
