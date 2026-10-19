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
  validarVariante,
} = require("../validators/productos");
const { normalizarProducto, normalizarProductos, normalizarVariante } = require("./producto-view");

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
  return productos.flatMap(normalizarProductos);
}

async function buscar(value) {
  const query = validarBusqueda(value);
  if (!query) return { data: [], familias: [], matchedIds: [] };

  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const direct = await productosRepository.buscarDirectos(regex, SEARCH_LIMIT);
  const hasMoreDirect = direct.length > SEARCH_LIMIT;
  const seeds = direct.slice(0, SEARCH_LIMIT);
  const inventario = (await productosRepository.listarInventarioParaFamilias())
    .filter((producto) => producto.schemaVersion !== 2);
  const littonSeeds = seeds.filter((producto) => producto.schemaVersion !== 2);
  const canonicalSeeds = seeds.filter((producto) => producto.schemaVersion === 2);
  const inventarioPorId = new Map(inventario.map((producto) => [String(producto._id), producto]));
  const expansionLitton = await resolverFamiliasLittonEnVivo(query, inventario, {
    buscarLitton,
    obtenerDetalle: buscarLitton.obtenerDetalle,
  });
  const familiasLocales = resolverFamiliasInventario(inventario, littonSeeds);
  const familias = fusionarFamilias([
    ...familiasLocales,
    ...expansionLitton.familias,
  ]).filter((familia) => familia.filas.length > 1);

  const rowsById = new Map();
  const agregarFilas = (producto) => {
    for (const item of normalizarProductos(producto)) {
      const key = producto.schemaVersion === 2
        ? `${producto._id}|${item.marca}|${item.ubicacion}`
        : String(item._id);
      rowsById.set(key, item);
    }
  };
  for (const item of littonSeeds) agregarFilas(item);
  const familiasLitton = [];
  for (const producto of canonicalSeeds) {
    const filas = normalizarProductos(producto);
    agregarFilas(producto);
    if (filas.length) {
      const totales = filas.reduce((result, row) => {
        const stock = Number(row.stock);
        if (!Number.isFinite(stock)) return result;
        result[row.ubicacion] += stock;
        result.total += stock;
        return result;
      }, { NEGOCIO: 0, DEPOSITO_GALPON: 0, total: 0 });
      familiasLitton.push({
        id: String(producto._id),
        filas,
        totales,
        fichaLitton: producto.fichaLitton || {},
        equivalenciasCatalogo: producto.equivalenciasCatalogo || [],
        imagenLitton: producto.imagenLitton || "",
      });
    }
  }
  for (const id of expansionLitton.matchedIds) {
    const original = inventarioPorId.get(id);
    if (original) agregarFilas(original);
  }
  for (const familia of familias) {
    for (const item of familia.filas) {
      const original = inventarioPorId.get(item._id);
      if (original) agregarFilas(original);
    }
  }

  const allResults = [...rowsById.values()].sort((a, b) =>
    String(a.codigo || a.CODIGO || "").localeCompare(
      String(b.codigo || b.CODIGO || ""), "es", { numeric: true, sensitivity: "base" }
    ) || String(a.marca || a.MARCA || "").localeCompare(String(b.marca || b.MARCA || ""), "es")
      || String(a.ubicacion || "").localeCompare(String(b.ubicacion || ""), "es")
  );
  const hasMore = hasMoreDirect || allResults.length > FAMILY_RESULT_LIMIT;
  const results = allResults.slice(0, FAMILY_RESULT_LIMIT);
  return {
    data: results,
    familias: [
      ...familias.map(({ id, filas, totales }) => ({ id, filas, totales })),
      ...familiasLitton,
    ],
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
  const existe = await productosRepository.buscarPorCodigoMarca(input.codigo, input.marca, input.ubicacion);
  if (existe.length) throw httpError(409, `El producto ya existe: ${body.codigo} — ${body.marca}`);

  const stock = Number(input.stock);
  const candidatosLitton = await productosRepository.buscarLittonPorCodigo(input.codigo);
  if (candidatosLitton.length > 1) {
    throw httpError(409, `El código ${input.codigo} coincide con más de un producto Litton.`);
  }
  if (candidatosLitton.length === 1) {
    const productoLitton = candidatosLitton[0];
    if (!Array.isArray(productoLitton.variantes)) productoLitton.variantes = [];
    const variante = {
      marca: input.marca,
      ubicacion: input.ubicacion,
      cantidad: stock,
      stockMinimo: 2,
    };
    productoLitton.variantes.push(variante);
    productoLitton.archivado = false;
    await productosRepository.guardar(productoLitton);
    await movimientosRepository.crear({
      accion: "ALTA",
      productoId: productoLitton._id,
      codigo: productoLitton.codigo,
      marca: variante.marca,
      ubicacion: variante.ubicacion,
      cantidad: stock,
      stock_anterior: 0,
      stock_nuevo: stock,
    });
    return normalizarVariante(
      productoLitton,
      productoLitton.variantes[productoLitton.variantes.length - 1]
    );
  }

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
    ubicacion: producto.ubicacion,
    cantidad: stock,
    stock_anterior: 0,
    stock_nuevo: stock,
  });
  return normalizarProducto(producto);
}

async function actualizar(id, body) {
  const { codigo, marca, stock, equivalencias, ubicacion, ubicacionOrig } = validarActualizacion(body);
  const producto = await productosRepository.buscarPorId(id);
  if (!producto) throw httpError(404, "Producto no encontrado.");

  if (producto.schemaVersion === 2) {
    if (codigo && codigo.trim() !== producto.codigo) {
      throw httpError(400, "El código principal Litton no se puede editar desde el inventario.");
    }
    const marcaOriginal = String(body.marcaOrig || marca || "").trim();
    const ubicacionOriginal = ubicacionOrig || ubicacion;
    const coincidencias = (producto.variantes || []).filter((item) =>
      item.marca === marcaOriginal && (!ubicacionOriginal || item.ubicacion === ubicacionOriginal)
    );
    if (coincidencias.length !== 1) {
      throw httpError(coincidencias.length ? 409 : 404, "No se pudo identificar una única variante para editar.");
    }
    const variante = coincidencias[0];
    const marcaNueva = String(body.nuevaMarca || marca || variante.marca).trim();
    const ubicacionNueva = ubicacion || variante.ubicacion;
    if ((producto.variantes || []).some((item) =>
      item !== variante && item.marca === marcaNueva && item.ubicacion === ubicacionNueva
    )) {
      throw httpError(409, `Ya existe una variante ${marcaNueva} en esa ubicación.`);
    }
    const stockAntes = Number(variante.cantidad || 0);
    variante.marca = marcaNueva;
    variante.ubicacion = ubicacionNueva;
    if (stock !== undefined) variante.cantidad = Number(stock);
    await productosRepository.guardar(producto);
    if (stock !== undefined && Number(stock) !== stockAntes) {
      await movimientosRepository.crear({
        accion: "AJUSTE",
        productoId: producto._id,
        codigo: producto.codigo,
        marca: variante.marca,
        ubicacion: variante.ubicacion,
        cantidad: 0,
        stock_anterior: stockAntes,
        stock_nuevo: Number(stock),
      });
    }
    return normalizarVariante(producto, variante);
  }

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
      ubicacion: normalizado.ubicacion,
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
  if (producto.schemaVersion === 2) {
    throw httpError(400, "Eliminá una variante específica del producto Litton.");
  }

  const normalizado = normalizarProducto(producto);
  await movimientosRepository.crear({
    accion: "BAJA",
    productoId: producto._id,
    codigo: normalizado.codigo,
    marca: normalizado.marca,
    ubicacion: normalizado.ubicacion,
    cantidad: 0,
    stock_anterior: normalizado.stock,
    stock_nuevo: 0,
  });
  await productosRepository.eliminar(producto);
  return normalizado.codigo;
}

async function actualizarStockMinimo(id, value, { marca, ubicacion } = {}) {
  const minimo = validarStockMinimo(value);
  if (marca) {
    const producto = await productosRepository.buscarPorId(id);
    if (!producto) throw httpError(404, "Producto no encontrado.");
    if (producto.schemaVersion === 2) {
      const variantes = (producto.variantes || []).filter((item) =>
        item.marca === marca && (!ubicacion || item.ubicacion === ubicacion)
      );
      if (variantes.length !== 1) {
        throw httpError(variantes.length ? 409 : 404, "No se pudo identificar una única variante.");
      }
      variantes[0].stockMinimo = minimo;
      await productosRepository.guardar(producto);
      return normalizarVariante(producto, variantes[0]);
    }
  }
  const producto = await productosRepository.buscarPorIdYActualizar(id, { stockMinimo: minimo });
  if (!producto) throw httpError(404, "Producto no encontrado.");
  return normalizarProducto(producto);
}

async function eliminarVariante(id, body) {
  const { marca, ubicacion } = validarVariante(body.marca, body.ubicacion);
  const producto = await productosRepository.buscarPorId(id);
  if (!producto) throw httpError(404, "Producto no encontrado.");
  if (producto.schemaVersion !== 2) {
    throw httpError(400, "El producto no usa variantes Litton.");
  }
  const variantes = (producto.variantes || []).filter((item) =>
    item.marca === marca && (!ubicacion || item.ubicacion === ubicacion)
  );
  if (variantes.length !== 1) {
    throw httpError(variantes.length ? 409 : 404, "No se pudo identificar una única variante.");
  }
  const [variante] = variantes;
  const stock = Number(variante.cantidad || 0);
  producto.variantes = producto.variantes.filter((item) => item !== variante);
  await productosRepository.guardar(producto);
  await movimientosRepository.crear({
    accion: "BAJA",
    productoId: producto._id,
    codigo: producto.codigo,
    marca: variante.marca,
    ubicacion: variante.ubicacion,
    cantidad: 0,
    stock_anterior: stock,
    stock_nuevo: 0,
  });
  return producto.codigo;
}

/**
 * Catálogo público (Fase 3)
 * Retorna ÚNICAMENTE: codigo, titulo, descripcion, marca, foto y precio.
 * Nunca expone costos, precios de proveedor, stock ni historial.
 */
async function catalogoPublico(queryParams = {}) {
  const query = (queryParams.q || "").trim();
  const marca = (queryParams.marca || "").trim();
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const { items, total } = await productosRepository.buscarCatalogoPublico({
    query,
    marca,
    skip,
    limit,
  });

  const data = items.map((p) => {
    const codigo = String(p.codigo || p.CODIGO || p.fichaLitton?.code || "").trim();
    const marcaPrincipal = String(p.marca || p.MARCA || p.fichaLitton?.subcategory || "LITTON").trim();
    const titulo = String(p.titulo || (codigo ? `Repuesto ${codigo}` : "")).trim();
    const descripcion = String(
      p.descripcion || p.fichaLitton?.description || p.equivalencias || ""
    ).trim();
    const foto = String(p.foto || p.imagenLitton || "").trim();
    const precio = typeof p.precio === "number" ? p.precio : 0;

    return {
      codigo,
      titulo,
      descripcion,
      marca: marcaPrincipal,
      foto,
      precio,
    };
  });

  return {
    data,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
    limit,
  };
}

module.exports = {
  catalogoPublico,
  listar,
  buscar,
  agregar,
  actualizar,
  eliminar,
  actualizarStockMinimo,
  eliminarVariante,
  fusionarFamilias,
  normalizarProducto,
  UBICACIONES,
};
