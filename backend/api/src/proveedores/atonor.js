const BASE = "https://atonor.com.ar/";
const SETTINGS = encodeURIComponent(
  JSON.stringify({ search_source: "product", results_order_by: "title", catalog_visibility: true })
);

const normalizar = value => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function terminos(codigo) {
  const value = String(codigo || "").trim();
  const digits = (value.match(/^\d+/) || [""])[0];
  const terms = [];
  if (digits.length === 5) terms.push(digits.slice(0, 4));
  if (digits) terms.push(digits);
  if (value) terms.push(value);
  return [...new Set(terms)];
}

function coincide(codigoAtonor, codigoBuscado) {
  const atonor = normalizar(codigoAtonor);
  const buscado = normalizar(codigoBuscado);
  return Boolean(buscado && atonor.includes(buscado));
}

function textoPlano(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function numero(value) {
  let normalized = String(value || "").trim();
  if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(",", ".");
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

const slug = codigo => String(codigo)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

function imagenDe(html, productSlug) {
  const escapedSlug = productSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(
    `href=["'][^"']*/producto/${escapedSlug}/?["'][^>]*>\\s*<img([^>]*)>`, "i"
  ));
  if (!match) return null;
  const attrs = match[1];
  const source =
    (attrs.match(/data-lazy-src=["']([^"']+)["']/i) || [])[1] ||
    (attrs.match(/data-src=["']([^"']+)["']/i) || [])[1] ||
    (attrs.match(/\ssrc=["']([^"']+)["']/i) || [])[1];
  return source && !source.startsWith("data:") ? source : null;
}

function parsear(html) {
  const text = textoPlano(html);
  const blocks = text.split(/C[oó]digo:/i).slice(1);
  const items = [];
  for (const block of blocks) {
    const fields = block.match(/^\s*(.+?)\s+Proveedor:\s*(.+?)\s+Marca:\s*(.+?)\s+Modelo:\s*(.+?)\s+Descripci[oó]n:/i);
    if (!fields) continue;
    const price = block.match(/\$\s*([\d.,]+)/);
    const codigo = fields[1].trim();
    const productSlug = slug(codigo);
    items.push({
      codigo,
      marca: fields[2].trim(),
      nombre: `${fields[3].trim()} · ${fields[4].trim()}`,
      precio: price ? numero(price[1]) : null,
      imagen: imagenDe(html, productSlug),
      link: `https://atonor.com.ar/producto/${productSlug}/`,
    });
  }
  return items;
}

async function consultar(term) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const url = `${BASE}?s=${encodeURIComponent(term)}&jet_ajax_search_settings=${SETTINGS}&post_type=product`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RECTIFREN-beta)",
        "Accept-Language": "es-AR,es;q=0.9",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ATONOR respondió ${response.status}`);
    return await response.text();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("ATONOR tardó demasiado en responder");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function buscarAtonor(codigo) {
  for (const term of terminos(codigo)) {
    const html = await consultar(term);
    const items = parsear(html).filter(item => coincide(item.codigo, codigo));
    if (items.length) return items;
  }
  return [];
};

module.exports.terminos = terminos;
module.exports.parsear = parsear;
module.exports.coincide = coincide;
