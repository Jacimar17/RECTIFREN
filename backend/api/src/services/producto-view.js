const { ubicacionEfectiva } = require("../proveedores/familia-inventario");

function normalizarVariante(producto, variante) {
  return {
    _id: producto._id,
    varianteId: variante._id,
    schemaVersion: 2,
    codigo: producto.codigo || producto.fichaLitton?.code || "",
    marca: variante.marca || "",
    stock: variante.cantidad ?? 0,
    ubicacion: variante.ubicacion,
    equivalencias: producto.equivalencias || "",
    equivalenciasCatalogo: producto.equivalenciasCatalogo || [],
    stockMinimo: variante.stockMinimo ?? 2,
    fichaLitton: producto.fichaLitton || {},
    imagenLitton: producto.imagenLitton || "",
    variantes: producto.variantes || [],
  };
}

function normalizarProducto(producto) {
  if (producto.schemaVersion === 2) {
    const variantes = producto.variantes || [];
    return {
      _id: producto._id,
      schemaVersion: 2,
      codigo: producto.codigo || producto.fichaLitton?.code || "",
      marca: producto.marca || producto.fichaLitton?.subcategory || "LITTON",
      stock: variantes.reduce((total, variante) => total + Number(variante.cantidad || 0), 0),
      ubicacion: "",
      equivalencias: producto.equivalencias || "",
      equivalenciasCatalogo: producto.equivalenciasCatalogo || [],
      stockMinimo: producto.stockMinimo ?? 2,
      fichaLitton: producto.fichaLitton || {},
      imagenLitton: producto.imagenLitton || "",
      variantes,
    };
  }
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

function normalizarProductos(producto) {
  if (producto.schemaVersion !== 2) {
    const normalizado = normalizarProducto(producto);
    return normalizado.archivado ? [] : [normalizado];
  }
  return (producto.variantes || []).map((variante) => normalizarVariante(producto, variante));
}

module.exports = { normalizarProducto, normalizarProductos, normalizarVariante };
