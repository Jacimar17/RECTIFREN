const { ubicacionEfectiva } = require("../proveedores/familia-inventario");

function normalizarProducto(producto) {
  return {
    _id: producto._id,
    codigo: producto.codigo || producto.CODIGO || "",
    marca: producto.marca || producto.MARCA || "",
    stock: producto.stock !== undefined && producto.stock !== null
      ? producto.stock
      : (producto.STOCK !== undefined ? producto.STOCK : 0),
    ubicacion: ubicacionEfectiva(producto),
    equivalencias: producto.equivalencias || "",
    stockMinimo: producto.stockMinimo !== undefined ? producto.stockMinimo : 2,
  };
}

module.exports = { normalizarProducto };
