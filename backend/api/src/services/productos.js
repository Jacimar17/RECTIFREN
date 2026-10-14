const productosRepository = require("../repositories/productos");
const movimientosRepository = require("../repositories/movimientos");
const { resolverFamiliasInventario, UBICACIONES } = require("../proveedores/familia-inventario");
const buscarLitton = require("../proveedores/litton");
const { resolverFamiliasLittonEnVivo } = require("../proveedores/familia-litton-en-vivo");
const httpError = require("../utils/http-error");
const {
  validarBusqueda,
  validarNuevoProducto,
  validarActualizacion,
  validarStockMinimo,
} = require("../validators/productos");
const { normalizarProducto } = require("./producto-view");

const SEARCH_LIMIT = 100;
const FAMILY_RESULT_LIMIT = 300;

function fusionarFamilias(familias) {
  const merged = [];
  for (const familia of familias) {
    const rows = new Map(familia.filas.map((row) => [row._id, row]));
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = merged.length - 1; index >= 0; index--) {
        if (!merged[index].filas.some((row) => rows.has(row._id))) continue;
        const [overlap] = merged.splice(index, 1);
        for (const row of overlap.filas) rows.set(row._id, row);
        changed = true;
      }
    }
    const filas = [...rows.values()].sort((a, b) =>
      a.codigo.localeCompare(b.codigo, "es", { numeric: true, sensitivity: "base" })
      || a.marca.localeCompare(b.marca, "es", { sensitivity: "base" })
    );
    const totales = filas.reduce((result, row) => {
      const stock = Number(row.stock);
      if (!Number.isFinite(stock)) return result;
      result[row.ubicacion] += stock;
      result.total += stock;
      return result;
    }, { NEGOCIO: 0, DEPOSITO_GALPON: 0, total: 0 });
    merged.push({ id: filas.map((row) => row._id).sort()[0], filas, totales });
  }
  return merged;
}

async function listar() {
  const productos = await productosRepository.listarOrdenados();
  return productos.map(normalizarProducto);
}

async function buscar(value) {
  const query = validarBusqueda(value);
  if (!query) return { data: [], familias: [], matchedIds: [] };

  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const direct = await productosRepository.buscarDirectos(regex, SEARCH_LIMIT);
  const hasMoreDirect = direct.length > SEARCH_LIMIT;
  const seeds = direct.slice(0, SEARCH_LIMIT);
  const inventario = await productosRepository.listarInventarioParaFamilias();
  const inventarioPorId = new Map(inventario.map((producto) => [String(producto._id), producto]));
  const expansionLitton = await resolverFamiliasLittonEnVivo(query, inventario, {
    buscarLitton,
    obtenerDetalle: buscarLitton.obtenerDetalle,
  });
  const familiasLocales = resolverFamiliasInventario(inventario, seeds);
  const familias = fusionarFamilias([
    ...familiasLocales,
    ...expansionLitton.familias,
  ]).filter((familia) => familia.filas.length > 1);

  const rowsById = new Map();
  for (const item of seeds) rowsById.set(String(item._id), item);
  for (const id of expansionLitton.matchedIds) {
    const original = inventarioPorId.get(id);
    if (original) rowsById.set(id, original);
  }
  for (const familia of familias) {
    for (const item of familia.filas) {
      const original = inventarioPorId.get(item._id);
      if (original) rowsById.set(item._id, original);
    }
  }

  const allResults = [...rowsById.values()].sort((a, b) =>
    String(a.codigo || a.CODIGO || "").localeCompare(
      String(b.codigo || b.CODIGO || ""), "es", { numeric: true, sensitivity: "base" }
    ) || String(a.marca || a.MARCA || "").localeCompare(String(b.marca || b.MARCA || ""), "es")
  );
  const hasMore = hasMoreDirect || allResults.length > FAMILY_RESULT_LIMIT;
  const results = allResults.slice(0, FAMILY_RESULT_LIMIT);
  return {
    data: results.map(normalizarProducto),
    familias: familias.map(({ id, filas, totales }) => ({ id, filas, totales })),
    matchedIds: [...new Set([
      ...seeds.map((item) => String(item._id)),
      ...expansionLitton.matchedIds,
    ])],
    littonError: expansionLitton.error,
    total: results.length,
    hasMore,
    query,
  };
}

async function agregar(body) {
  const input = validarNuevoProducto(body);
  const existe = await productosRepository.buscarPorCodigoMarca(input.codigo, input.marca);
  if (existe) throw httpError(409, `El producto ya existe: ${body.codigo} — ${body.marca}`);

  const stock = Number(input.stock);
  const producto = await productosRepository.crear({
    codigo: input.codigo,
    marca: input.marca,
    stock,
    equivalencias: input.equivalencias,
    ubicacion: input.ubicacion,
  });
  await movimientosRepository.crear({
    accion: "ALTA",
    productoId: producto._id,
    codigo: producto.codigo,
    marca: producto.marca,
    cantidad: stock,
    stock_anterior: 0,
    stock_nuevo: stock,
  });
  return normalizarProducto(producto);
}

async function actualizar(id, body) {
  const { codigo, marca, stock, equivalencias, ubicacion } = validarActualizacion(body);
  const producto = await productosRepository.buscarPorId(id);
  if (!producto) throw httpError(404, "Producto no encontrado.");

  const stockAntes = producto.stock !== undefined ? producto.stock : (producto.STOCK || 0);
  if (codigo) { producto.codigo = codigo.trim(); producto.CODIGO = codigo.trim(); }
  if (marca) { producto.marca = marca.trim(); producto.MARCA = marca.trim(); }
  if (stock !== undefined) { producto.stock = Number(stock); producto.STOCK = Number(stock); }
  if (equivalencias !== undefined) producto.equivalencias = equivalencias;
  if (ubicacion !== undefined) producto.ubicacion = ubicacion;
  await productosRepository.guardar(producto);

  if (stock !== undefined && Number(stock) !== stockAntes) {
    const normalizado = normalizarProducto(producto);
    await movimientosRepository.crear({
      accion: "AJUSTE",
      productoId: producto._id,
      codigo: normalizado.codigo,
      marca: normalizado.marca,
      cantidad: 0,
      stock_anterior: stockAntes,
      stock_nuevo: Number(stock),
    });
  }
  return normalizarProducto(producto);
}

async function eliminar(id) {
  const producto = await productosRepository.buscarPorId(id);
  if (!producto) throw httpError(404, "Producto no encontrado.");

  const normalizado = normalizarProducto(producto);
  await movimientosRepository.crear({
    accion: "BAJA",
    productoId: producto._id,
    codigo: normalizado.codigo,
    marca: normalizado.marca,
    cantidad: 0,
    stock_anterior: normalizado.stock,
    stock_nuevo: 0,
  });
  await productosRepository.eliminar(producto);
  return normalizado.codigo;
}

async function actualizarStockMinimo(id, value) {
  const minimo = validarStockMinimo(value);
  const producto = await productosRepository.buscarPorIdYActualizar(id, { stockMinimo: minimo });
  if (!producto) throw httpError(404, "Producto no encontrado.");
  return normalizarProducto(producto);
}

module.exports = {
  listar,
  buscar,
  agregar,
  actualizar,
  eliminar,
  actualizarStockMinimo,
  fusionarFamilias,
  normalizarProducto,
  UBICACIONES,
};
