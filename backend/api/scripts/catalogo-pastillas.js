#!/usr/bin/env node

const fs = require("node:fs");
const mongoose = require("mongoose");
const { crearServicioCatalogo, validarFichas, hashFichas, ocultarUrisMongo } = require("../src/services/catalogo-pastillas");
const { extraerCatalogo } = require("./export-litton-pastillas");

async function main(args) {
  const aplicar = args.includes("--apply");
  const inicial = args[0] === "--inicial";
  const dryInicial = inicial && args.length === 2 && !args[1].startsWith("--");
  const applyInicial = inicial && args.length === 6 && !args[1].startsWith("--") &&
    args[2] === "--apply" && args[3] === "--confirmar-inicial-completa" &&
    args[4] === "--sha256" && /^[0-9a-f]{64}$/.test(args[5]);
  const sync = args[0] === "--sync" && (args.length === 1 || (args.length === 2 && args[1] === "--apply"));
  if (!dryInicial && !applyInicial && !sync) {
    throw new Error("Uso: --inicial archivo.json [--apply --confirmar-inicial-completa --sha256 HASH] | --sync [--apply]");
  }
  const obtenerFichas = inicial
    ? async () => {
      const fichas = validarFichas(JSON.parse(fs.readFileSync(args[1], "utf8")));
      if (aplicar && hashFichas(fichas) !== args[5]) throw new Error("La huella del archivo no coincide con la revisada");
      return fichas;
    }
    : () => extraerCatalogo();
  if (!aplicar) {
    const fichas = await obtenerFichas();
    console.log(JSON.stringify({ modo: "dry-run", origen: inicial ? "inicial" : "litton",
      cantidad: fichas.length, sha256: hashFichas(fichas) }, null, 2));
    return;
  }
  if (!process.env.CATALOGO_MONGODB_URI) throw new Error("Falta CATALOGO_MONGODB_URI; no se usa la conexión de la API");
  let falloPrincipal = false;
  try {
    await mongoose.connect(process.env.CATALOGO_MONGODB_URI);
    const resultado = await crearServicioCatalogo(mongoose.connection.db).publicar({
      origen: inicial ? "inicial" : "litton", obtenerFichas,
    });
    console.log(JSON.stringify(resultado, null, 2));
  } catch (error) {
    falloPrincipal = true;
    throw error;
  } finally {
    try {
      await mongoose.disconnect();
    } catch (_) {
      console.error("ALERTA: no se pudo cerrar la conexión del catálogo.");
      if (!falloPrincipal) throw new Error("No se pudo cerrar la conexión del catálogo; verificar el resultado de la publicación");
    }
  }
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {
  const uri = process.env.CATALOGO_MONGODB_URI;
  const mensaje = String(error?.message ?? error);
  console.error(ocultarUrisMongo(uri ? mensaje.split(uri).join("[URI omitida]") : mensaje));
  process.exitCode = 1;
});

module.exports = { main };
