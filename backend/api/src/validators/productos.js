const httpError = require("../utils/http-error");
const { UBICACIONES, ubicacionPredeterminada } = require("../proveedores/familia-inventario");

function validarBusqueda(value) {
  if (value !== undefined && typeof value !== "string") {
    throw httpError(400, "El término de búsqueda no es válido.");
  }
  const query = (value || "").trim();
  if (query.length > 100) throw httpError(400, "La búsqueda no puede superar 100 caracteres.");
  return query;
}

function validarCategoria(valor) {
  if (valor === undefined || valor === null) return "";
  if (typeof valor !== "string") throw httpError(400, "La categoría no es válida.");
  const limpio = valor.trim().replace(/\s+/g, " ");
  if (!limpio) return "";
  if (limpio.length > 80) throw httpError(400, "El nombre de la categoría no puede superar 80 caracteres.");
  return limpio;
}

/**
 * Normaliza un código de producto: sin espacios de más y en mayúsculas.
 * La búsqueda en proveedores (beta) compara códigos en mayúsculas, por eso
 * conviene guardarlos siempre igual.
 */
function normalizarCodigo(valor) {
  return String(valor || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function validarDescripcion(valor) {
  if (valor === undefined || valor === null) return "";
  if (typeof valor !== "string") throw httpError(400, "La descripción no es válida.");
  const limpio = valor.trim();
  if (limpio.length > 500) throw httpError(400, "La descripción no puede superar 500 caracteres.");
  return limpio;
}

function validarNuevoProducto(body) {
  const marca = String(body.marca || "").trim();
  const stock = body.stock === undefined ? 0 : body.stock;
  const equivalencias = body.equivalencias || "";
  const codigo = normalizarCodigo(body.codigo);
  if (!codigo) throw httpError(400, "El código es obligatorio.");
  if (!marca) throw httpError(400, "La marca es obligatoria.");
  const cantidad = Number(stock);
  if (!Number.isFinite(cantidad) || cantidad < 0) {
    throw httpError(400, "La cantidad debe ser un número mayor o igual a 0.");
  }
  const ubicacion = body.ubicacion || ubicacionPredeterminada({ codigo });
  if (!Object.values(UBICACIONES).includes(ubicacion)) {
    throw httpError(400, "La ubicación del producto no es válida.");
  }
  return {
    codigo,
    marca,
    stock: cantidad,
    equivalencias,
    ubicacion,
    descripcion: validarDescripcion(body.descripcion),
    categoria: validarCategoria(body.categoria),
    // Permite sumar la cantidad a un producto ya existente en vez de fallar.
    sumarStock: body.sumarStock === true || body.sumarStock === "true",
  };
}

function validarActualizacion(body) {
  const { codigo, marca, stock, equivalencias, ubicacion, ubicacionOrig } = body;
  for (const value of [ubicacion, ubicacionOrig]) {
    if (value !== undefined && !Object.values(UBICACIONES).includes(value)) {
      throw httpError(400, "La ubicación del producto no es válida.");
    }
  }
  if (stock !== undefined && (!Number.isFinite(Number(stock)) || Number(stock) < 0)) {
    throw httpError(400, "El stock debe ser un número no negativo.");
  }
  // Si no viene la categoría se deja como está; si viene vacía se quita.
  const categoria = body.categoria === undefined ? undefined : validarCategoria(body.categoria);
  return { codigo, marca, stock, equivalencias, ubicacion, ubicacionOrig, categoria };
}

function validarVariante(marca, ubicacion) {
  if (!marca || typeof marca !== "string" || !marca.trim()) {
    throw httpError(400, "La marca de la variante es obligatoria.");
  }
  if (ubicacion !== undefined && !Object.values(UBICACIONES).includes(ubicacion)) {
    throw httpError(400, "La ubicación del producto no es válida.");
  }
  return { marca: marca.trim(), ubicacion };
}

function validarStockMinimo(value) {
  const minimo = Number(value);
  if (isNaN(minimo) || minimo < 0) throw httpError(400, "Valor inválido.");
  return minimo;
}

module.exports = {
  validarBusqueda,
  validarNuevoProducto,
  validarActualizacion,
  validarStockMinimo,
  validarVariante,
  validarCategoria,
  normalizarCodigo,
  validarDescripcion,
};
