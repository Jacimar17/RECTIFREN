#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { crearInforme } = require("../src/migrations/pastillas-preview");
const { obtenerCatalogoActivo, ocultarUrisMongo } = require("../src/services/catalogo-pastillas");

function leerInventario(ruta) {
  const { EJSON } = require("mongoose").mongo.BSON;
  const contenido = EJSON.parse(fs.readFileSync(path.resolve(ruta), "utf8"));
  if (Array.isArray(contenido)) return contenido;
  if (!contenido || !Array.isArray(contenido.documentos) ||
      !Number.isSafeInteger(contenido.cantidad) || contenido.cantidad !== contenido.documentos.length) {
    throw new Error("La instantánea de inventario no tiene un conteo válido de documentos.");
  }
  const ids = contenido.documentos.map((producto) => {
    const id = producto && producto._id;
    if (typeof id === "string" && id.trim()) return id;
    if (id && typeof id.toHexString === "function") return id.toHexString();
    throw new Error("La instantánea contiene un documento sin identificador válido.");
  });
  if (new Set(ids).size !== ids.length) {
    throw new Error("La instantánea contiene identificadores duplicados.");
  }
  return contenido.documentos;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === "--inventario") {
    const inventario = leerInventario(args[1]);
    const catalogo = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../litton-pastillas.json"), "utf8"));
    console.log(JSON.stringify(crearInforme(inventario, catalogo), null, 2));
    return;
  }
  if (args.length !== 3 || args[0] !== "--atlas" || args[1] !== "--salida" || !args[2]) {
    throw new Error("Uso: node scripts/preview-pastillas.js --inventario <exportacion-json> | --atlas --salida <informe.json>");
  }

  require("dotenv").config();
  const mongoose = require("mongoose");
  const { crearInformeVerificable } = require("../src/migrations/pastillas-informe");
  if (!process.env.MONGODB_URI) throw new Error("Falta MONGODB_URI; la simulación no se conectó.");

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const catalogo = await obtenerCatalogoActivo();
    const productos = await mongoose.connection.collection("productos").find({}).sort({ _id: 1 }).toArray();
    const catalogoFinal = await obtenerCatalogoActivo();
    const informe = crearInformeVerificable(productos, catalogo);
    if (informe.catalogo.sha256 !== crearInformeVerificable([], catalogoFinal).catalogo.sha256) {
      throw new Error("El catálogo activo cambió durante la lectura; repetí la simulación.");
    }
    const salida = path.resolve(args[2]);
    fs.writeFileSync(salida, JSON.stringify(informe, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
    console.log(`Informe de solo lectura guardado en ${salida}. No se modificó MongoDB.`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    const uri = process.env.MONGODB_URI;
    const mensaje = ocultarUrisMongo(uri ? String(error.message).split(uri).join("[URI omitida]") : error.message);
    console.error(`Simulación detenida: ${mensaje}`);
    process.exitCode = 1;
  });
}

module.exports = { leerInventario };
