// Proveedor: Litton Brakes - búsqueda por vehículo (pastillas)
const VEHICLE_OPTIONS = "https://orders-dot-littonbrakes-services.rj.r.appspot.com/public/products/vehicle-select-options";
const ADVANCED_SEARCH = "https://orders-dot-littonbrakes-services.rj.r.appspot.com/public/products/advanced-search";
const IMG = "https://d3h8dra63998td.cloudfront.net/products/jpg/";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
let cache = {
  data: null,
  expiresAt: 0
};

function limpiarCache() {
  cache = {
    data: null,
    expiresAt: 0
  };
}

async function fetchJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Litton respondió ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Litton tardó demasiado en responder");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function normalizarMarcasModelos(json) {
  const brandsModels = Array.isArray(json?.brandsModels) ? json.brandsModels : [];
  const resultado = [];
  for (const item of brandsModels) {
    const marca = typeof item?.brand === "string" ? item.brand : "";
    if (!marca) continue;
    const modelosArr = Array.isArray(item?.models) ? item.models : [];
    const modelos = [];
    for (const m of modelosArr) {
      if (!m) continue;
      if (m.model === null || m.model === undefined) continue;
      if (typeof m.model !== "string") continue;
      modelos.push(m.model);
    }
    if (modelos.length) {
      resultado.push({ marca, modelos });
    }
  }
  return resultado;
}

async function obtenerMarcasModelos() {
  if (cache.data && Date.now() < cache.expiresAt) {
    return cache.data;
  }
  try {
    const json = await fetchJson(VEHICLE_OPTIONS);
    const normalizado = normalizarMarcasModelos(json);
    cache.data = normalizado;
    cache.expiresAt = Date.now() + CACHE_TTL_MS;
    return cache.data;
  } catch (e) {
    if (cache.data) {
      return cache.data;
    }
    throw e;
  }
}

function esResultadoLitton(item) {
  const marca = typeof item?.subcategory === "string" ? item.subcategory.toUpperCase() : "";
  const codigo = typeof item?.code === "string" ? item.code : "";
  // Descartar Remsa (códigos de 6 dígitos) - solo mostrar Litton
  if (/^\d{6}$/.test(codigo)) return false;
  if (marca === "REMSA") return false;
  return true;
}

async function buscarPorVehiculo({ marca, modelo, page = 1 } = {}) {
  const marcaLimpia = typeof marca === "string" ? marca : "";
  const modeloLimpio = typeof modelo === "string" ? modelo : "";
  if (!marcaLimpia) throw new Error("Falta la marca");
  if (!modeloLimpio) throw new Error("Falta el modelo");
  
  const pageNum = Number(page) || 1;
  const params = new URLSearchParams();
  params.set("lang", "arg");
  params.set("category", "PASTILLA DE FRENO");
  params.set("compatibilityBrand", marcaLimpia);
  params.set("compatibilityModel", modeloLimpio);
  params.set("page", String(pageNum));
  
  const url = `${ADVANCED_SEARCH}?${params.toString()}`;
  const json = await fetchJson(url, 10000);
  
  const results = Array.isArray(json?.results) ? json.results : [];
  const filtrados = results.filter(esResultadoLitton);
  
  const data = filtrados.map((r) => ({
    codigo: r.code || "",
    nombre: r.name || "",
    marca: r.subcategory || "",
    categoria: r.category || "",
    precio: r.price,
    imagen: r.image ? IMG + r.image : null,
    stockProveedor: r.stocklight || null,
    _id: r._id || null
  }));
  
  return {
    ok: true,
    query: { marca: marcaLimpia, modelo: modeloLimpio },
    page: json?.pagination?.page || pageNum,
    pagination: json?.pagination || {},
    total: data.length,
    data,
    errores: []
  };
}

module.exports = {
  obtenerMarcasModelos,
  buscarPorVehiculo,
  limpiarCache
};
