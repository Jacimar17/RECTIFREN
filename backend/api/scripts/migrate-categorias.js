#!/usr/bin/env node
/**
 * Migración de categorías para el inventario RECTIFREN.
 *
 * Asigna "Pastillas de freno" o "Cables comando" a los productos que todavía
 * no tienen categoría, usando SOLO reglas estrictas (ver
 * src/migrations/categorias.js). Lo que no se puede clasificar con certeza
 * queda sin categoría y se lista al final para revisarlo a mano.
 *
 * Modo de uso (por defecto es modo prueba: no escribe nada):
 *
 *   node scripts/migrate-categorias.js            # dry-run / simulación
 *   node scripts/migrate-categorias.js --apply    # aplica los cambios
 *
 * Requiere la variable de entorno MONGODB_URI (no se guarda en el repo).
 * Es idempotente: solo completa categorías vacías, nunca pisa las existentes.
 */

require("dotenv").config();

const mongoose = require("mongoose");
const Categoria = require("../src/models/Categoria");
const Producto = require("../src/models/Producto");
const { CATEGORIAS_BASE } = require("../src/services/categorias");
const {
  CAT_PASTILLAS,
  CAT_CABLES,
  clasificarProducto,
  resumenProducto,
} = require("../src/migrations/categorias");

const SIN_CATEGORIA = {
  $or: [{ categoria: { $exists: false } }, { categoria: null }, { categoria: "" }],
};

function argumentos(argv) {
  const options = { aplicar: false };
  for (const arg of argv) {
    if (arg === "--apply") options.aplicar = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  return options;
}

/** Crea las categorías base que falten. Idempotente (solo inserta faltantes). */
function asegurarCategoriasBase() {
  const operaciones = CATEGORIAS_BASE.map((categoria) => ({
    updateOne: {
      filter: { slug: categoria.slug },
      update: {
        $setOnInsert: {
          nombre: categoria.nombre,
          slug: categoria.slug,
          descripcion: categoria.descripcion || "",
          camposExtra: categoria.camposExtra || [],
          activa: true,
        },
      },
      upsert: true,
    },
  }));
  return Categoria.bulkWrite(operaciones);
}

async function main() {
  const { aplicar } = argumentos(process.argv.slice(2));

  if (!process.env.MONGODB_URI) {
    console.error("Falta la variable de entorno MONGODB_URI.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const base = mongoose.connection?.db?.databaseName || "?";
  console.log(`== Migración de categorías — ${aplicar ? "APLICAR" : "MODO PRUEBA (dry-run)"} ==`);
  console.log(`Base: ${base}`);
  if (!aplicar) console.log("No se escribirá nada. Usá --apply para aplicar los cambios.");

  // 1) Asegurar que existan las categorías base (incluye Pastillas y Cables).
  if (aplicar) {
    const resultado = await asegurarCategoriasBase();
    console.log(`\nCategorías base: ${CATEGORIAS_BASE.length} definidas, ${resultado.upsertedCount} creadas en esta corrida.`);
  } else {
    const existentes = await Categoria.countDocuments({ slug: { $in: CATEGORIAS_BASE.map((c) => c.slug) } });
    console.log(`\nCategorías base: ${existentes} de ${CATEGORIAS_BASE.length} ya existen (con --apply se crean las que falten).`);
  }

  // 2) Recorrer solo los productos sin categoría (nunca pisa las existentes).
  const productos = await Producto.find({ archivado: { $ne: true }, ...SIN_CATEGORIA })
    .select("codigo CODIGO marca MARCA descripcion titulo equivalencias fichaLitton categoria")
    .lean();

  const yaClasificados = await Producto.countDocuments({
    archivado: { $ne: true },
    categoria: { $nin: [null, ""] },
  });
  const archivados = await Producto.countDocuments({ archivado: true });

  console.log(`\nProductos sin categoría a evaluar: ${productos.length}`);
  console.log(`Productos que ya tenían categoría (se omiten): ${yaClasificados}`);
  console.log(`Productos archivados (se ignoran): ${archivados}\n`);

  const porCategoria = { [CAT_PASTILLAS]: [], [CAT_CABLES]: [] };
  const sinClasificar = [];

  for (const producto of productos) {
    const categoria = clasificarProducto(producto);
    if (categoria) porCategoria[categoria].push(producto);
    else sinClasificar.push(producto);
  }

  for (const [nombre, lista] of Object.entries(porCategoria)) {
    console.log(`${nombre}: ${lista.length}`);
    for (const producto of lista) console.log(`   + ${resumenProducto(producto)}`);
  }

  console.log(`\nSin categoría (revisar a mano): ${sinClasificar.length}`);
  for (const producto of sinClasificar) console.log(`   ? ${resumenProducto(producto)}`);

  if (!aplicar) {
    console.log("\nModo prueba: no se modificó ningún producto. Ejecutá con --apply para aplicar.");
    await mongoose.disconnect();
    return;
  }

  // 3) Aplicar: solo completa la categoría si el producto sigue sin ella.
  let aplicados = 0;
  if (productos.length) {
    const operaciones = productos.map((producto) => ({
      updateOne: {
        filter: { _id: producto._id, ...SIN_CATEGORIA },
        update: { $set: { categoria: clasificarProducto(producto) } },
      },
    }));
    const resultado = await Producto.bulkWrite(operaciones);
    aplicados = resultado.modifiedCount || 0;
  }

  console.log(`\nListo: ${aplicados} productos categorizados.`);
  console.log(`${sinClasificar.length} productos quedaron sin categoría; asignalos a mano desde el inventario.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Error en la migración:", error.message);
  process.exit(1);
});
