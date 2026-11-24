#!/usr/bin/env node
const fs = require("node:fs");
const mongoose = require("mongoose");
const { validarFichas, hashFichas } = require("../src/services/catalogo-pastillas");
const { inspeccionarEnTransaccion, aplicar, hashArchivo } = require("../src/migrations/pastillas-aplicacion");
const { ErrorSeguro, conLimpieza, diagnosticos } = require("../src/migrations/pastillas-errores");

async function leerCatalogo(db, session) {
  const estado = await db.collection("catalogo_pastillas_estado").findOne({ _id: "activo" }, { session });
  if (!estado || !estado.version) throw new ErrorSeguro("No existe un catálogo activo.");
  const meta = await db.collection("catalogo_pastillas_versiones").findOne({ _id: estado.version }, { session });
  if (!meta) throw new ErrorSeguro("Falta la versión del catálogo.");
  const docs = await db.collection("catalogo_pastillas_fichas").find({ version: estado.version }, { session }).toArray();
  let fichas;
  try {
    fichas = validarFichas(docs.map(doc => doc.ficha));
  } catch (_) {
    throw new ErrorSeguro("El catálogo contiene fichas inválidas.");
  }
  if (fichas.length !== meta.cantidad || hashFichas(fichas) !== meta.sha256) {
    throw new ErrorSeguro("La versión del catálogo no supera la validación de integridad.");
  }
  return { version: estado.version, fichas };
}

async function main(args) {
  if (args.length === 1 && args[0] === "--aplicar") return aplicar();
  if (args.length !== 5 || args[0] !== "--verificar" || args[1] !== "--informe" || args[3] !== "--sha256" ||
      !/^[a-f0-9]{64}$/.test(args[4])) {
    throw new ErrorSeguro("Uso: --verificar --informe archivo.json --sha256 HASH | --aplicar");
  }
  const bytesInforme = fs.readFileSync(args[2]);
  if (hashArchivo(bytesInforme) !== args[4]) throw new ErrorSeguro("La huella aprobada no coincide.");
  JSON.parse(bytesInforme.toString("utf8"));
  if (!process.env.PASTILLAS_MONGODB_URI) throw new ErrorSeguro("Falta PASTILLAS_MONGODB_URI.");
  const resultado = await conLimpieza(async () => {
    await mongoose.connect(process.env.PASTILLAS_MONGODB_URI);
    const db = mongoose.connection.db;
    const session = await mongoose.startSession();
    return conLimpieza(() => inspeccionarEnTransaccion({
        session, bytesInforme, hashAprobado: args[4],
        leerProductos: s => db.collection("productos").find({}, { session: s }).sort({ _id: 1 }).toArray(),
        leerCatalogo: s => leerCatalogo(db, s),
      }), () => session.endSession(), "sesion");
  }, () => mongoose.disconnect(), "conexion");
  console.log(JSON.stringify({ modo: "SOLO LECTURA", ...resultado,
    aplicacion: "BLOQUEADA: faltan controles de respaldo, referencias y validación para producción." }, null, 2));
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {
  for (const mensaje of diagnosticos(error)) console.error(mensaje);
  console.error("Operación detenida. No se aplicaron cambios.");
  process.exitCode = 1;
});

module.exports = { main, leerCatalogo };
