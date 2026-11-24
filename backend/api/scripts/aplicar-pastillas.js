#!/usr/bin/env node
const fs = require("node:fs");
const mongoose = require("mongoose");
const { obtenerCatalogoLocal } = require("../src/services/catalogo-pastillas");
const { crearInformeVerificable } = require("../src/migrations/pastillas-informe");
const { inspeccionarEnTransaccion, aplicar, hashArchivo, verificarInforme, crearPlan,
  ejecutarCodigosConVentana } = require("../src/migrations/pastillas-aplicacion");
const { ErrorSeguro, conLimpieza, diagnosticos } = require("../src/migrations/pastillas-errores");

async function main(args) {
  if (args.length === 1 && args[0] === "--aplicar") return aplicar();
  if (args[0] === "--informe-local") {
    if (args.length !== 5 || args[1] !== "--inventario" || args[3] !== "--salida") {
      throw new ErrorSeguro("Uso: --informe-local --inventario instantanea.ejson --salida informe.json");
    }
    const snapshot = mongoose.mongo.BSON.EJSON.parse(fs.readFileSync(args[2], "utf8"));
    if (!Array.isArray(snapshot.productos)) throw new ErrorSeguro("La instantánea no contiene productos.");
    const informe = crearInformeVerificable(snapshot.productos, await obtenerCatalogoLocal());
    const bytes = Buffer.from(JSON.stringify(informe, null, 2));
    fs.writeFileSync(args[4], bytes, { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ productos: snapshot.productos.length, sha256: hashArchivo(bytes) }, null, 2));
    return;
  }
  if (args[0] === "--planificar") {
    if (args.length !== 9 || args[1] !== "--informe" || args[3] !== "--sha256" ||
        args[5] !== "--inventario" || args[7] !== "--salida" || !/^[a-f0-9]{64}$/.test(args[4])) {
      throw new ErrorSeguro("Uso: --planificar --informe archivo --sha256 HASH --inventario instantanea.ejson --salida plan.json");
    }
    const bytesInforme = fs.readFileSync(args[2]);
    const snapshot = mongoose.mongo.BSON.EJSON.parse(fs.readFileSync(args[6], "utf8"));
    if (!Array.isArray(snapshot.productos)) throw new ErrorSeguro("La instantánea no contiene productos.");
    const catalogo = await obtenerCatalogoLocal();
    const informe = verificarInforme(bytesInforme, args[4], snapshot.productos, catalogo);
    const plan = crearPlan(informe, snapshot.productos, args[4]);
    const bytesPlan = Buffer.from(JSON.stringify(plan, null, 2));
    fs.writeFileSync(args[8], bytesPlan, { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ seleccionados: plan.seleccionados.length, sha256: hashArchivo(bytesPlan) }, null, 2));
    return;
  }
  if (args[0] === "--aplicar") {
    const opciones = {};
    const campos = new Set(["--informe", "--sha256", "--plan", "--sha256-plan", "--respaldo",
      "--sha256-respaldo", "--sha256-inventario-respaldo", "--base", "--replica"]);
    const confirmaciones = new Set(["--confirmar-restauracion", "--confirmar-ventana", "--confirmar-referencias"]);
    for (let i = 1; i < args.length; i++) {
      const key = args[i];
      if (Object.hasOwn(opciones, key)) throw new ErrorSeguro("Opción repetida.");
      if (confirmaciones.has(key)) opciones[key] = true;
      else if (campos.has(key) && i + 1 < args.length && !args[i + 1].startsWith("--")) opciones[key] = args[++i];
      else throw new ErrorSeguro("Opción de aplicación inválida.");
    }
    if ([...campos, ...confirmaciones].some(key => !opciones[key])) {
      throw new ErrorSeguro("Aplicación bloqueada: faltan opciones o confirmaciones obligatorias.");
    }
    const bytesInforme = fs.readFileSync(opciones["--informe"]);
    const bytesPlan = fs.readFileSync(opciones["--plan"]);
    if (hashArchivo(bytesInforme) !== opciones["--sha256"] || hashArchivo(bytesPlan) !== opciones["--sha256-plan"]) {
      throw new ErrorSeguro("La huella del informe o plan no coincide con la aprobación.");
    }
    if (!process.env.PASTILLAS_MONGODB_URI) throw new ErrorSeguro("Falta PASTILLAS_MONGODB_URI.");
    const resultado = await conLimpieza(async () => {
      await mongoose.connect(process.env.PASTILLAS_MONGODB_URI);
      const db = mongoose.connection.db;
      const session = await mongoose.startSession();
      return conLimpieza(() => ejecutarCodigosConVentana({
        db, session, leerCatalogo: obtenerCatalogoLocal, bytesInforme,
        hashAprobado: opciones["--sha256"], bytesPlan, hashPlan: opciones["--sha256-plan"],
        fecha: new Date(), baseAprobada: opciones["--base"], replicaAprobada: opciones["--replica"],
        archivoRespaldo: opciones["--respaldo"], hashRespaldoAprobado: opciones["--sha256-respaldo"],
        hashInventarioRespaldo: opciones["--sha256-inventario-respaldo"],
        restauracionComprobada: opciones["--confirmar-restauracion"],
        ventanaSinEscritoresConfirmada: opciones["--confirmar-ventana"],
        referenciasExternasRevisadas: opciones["--confirmar-referencias"],
      }), () => session.endSession(), "sesion");
    }, () => mongoose.disconnect(), "conexion");
    console.log(JSON.stringify({ modo: "CAMBIOS INDIVIDUALES", ...resultado }, null, 2));
    return;
  }
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
        leerCatalogo: obtenerCatalogoLocal,
      }), () => session.endSession(), "sesion");
  }, () => mongoose.disconnect(), "conexion");
  console.log(JSON.stringify({ modo: "SOLO LECTURA", ...resultado,
    aplicacion: "La inspección no autoriza una aplicación posterior." }, null, 2));
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {
  for (const mensaje of diagnosticos(error)) console.error(mensaje);
  console.error("Operación detenida. Si el commit es incierto, verificar la auditoría antes de reintentar.");
  process.exitCode = 1;
});

module.exports = { main };
