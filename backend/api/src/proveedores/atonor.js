const BASE = "https://atonor.com.ar/wp-json/wc/store/v1/products";
const CATEGORIA_PASTILLAS = "22";
const MARCAS = new Set(["LITTON", "FRASLE", "LPR", "REMSA"]);
const normalizarCodigo = require("./normalizar-codigo");

function agregarUnico(lista, valor) {
  const term = String(valor || "").trim();
  if (term && !lista.some((item) => item.toUpperCase() === term.toUpperCase())) lista.push(term);
}

function terminosMarca(codigo, brand) {
  const value = String(codigo || "").trim();
  const compact = normalizarCodigo(value);
  const list = [];

  if (brand === "LITTON") {
    const match = compact.match(/^(\d{4})(\d)([A-Z]{2})$/);
    if (match) {
      const base = `L${match[1]}-${match[2]}-${match[3]}`;
      agregarUnico(list, base);
      if (match[3] === "NA") agregarUnico(list, `L${match[1]}-${match[2]}-ULTRA`);
    }
  } else if (brand === "FRASLE") {
    const match = value.toUpperCase().match(/^([A-Z]+)[/-](\d[A-Z0-9]*)$/);
    if (match) {
      agregarUnico(list, `${match[1]}-${match[2]}`);
    }
  } else if (brand === "LPR") {
    agregarUnico(list, `LPR${compact}`);
  } else if (brand === "REMSA") {
    const digits = compact.match(/^\d+$/)?.[0] || "";
    if (digits.length > 2) agregarUnico(list, `REMSA${digits.slice(0, -2)}-${digits.slice(-2)}`);
  }

  return list;
}

function terminos(codigo, marca = "") {
  const value = String(codigo || "").trim();
  const list = terminosMarca(codigo, String(marca || "").trim().toUpperCase());
  agregarUnico(list, value);
  agregarUnico(list, normalizarCodigo(value));
  return list;
}

function codigosEsperados(codigo, marca = "") {
  const brand = String(marca || "").trim().toUpperCase();
  const expected = new Set(terminos(codigo, brand).map(normalizarCodigo));
  const compact = normalizarCodigo(codigo);

  if (brand === "FRASLE") {
    const match = String(codigo || "").toUpperCase().match(/^([A-Z]+)[/-](\d[A-Z0-9]*)$/);
    if (match) expected.add(normalizarCodigo(`${match[1]}-${match[2]} S/A`));
  }
  if (brand === "REMSA") {
    const digits = compact.match(/^\d+$/)?.[0] || "";
    if (digits.length > 2) expected.add(normalizarCodigo(`REMSA${digits.slice(0, -2)}-${digits.slice(-2)}`));
  }

  return expected;
}

function coincide(codigoAtonor, codigoBuscado, marca = "") {
  const atonor = normalizarCodigo(codigoAtonor);
  return Boolean(atonor && codigosEsperados(codigoBuscado, marca).has(atonor));
}

function textoPlano(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#8211;|&ndash;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function marcaProveedor(producto) {
  const atributo = (producto.attributes || []).find((item) => item.taxonomy === "pa_proveedor");
  return (atributo?.terms || [])
    .map((term) => String(term.name || "").trim().toUpperCase())
    .find((marca) => MARCAS.has(marca)) || "";
}

function medidas(producto) {
  const text = textoPlano(producto.short_description || "");
  const partes = [];
  const dimensiones = [
    ["Largo", ["LARGO"]],
    ["Alto", ["ALTURA", "ALTO"]],
    ["Espesor", ["ESPESOR"]],
  ];
  for (const [label, aliases] of dimensiones) {
    for (const alias of aliases) {
      const match = text.match(new RegExp(`${alias}\\s*:\\s*([\\d.,]+\\s*MM?)`, "i"));
      if (match) {
        partes.push(`${label}: ${match[1].trim()}`);
        break;
      }
    }
  }
  return partes.join(" · ");
}

function mapear(producto, codigoConsultado) {
  const minorUnit = Number(producto.prices?.currency_minor_unit ?? 2);
  const price = Number(producto.prices?.price);
  const stockDisponible = typeof producto.is_in_stock === "boolean"
    ? producto.is_in_stock
    : null;
  return {
    codigo: producto.name || producto.sku || "",
    marca: marcaProveedor(producto),
    nombre: textoPlano(producto.description || producto.short_description || ""),
    medidas: medidas(producto),
    precio: Number.isFinite(price) ? price / (10 ** minorUnit) : null,
    stockDisponible,
    equivalencias: [codigoConsultado],
    imagen: producto.images?.[0]?.src || null,
    link: producto.permalink || null,
  };
}

async function consultar(term) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const params = new URLSearchParams({
      search: term,
      category: CATEGORIA_PASTILLAS,
      per_page: "100",
    });
    const response = await fetch(`${BASE}?${params}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RECTIFREN-beta)",
        "Accept-Language": "es-AR,es;q=0.9",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ATONOR respondió ${response.status}`);
    const productos = await response.json();
    if (!Array.isArray(productos)) throw new Error("ATONOR devolvió una respuesta inválida.");
    return productos;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("ATONOR tardó demasiado en responder");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function buscarCoincidencia(codigo, marca = "", consultarTermino = consultar) {
  if (typeof marca === "function") {
    consultarTermino = marca;
    marca = "";
  }
  const brand = String(marca || "").trim().toUpperCase();
  const specificTerms = terminosMarca(codigo, brand);
  const fallbackTerms = terminos(codigo, brand).slice(specificTerms.length);
  const itemsById = new Map();
  for (const term of [...specificTerms, ...fallbackTerms]) {
    const productos = await consultarTermino(term);
    for (const producto of productos) {
      const proveedor = marcaProveedor(producto);
      if (!proveedor) continue;

      const expected = codigosEsperados(codigo, marca || proveedor);
      const identifiers = [producto.sku, producto.name].filter(Boolean);
      if (!identifiers.some((identifier) => expected.has(normalizarCodigo(identifier)))) continue;

      const item = mapear(producto, codigo);
      if (marca && MARCAS.has(String(marca).trim().toUpperCase())) {
        item.marca = String(marca).trim().toUpperCase();
      }
      const key = String(producto.id || normalizarCodigo(item.codigo));
      itemsById.set(key, item);
    }
    if (itemsById.size && term === specificTerms[specificTerms.length - 1]) break;
  }
  return [...itemsById.values()];
}

module.exports = async function buscarAtonor(codigo, marca) {
  return buscarCoincidencia(codigo, marca);
};

module.exports.terminos = terminos;
module.exports.coincide = coincide;
module.exports.buscarCoincidencia = buscarCoincidencia;
module.exports.mapear = mapear;
