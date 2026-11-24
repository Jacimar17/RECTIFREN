const productosRepository = require("../repositories/productos");
const movimientosRepository = require("../repositories/movimientos");
const categoriasService = require("./categorias");
const { UBICACIONES, resolverFamiliasInventario } = require("../proveedores/familia-inventario");
const { resolverFamiliasCatalogo } = require("../proveedores/familias-catalogo-persistido");
const buscarLitton = require("../proveedores/litton");
const catalogoPastillas = require("./catalogo-pastillas");
const httpError = require("../utils/http-error");
const { familiasHabilitadas } = require("../utils/familias");
const { familiasCatalogoPersistidoHabilitadas } = require("../utils/familias-catalogo-persistido");
const {
  validarBusqueda,
  validarCatalogoPublico,
  validarNuevoProducto,
  validarActualizacion,
  validarStockMinimo,
  validarVariante,
} = require("../validators/productos");
const { normalizarProducto, normalizarProductos, normalizarVariante } = require("./producto-view");

const SEARCH_LIMIT = 100;
const FAMILY_RESULT_LIMIT = 300;

function categoriaNoPastillas(producto) {
  const categoria = String(producto.categoria || "").trim().toUpperCase();
  return categoria && !categoria.includes("PASTILL") ? categoria : "";
}

async function listar() {
  const productos = await productosRepository.listarOrdenados();
  return productos.flatMap(normalizarProductos);
}

async function buscar(value) {
  const query = validarBusqueda(value);
  if (!query) return { data: [], familias: [], matchedIds: [] };

  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const direct = await productosRepository.buscarDirectos(regex, SEARCH_LIMIT, {
    incluirFamilias: familiasHabilitadas(),
  });
  const hasMoreDirect = direct.length > SEARCH_LIMIT;
  const seeds = direct.slice(0, SEARCH_LIMIT);
  let allResults = seeds.flatMap(normalizarProductos);
  const persistedEnabled = familiasCatalogoPersistidoHabilitadas();
  const legacyEnabled = familiasHabilitadas();
  if (!persistedEnabled && !legacyEnabled) {
    const data = allResults.slice(0, FAMILY_RESULT_LIMIT);
    return {
      data,
      familias: [],
      matchedIds: seeds.map((item) => String(item._id)),
      total: data.length,
      hasMore: hasMoreDirect || allResults.length > FAMILY_RESULT_LIMIT,
      query,
      familiasDeshabilitadas: true,
    };
  }
  let familias = [];
  let familiasError = "";
  let catalogoVersion;
  let inventario;
  if (legacyEnabled) {
    inventario = await productosRepository.listarInventarioParaFamilias();
    const porCategoria = new Map();
    for (const producto of inventario) {
      const categoria = categoriaNoPastillas(producto);
      if (!categoria || producto.schemaVersion === 2) continue;
      if (!porCategoria.has(categoria)) porCategoria.set(categoria, []);
      porCategoria.get(categoria).push(producto);
    }
    const porId = new Map(inventario.map((producto) => [String(producto._id), producto]));
    const resultados = new Map(seeds.map((producto) => [String(producto._id), producto]));
    for (const [categoria, productos] of porCategoria) {
      const semillas = seeds.filter((producto) =>
        producto.schemaVersion !== 2 && categoriaNoPastillas(producto) === categoria);
      const locales = resolverFamiliasInventario(productos, semillas).filter((familia) => familia.filas.length > 1);
      familias.push(...locales);
      for (const familia of locales) {
        for (const fila of familia.filas) {
          const producto = porId.get(fila._id);
          if (producto) resultados.set(fila._id, producto);
        }
      }
    }
    allResults = [...resultados.values()].flatMap(normalizarProductos);
  }
  if (!persistedEnabled) {
    const data = allResults.slice(0, FAMILY_RESULT_LIMIT);
    return {
      data, familias, matchedIds: seeds.map((item) => String(item._id)),
      total: data.length, hasMore: hasMoreDirect || allResults.length > FAMILY_RESULT_LIMIT,
      query, familiasDeshabilitadas: true,
    };
  }
  try {
    const catalogo = await catalogoPastillas.obtenerCatalogoLocal();
    catalogoVersion = catalogo.version;
    if (!inventario) inventario = await productosRepository.listarInventarioParaFamilias();
    familias.push(...resolverFamiliasCatalogo(query, inventario.filter((producto) => !categoriaNoPastillas(producto)), catalogo.fichas));
  } catch (error) {
    const knownNames = new Set(["Error", "CatalogoLocalError", "MongoNetworkError", "MongoServerError", "MongooseError", "TypeError"]);
    const name = knownNames.has(error?.name) ? error.name : "Error";
    const rawCode = error?.code;
    const code = Number.isInteger(rawCode) && rawCode >= 0 && rawCode <= 99999
      ? rawCode
      : /^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH)$/i.test(String(rawCode || ""))
        ? String(rawCode)
        : undefined;
    console.error("No se pudo cargar una familia desde el catálogo local.", { name, ...(code ? { code } : {}) });
    familiasError = "No se pudo cargar la familia desde el catálogo local; se mantienen las coincidencias directas.";
  }
  const data = allResults.slice(0, FAMILY_RESULT_LIMIT);
  return {
    data,
    familias,
    matchedIds: seeds.map((item) => String(item._id)),
    ...(catalogoVersion !== undefined ? { catalogoVersion } : {}),
    ...(familiasError ? { familiasError } : {}),
    total: data.length,
    hasMore: hasMoreDirect || allResults.length > FAMILY_RESULT_LIMIT,
    query,
  };
}

/**
 * Filtra los campos extra que llegan del formulario dejando solo los que la
 * categoría declara. Si el campo define opciones, solo acepta valores de la lista.
 */
function normalizarCamposExtra(categoria, valor) {
  if (!categoria || !Array.isArray(categoria.camposExtra) || !valor || typeof valor !== "object") return {};
  const salida = {};
  for (const campo of categoria.camposExtra) {
    const nombre = String(campo?.nombre || "").trim();
    if (!nombre) continue;
    const bruto = valor[nombre];
    if (bruto === undefined || bruto === null) continue;
    const limpio = String(bruto).trim().slice(0, 80);
    if (!limpio) continue;
    if (Array.isArray(campo.opciones) && campo.opciones.length && !campo.opciones.includes(limpio)) continue;
    salida[nombre] = limpio;
  }
  return salida;
}

/** Suma la cantidad al stock de un producto que ya existe en la ubicación indicada. */
async function sumarStockExistente(producto, input, { categoria, camposExtra } = {}) {
  const cantidad = Number(input.stock);
  if (categoria && !producto.categoria) producto.categoria = categoria;
  if (camposExtra && Object.keys(camposExtra).length) {
    producto.camposExtra = { ...(producto.camposExtra || {}), ...camposExtra };
  }

  if (producto.schemaVersion === 2) {
    if (!Array.isArray(producto.variantes)) producto.variantes = [];
    const variante = producto.variantes.find((item) =>
      item.marca === input.marca && item.ubicacion === input.ubicacion
    );
    if (!variante) throw httpError(409, "No se pudo identificar la variante a la que sumar el stock.");
    const stockAntes = Number(variante.cantidad || 0);
    variante.cantidad = stockAntes + cantidad;
    await productosRepository.guardar(producto);
    if (cantidad !== 0) {
      await movimientosRepository.crear({
        accion: "ENTRADA",
        productoId: producto._id,
        codigo: producto.codigo,
        marca: variante.marca,
        ubicacion: variante.ubicacion,
        cantidad,
        stock_anterior: stockAntes,
        stock_nuevo: variante.cantidad,
      });
    }
    return normalizarVariante(producto, variante);
  }

  const stockAntes = producto.stock !== undefined && producto.stock !== null
    ? Number(producto.stock)
    : Number(producto.STOCK || 0);
  const stockNuevo = stockAntes + cantidad;
  producto.stock = stockNuevo;
  producto.STOCK = stockNuevo;
  await productosRepository.guardar(producto);
  const normalizado = normalizarProducto(producto);
  if (cantidad !== 0) {
    await movimientosRepository.crear({
      accion: "ENTRADA",
      productoId: producto._id,
      codigo: normalizado.codigo,
      marca: normalizado.marca,
      ubicacion: normalizado.ubicacion,
      cantidad,
      stock_anterior: stockAntes,
      stock_nuevo: stockNuevo,
    });
  }
  return normalizado;
}

async function agregar(body) {
  const input = validarNuevoProducto(body);
  // La categoría enviada debe existir en la colección "categorias".
  const categoriaDoc = await categoriasService.obtenerActiva(input.categoria);
  if (input.categoria && !categoriaDoc) {
    throw httpError(404, `La categoría "${input.categoria}" no existe. Creala desde el formulario antes de usarla.`);
  }
  const categoria = categoriaDoc ? categoriaDoc.nombre : "";
  const camposExtra = normalizarCamposExtra(categoriaDoc, body.camposExtra);

  const existe = await productosRepository.buscarPorCodigoMarca(input.codigo, input.marca, input.ubicacion);
  if (existe.length > 1) {
    throw httpError(409, `El código ${input.codigo} coincide con más de un producto.`);
  }
  if (existe.length === 1) {
    if (!input.sumarStock) {
      const error = httpError(409, `El producto ya existe: ${input.codigo} — ${input.marca}`);
      error.codigoExiste = true;
      throw error;
    }
    return sumarStockExistente(existe[0], input, { categoria, camposExtra });
  }

  const stock = Number(input.stock);
  const candidatosLitton = await productosRepository.buscarLittonPorCodigo(input.codigo);
  if (candidatosLitton.length > 1) {
    throw httpError(409, `El código ${input.codigo} coincide con más de un producto Litton.`);
  }
  if (candidatosLitton.length === 1) {
    const productoLitton = candidatosLitton[0];
    if (!Array.isArray(productoLitton.variantes)) productoLitton.variantes = [];
    // Solo se completa la categoría del documento Litton si todavía no tiene una.
    if (categoria && !productoLitton.categoria) productoLitton.categoria = categoria;
    if (input.descripcion && !productoLitton.descripcion) productoLitton.descripcion = input.descripcion;
    if (Object.keys(camposExtra).length) {
      productoLitton.camposExtra = { ...(productoLitton.camposExtra || {}), ...camposExtra };
    }
    if (productoLitton.variantes.some((item) =>
      item.marca === input.marca && item.ubicacion === input.ubicacion
    )) {
      throw httpError(409, `Ya existe una variante ${input.marca} en esa ubicación para ${input.codigo}.`);
    }
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
    descripcion: input.descripcion,
    stock,
    equivalencias: input.equivalencias,
    ubicacion: input.ubicacion,
    categoria,
    camposExtra,
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
  const { codigo, marca, stock, equivalencias, ubicacion, ubicacionOrig, categoria } = validarActualizacion(body);
  const producto = await productosRepository.buscarPorId(id);
  if (!producto) throw httpError(404, "Producto no encontrado.");

  // La categoría vive a nivel producto (también en los productos Litton).
  if (categoria !== undefined) {
    producto.categoria = await categoriasService.validarExistente(categoria);
  }

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
  if (ubicacion !== undefined) {
    producto.ubicacion = ubicacion;
    producto.ubicacionPendiente = false;
  }
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
  const { query, marca, page, limit } = validarCatalogoPublico(queryParams);
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
  normalizarProducto,
  UBICACIONES,
};
