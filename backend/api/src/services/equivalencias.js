const productosRepository = require("../repositories/productos");
const httpError = require("../utils/http-error");
const { normalizarProducto } = require("./producto-view");

async function buscar(queryValue) {
  const query = (queryValue || "").trim();
  if (query.length < 1) return [];
  const regex = new RegExp(query, "i");
  const productos = await productosRepository.buscarCandidatos(regex);
  return productos.map(normalizarProducto);
}

async function obtener(productoId) {
  const producto = await productosRepository.buscarPorIdConEquivalentes(productoId);
  if (!producto) throw httpError(404, "Producto no encontrado.");

  const vinculados = (producto.equivalentesVinculados || [])
    .filter((equivalente) => !equivalente.archivado)
    .map(normalizarProducto);
  const textoLibre = (producto.equivalencias || "")
    .split(",").map((item) => item.trim()).filter(Boolean);
  return {
    vinculados,
    textoLibre,
    equivalenciasCatalogo: producto.equivalenciasCatalogo || [],
  };
}

async function vincular(productoId, { equivalenteId, equivalenteTexto }) {
  const producto = await productosRepository.buscarPorId(productoId);
  if (!producto) throw httpError(404, "Producto no encontrado.");

  if (equivalenteId) {
    const equivalente = await productosRepository.buscarPorId(equivalenteId);
    if (!equivalente) throw httpError(404, "Equivalente no encontrado.");

    if (!producto.equivalentesVinculados.includes(equivalenteId)) {
      producto.equivalentesVinculados.push(equivalenteId);
      await productosRepository.guardar(producto);
    }
    if (!equivalente.equivalentesVinculados.includes(producto._id)) {
      equivalente.equivalentesVinculados.push(producto._id);
      await productosRepository.guardar(equivalente);
    }
    return "Productos vinculados correctamente.";
  }

  if (equivalenteTexto) {
    const actual = (producto.equivalencias || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (!actual.includes(equivalenteTexto.trim())) {
      actual.push(equivalenteTexto.trim());
      producto.equivalencias = actual.join(", ");
      await productosRepository.guardar(producto);
    }
    return "Equivalencia de texto agregada.";
  }

  throw httpError(400, "Faltan datos: equivalenteId o equivalenteTexto.");
}

async function desvincular(productoId, { equivalenteId, equivalenteTexto }) {
  const producto = await productosRepository.buscarPorId(productoId);
  if (!producto) throw httpError(404, "Producto no encontrado.");

  if (equivalenteId) {
    producto.equivalentesVinculados = producto.equivalentesVinculados
      .filter((id) => id.toString() !== equivalenteId);
    await productosRepository.guardar(producto);

    const equivalente = await productosRepository.buscarPorId(equivalenteId);
    if (equivalente) {
      equivalente.equivalentesVinculados = equivalente.equivalentesVinculados
        .filter((id) => id.toString() !== producto._id.toString());
      await productosRepository.guardar(equivalente);
    }
    return "Vínculo eliminado.";
  }

  if (equivalenteTexto) {
    const actual = (producto.equivalencias || "").split(",").map((item) => item.trim()).filter(Boolean);
    producto.equivalencias = actual.filter((item) => item !== equivalenteTexto.trim()).join(", ");
    await productosRepository.guardar(producto);
    return "Equivalencia de texto eliminada.";
  }

  throw httpError(400, "Faltan datos.");
}

module.exports = { buscar, obtener, vincular, desvincular };
