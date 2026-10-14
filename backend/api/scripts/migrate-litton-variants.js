#!/usr/bin/env node
require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const buscarLitton = require("../src/proveedores/litton");
const Producto = require("../src/models/Producto");
const {
  construirProductoLitton,
  normalizarCodigo,
  prepararGrupos,
} = require("../src/migrations/litton-variants");

function argumentos(argv) {
  const options = { aplicar: false, mappingPath: "" };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--apply") {
      options.aplicar = true;
    } else if (argv[index] === "--mapping") {
      options.mappingPath = argv[++index] || "";
    } else {
      throw new Error(`Argumento desconocido: ${argv[index]}`);
    }
  }
  return options;
}

function cargarMapeos(mappingPath) {
  if (!mappingPath) return {};
  const filename = path.resolve(process.cwd(), mappingPath);
  const parsed = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("El archivo de mapeos debe ser un objeto JSON.");
  }
  return Object.fromEntries(Object.entries(parsed).map(([oldCode, littonCode]) => {
    if (typeof littonCode !== "string" || !littonCode.trim()) {
      throw new Error(`El código Litton para ${oldCode} debe ser texto no vacío.`);
    }
    return [normalizarCodigo(oldCode), littonCode.trim()];
  }));
}

function documentosComoVariantes(documento) {
  if (documento.schemaVersion !== 2) return [documento];
  return (documento.variantes || []).map((variante) => ({
    codigo: documento.codigo,
    marca: variante.marca,
    stock: variante.cantidad,
    stockMinimo: variante.stockMinimo,
    ubicacion: variante.ubicacion,
  }));
}

async function buscarDocumentosRF() {
  return Producto.collection.find({
    archivado: { $ne: true },
    schemaVersion: { $ne: 2 },
    $or: [
      { codigo: /^RF[-/]?[A-Z0-9]+$/i },
      { CODIGO: /^RF[-/]?[A-Z0-9]+$/i },
    ],
  }).toArray();
}

async function crearPlan(documentos, mapeos) {
  const grupos = prepararGrupos(documentos, mapeos);
  const faltantes = grupos.filter((grupo) => !grupo.codigoLitton);
  const targets = new Map();

  for (const grupo of grupos) {
    if (!grupo.codigoLitton) continue;
    const detalle = await buscarLitton.obtenerDetalle(grupo.codigoLitton);
    if (normalizarCodigo(detalle.code) !== normalizarCodigo(grupo.codigoLitton)) {
      throw new Error(`Litton devolvió ${detalle.code} al solicitar ${grupo.codigoLitton}.`);
    }
    const key = normalizarCodigo(detalle.code);
    if (!targets.has(key)) targets.set(key, { detalle, grupos: [], documentos: [] });
    const target = targets.get(key);
    target.grupos.push(grupo);
    target.documentos.push(...grupo.documentos);
  }

  const plan = [];
  for (const target of targets.values()) {
    const existente = await Producto.collection.findOne({
      schemaVersion: 2,
      archivado: { $ne: true },
      codigo: target.detalle.code,
    });
    target.existente = existente;
    if (existente) {
      target.documentos.push(...documentosComoVariantes(existente));
    }
    const documento = construirProductoLitton(target.detalle, target.documentos);
    if (existente) {
      documento.equivalencias = existente.equivalencias || "";
      documento.equivalentesVinculados = existente.equivalentesVinculados || [];
    }
    plan.push({
      codigoLitton: target.detalle.code,
      codigosRF: target.grupos.map((grupo) => grupo.codigo),
      cantidadDocumentosOrigen: target.grupos.reduce((total, grupo) => total + grupo.documentos.length, 0),
      equivalencias: documento.equivalenciasCatalogo,
      variantes: documento.variantes,
      totalStock: documento.variantes.reduce((total, variante) => total + variante.cantidad, 0),
      documento,
      existente: target.existente,
      origenes: target.grupos.flatMap((grupo) => grupo.documentos),
    });
  }
  return { faltantes, plan };
}

function imprimirResumen({ faltantes, plan }, aplicar = false) {
  const resumen = {
    modo: aplicar ? "APLICAR" : "SIMULACIÓN (sin escrituras)",
    gruposPendientesDeMapeo: faltantes.map((grupo) => ({
      codigoRF: grupo.codigo,
      documentos: grupo.documentos.length,
    })),
    productos: plan.map(({ codigoLitton, codigosRF, cantidadDocumentosOrigen, equivalencias, variantes, totalStock }) => ({
      codigoLitton,
      codigosRF,
      cantidadDocumentosOrigen,
      equivalencias,
      variantes,
      totalStock,
    })),
  };
  console.log(JSON.stringify(resumen, null, 2));
}

async function aplicarPlan(plan) {
  if (!plan.length) return;
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const backupName = `productos_backup_litton_${runId}`;
  const backup = mongoose.connection.collection(backupName);
  const sources = new Map();
  for (const item of plan) {
    for (const source of item.origenes) sources.set(String(source._id), source);
    if (item.existente) sources.set(String(item.existente._id), item.existente);
  }
  await backup.insertMany([...sources.values()].map((document) => ({
    runId,
    sourceCollection: "productos",
    sourceId: document._id,
    backedUpAt: new Date(),
    document,
  })));

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const item of plan) {
        const { documento, origenes } = item;
        const { _id, ...fields } = documento;
        await Producto.collection.updateOne(
          { schemaVersion: 2, codigo: item.codigoLitton, archivado: { $ne: true } },
          { $set: fields, $setOnInsert: { createdAt: new Date() } },
          { upsert: true, session }
        );
        for (const source of origenes) {
          await Producto.collection.updateOne(
            { _id: source._id, archivado: { $ne: true } },
            { $set: { archivado: true, legacyArchivadoEn: new Date(), migrationRunId: runId } },
            { session }
          );
        }
      }
    });
  } finally {
    await session.endSession();
  }
  console.log(`Respaldo completo en ${backupName}.`);
}

async function main() {
  const options = argumentos(process.argv.slice(2));
  const mapeos = cargarMapeos(options.mappingPath);
  if (!process.env.MONGODB_URI) throw new Error("Falta MONGODB_URI.");
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const documentos = await buscarDocumentosRF();
    const resultado = await crearPlan(documentos, mapeos);
    imprimirResumen(resultado, options.aplicar);
    if (resultado.faltantes.length) {
      const codigos = resultado.faltantes.map((grupo) => grupo.codigo).join(", ");
      throw new Error(`Faltan mapeos manuales para: ${codigos}. Agregalos al JSON indicado con --mapping. No se aplicaron cambios.`);
    }
    if (options.aplicar) await aplicarPlan(resultado.plan);
    else console.log("Simulación terminada. Para aplicar, volver a ejecutar con --apply y un mapeo validado.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`Migración detenida: ${error.message}`);
  process.exitCode = 1;
});
