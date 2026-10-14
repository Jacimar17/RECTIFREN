const { ubicacionEfectiva } = require("../proveedores/familia-inventario");
const { extraerEquivalencias } = require("../proveedores/busqueda-familia-litton");
const LITTON_IMAGE_BASE = "https://d3h8dra63998td.cloudfront.net/products/jpg/";

function normalizarCodigo(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function codigoInventario(producto) {
  return String(producto.codigo || producto.CODIGO || "").trim();
}

function grupoInventarioRF(producto) {
  const codigo = codigoInventario(producto);
  return /^RF[-/]?[A-Z0-9]+$/i.test(codigo) ? normalizarCodigo(codigo) : "";
}

function construirVariantes(productos) {
  const variantes = new Map();
  for (const producto of productos) {
    const marca = String(producto.marca || producto.MARCA || "").trim();
    if (!marca) throw new Error(`Falta la marca en el registro ${producto._id || codigoInventario(producto)}.`);
    const ubicacion = ubicacionEfectiva(producto);
    const cantidad = Number(producto.stock ?? producto.STOCK ?? 0);
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      throw new Error(`Stock inválido en ${codigoInventario(producto)} — ${marca}.`);
    }
    const stockMinimo = Number(producto.stockMinimo ?? 2);
    if (!Number.isFinite(stockMinimo) || stockMinimo < 0) {
      throw new Error(`Stock mínimo inválido en ${codigoInventario(producto)} — ${marca}.`);
    }
    const key = `${normalizarCodigo(marca)}|${ubicacion}`;
    const actual = variantes.get(key);
    if (actual) {
      actual.cantidad += cantidad;
      actual.stockMinimo = Math.min(actual.stockMinimo, stockMinimo);
    } else {
      variantes.set(key, {
        marca,
        ubicacion,
        cantidad,
        stockMinimo,
      });
    }
  }
  return [...variantes.values()].sort((a, b) =>
    a.marca.localeCompare(b.marca, "es", { sensitivity: "base" })
    || a.ubicacion.localeCompare(b.ubicacion)
  );
}

function construirProductoLitton(detalle, productos) {
  if (!detalle || typeof detalle.code !== "string" || !detalle.code.trim()) {
    throw new Error("Litton devolvió una ficha sin código principal.");
  }
  const variantes = construirVariantes(productos);
  const equivalenciasCatalogo = extraerEquivalencias(detalle).map((item) => ({
    codigo: item.codigo,
    marca: item.marca,
    productoLitton: detalle.code,
  }));
  const imagenLitton = typeof detalle.image === "string" && detailImageIsHttp(detalle.image)
    ? detalle.image
    : typeof detalle.image === "string" && detalle.image.trim()
      ? `${LITTON_IMAGE_BASE}${detalle.image.replace(/^\/+/, "")}`
      : "";
  const totalAntes = productos.reduce((total, producto) =>
    total + Number(producto.stock ?? producto.STOCK ?? 0), 0);
  const totalDespues = variantes.reduce((total, variante) => total + variante.cantidad, 0);
  if (totalAntes !== totalDespues) {
    throw new Error(`El stock cambió al agrupar ${detalle.code}: ${totalAntes} != ${totalDespues}.`);
  }
  return {
    schemaVersion: 2,
    archivado: false,
    codigo: detalle.code.trim(),
    marca: String(detalle.subcategory || "LITTON").trim(),
    fichaLitton: detalle,
    imagenLitton,
    equivalenciasCatalogo,
    variantes,
    stockMinimo: 2,
    equivalencias: "",
  };
}

function detailImageIsHttp(value) {
  return /^https?:\/\//i.test(value);
}

function prepararGrupos(productos, mapeos) {
  const grupos = new Map();
  for (const producto of productos) {
    const codigo = codigoInventario(producto);
    const key = grupoInventarioRF(producto);
    if (!key) continue;
    if (!grupos.has(key)) grupos.set(key, { key, codigo, documentos: [] });
    grupos.get(key).documentos.push(producto);
  }
  return [...grupos.values()].map((grupo) => ({
    ...grupo,
    codigoLitton: mapeos[grupo.key] || mapeos[grupo.codigo] || "",
  }));
}

module.exports = {
  construirProductoLitton,
  construirVariantes,
  grupoInventarioRF,
  normalizarCodigo,
  prepararGrupos,
};
