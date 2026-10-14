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

function validarNuevoProducto(body) {
  const { codigo, marca, stock = 0, equivalencias = "" } = body;
  if (!codigo || !marca) throw httpError(400, "Faltan campos: codigo, marca.");
  const ubicacion = body.ubicacion || ubicacionPredeterminada({ codigo });
  if (!Object.values(UBICACIONES).includes(ubicacion)) {
    throw httpError(400, "La ubicación del producto no es válida.");
  }
  return { codigo: codigo.trim(), marca: marca.trim(), stock, equivalencias, ubicacion };
}

function validarActualizacion(body) {
  const { codigo, marca, stock, equivalencias, ubicacion } = body;
  if (ubicacion !== undefined && !Object.values(UBICACIONES).includes(ubicacion)) {
    throw httpError(400, "La ubicación del producto no es válida.");
  }
  return { codigo, marca, stock, equivalencias, ubicacion };
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
};
