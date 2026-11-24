#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { crearInforme } = require("../src/migrations/pastillas-preview");

try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--inventario") {
    throw new Error("Uso: node scripts/preview-pastillas.js --inventario <exportacion-json>");
  }
  const inventario = JSON.parse(fs.readFileSync(path.resolve(args[1]), "utf8"));
  const catalogo = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../litton-pastillas.json"), "utf8"));
  console.log(JSON.stringify(crearInforme(inventario, catalogo), null, 2));
} catch (error) {
  console.error(`Simulación detenida: ${error.message}`);
  process.exitCode = 1;
}
