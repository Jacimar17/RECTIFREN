const Categoria = require("../models/Categoria");
const Producto = require("../models/Producto");
const httpError = require("../utils/http-error");

function generarSlug(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CATEGORIAS_BASE = [
  {
    nombre: "Pastillas de freno",
    slug: "pastillas-de-freno",
    descripcion: "Pastillas para freno a disco delanteras y traseras",
  },
  {
    nombre: "Cables comando",
    slug: "cables-comando",
    descripcion: "Cables de freno de mano, embrague, acelerador y selectora",
  },
  {
    nombre: "Bombas",
    slug: "bombas",
    descripcion: "Bombas de freno principales, embrague y dirección",
  },
  {
    nombre: "Cilindros de rueda",
    slug: "cilindros-de-rueda",
    descripcion: "Cilindros de freno para freno a tambor / campana",
  },
  {
    nombre: "Líquidos de freno",
    slug: "liquidos-de-freno",
    descripcion: "Fluidos hidráulicos para frenos y embrague",
    camposExtra: [
      {
        nombre: "tipo",
        tipo: "select",
        opciones: ["DOT 3", "DOT 4", "DOT 5.1"],
      },
      {
        nombre: "presentacion",
        tipo: "select",
        opciones: ["250 ml", "500 ml", "1 L"],
      },
    ],
  },
];

async function inicializarCategoriasBase() {
  const count = await Categoria.countDocuments();
  if (count === 0) {
    await Categoria.insertMany(CATEGORIAS_BASE);
  }
}

async function listar() {
  await inicializarCategoriasBase();
  return Categoria.find({ activa: { $ne: false } }).sort({ nombre: 1 }).lean();
}

async function crear({ nombre, descripcion = "", camposExtra = [] }) {
  if (!nombre || !nombre.trim()) {
    throw httpError(400, "El nombre de la categoría es obligatorio.");
  }
  const nombreLimpio = nombre.trim();
  const slug = generarSlug(nombreLimpio);

  const existente = await Categoria.findOne({
    $or: [{ nombre: nombreLimpio }, { slug }],
  });
  if (existente) {
    throw httpError(409, `La categoría "${nombreLimpio}" ya existe.`);
  }

  const categoria = await Categoria.create({
    nombre: nombreLimpio,
    slug,
    descripcion: descripcion.trim(),
    camposExtra: Array.isArray(camposExtra) ? camposExtra : [],
  });

  return categoria;
}

async function renombrar(id, nuevoNombre) {
  if (!nuevoNombre || !nuevoNombre.trim()) {
    throw httpError(400, "El nuevo nombre es obligatorio.");
  }
  const nombreLimpio = nuevoNombre.trim();
  const slug = generarSlug(nombreLimpio);

  const categoria = await Categoria.findById(id);
  if (!categoria) {
    throw httpError(404, "Categoría no encontrada.");
  }

  const duplicada = await Categoria.findOne({
    _id: { $ne: id },
    $or: [{ nombre: nombreLimpio }, { slug }],
  });
  if (duplicada) {
    throw httpError(409, `Ya existe otra categoría con el nombre "${nombreLimpio}".`);
  }

  const nombreAnterior = categoria.nombre;
  categoria.nombre = nombreLimpio;
  categoria.slug = slug;
  await categoria.save();

  // Actualizar referencias en los productos que tenían el nombre anterior
  if (nombreAnterior !== nombreLimpio) {
    await Producto.updateMany(
      { categoria: nombreAnterior },
      { $set: { categoria: nombreLimpio } }
    );
  }

  return categoria;
}

/**
 * Devuelve el documento de la categoría activa, o null si no existe o viene vacío.
 * Sirve para leer sus campos extra además de validar el nombre.
 */
async function obtenerActiva(nombre) {
  if (!nombre) return null;
  const limpio = String(nombre).trim().replace(/\s+/g, " ");
  if (!limpio) return null;
  const slug = generarSlug(limpio);
  return Categoria.findOne({
    $or: [{ nombre: limpio }, { slug }],
    activa: { $ne: false },
  });
}

/**
 * Verifica que una categoría exista en la colección y devuelve su nombre canónico.
 * Si no existe, lanza un 404 para que el cliente la cree antes de usarla.
 */
async function validarExistente(nombre) {
  if (!nombre) return "";
  const limpio = String(nombre).trim().replace(/\s+/g, " ");
  if (!limpio) return "";
  const categoria = await obtenerActiva(limpio);
  if (!categoria) {
    throw httpError(404, `La categoría "${limpio}" no existe. Creala desde el formulario antes de usarla.`);
  }
  return categoria.nombre;
}

module.exports = {
  listar,
  crear,
  renombrar,
  validarExistente,
  obtenerActiva,
  inicializarCategoriasBase,
  generarSlug,
  CATEGORIAS_BASE,
};

