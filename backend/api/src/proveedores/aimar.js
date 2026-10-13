const URL_BASE = "https://www.aimarrepuestos.com.ar/get_products.php";
const PAGE_SIZE = 12;
const MAX_PAGES = 5;

function terminos(codigo) {
  const value = String(codigo || "").trim();
  const digits = (value.match(/^\d+/) || [""])[0];
  const terms = [];
  if (digits) terms.push(digits);
  if (value && !terms.includes(value)) terms.push(value);
  return terms;
}

async function pedirPagina(titulo, pagina) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const body = new URLSearchParams({
      orden: "1",
      page: String(pagina),
      diametro: "",
      rosca: "",
      largo: "",
      title: titulo,
    });
    const start = (pagina - 1) * PAGE_SIZE;
    const response = await fetch(`${URL_BASE}?start=${start}&limit=${PAGE_SIZE}&order=1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Origin: "https://www.aimarrepuestos.com.ar",
        Referer: "https://www.aimarrepuestos.com.ar/productos",
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Aimar respondió ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Aimar tardó demasiado en responder");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function numeroPrecio(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  let normalized = String(value || "").trim();
  if (!normalized) return null;
  if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function mapear(product) {
  const data = product.data || {};
  const image = product.images?.[0]?.url;
  const stock = data.stock == null || data.stock === "" ? null : Number(data.stock);
  return {
    codigo: data.codigo || "",
    nombre: (data.description || "").trim(),
    marca: (data.rubro_titulo || "").trim(),
    precio: numeroPrecio(data.precio_final ?? data.precio),
    stockProveedor: Number.isFinite(stock) ? stock : null,
    medidas: [data.largo, data.altura, data.espesor].filter(Boolean).join(" x "),
    imagen: image && !/sin_imagen/i.test(image) ? image : null,
    link: product.link || null,
  };
}

async function buscarTermino(titulo) {
  const firstPage = await pedirPagina(titulo, 1);
  let products = firstPage.products || [];
  const pageCount = Math.min(Math.max(Number(firstPage.pages) || 1, 1), MAX_PAGES);
  if (pageCount > 1) {
    const pages = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, index) => pedirPagina(titulo, index + 2))
    );
    for (const page of pages) products = products.concat(page.products || []);
  }

  const unique = new Map();
  for (const product of products) {
    const data = product.data || {};
    const mapped = mapear(product);
    const key = data.cod || data.id || `${mapped.codigo}|${mapped.marca}`;
    if (mapped.codigo && !unique.has(key)) unique.set(key, mapped);
  }
  return [...unique.values()];
}

module.exports = async function buscarAimar(codigo) {
  for (const term of terminos(codigo)) {
    const items = await buscarTermino(term);
    if (items.length) return items;
  }
  return [];
};

module.exports.terminos = terminos;
