// Proveedor: Aimar Repuestos (listado interno get_products.php)
const URL_BASE = "https://www.aimarrepuestos.com.ar/get_products.php";
const URL_PAGINA = "https://www.aimarrepuestos.com.ar/productos";
const LIMITE = 12;
const MAX_PAGINAS = 5;

// Cabeceras parecidas a las de un navegador
const NAVEGADOR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "es-AR,es;q=0.9",
};

// Aimar usa sesión (cookie): se visita la página una vez y se reutiliza 10 minutos
let sesion = { cookie: "", hasta: 0 };

async function obtenerCookie() {
  if (sesion.cookie && Date.now() < sesion.hasta) return sesion.cookie;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(URL_PAGINA, { headers: NAVEGADOR, signal: ctrl.signal });
    const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    const valor = cookies.map((c) => c.split(";")[0]).join("; ");
    sesion = { cookie: valor, hasta: Date.now() + 10 * 60 * 1000 };
    return valor;
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

// Términos a probar para un código de Litton: 44980NA -> 44980
function terminos(codigo) {
  const c = String(codigo || "").trim();
  const digitos = (c.match(/^\d+/) || [""])[0];
  const lista = [];
  if (digitos) lista.push(digitos);
  if (c && !lista.includes(c)) lista.push(c);
  return lista;
}

async function pedirPagina(titulo, pagina) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const body = new URLSearchParams({
      orden: "1",
      page: String(pagina),
      diametro: "",
      rosca: "",
      largo: "",
      title: titulo,
    });
    const start = (pagina - 1) * LIMITE;
    const cookie = await obtenerCookie();
    const headers = {
      ...NAVEGADOR,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://www.aimarrepuestos.com.ar",
      Referer: `${URL_PAGINA}?orden=1&page=1&title=${encodeURIComponent(titulo)}`,
    };
    if (cookie) headers.Cookie = cookie;

    const res = await fetch(`${URL_BASE}?start=${start}&limit=${LIMITE}&order=1`, {
      method: "POST",
      headers,
      body,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detalle = (await res.text().catch(() => "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
      throw new Error(`Aimar respondió ${res.status}${detalle ? ": " + detalle : ""}`);
    }
    return await res.json();
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Aimar tardó demasiado en responder");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function redondear(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

function mapear(p) {
  const d = p.data || {};
  const img = p.images && p.images[0] && p.images[0].url;
  return {
    codigo:         d.codigo,
    nombre:         (d.description || "").trim(),
    marca:          (d.rubro_titulo || "").trim(),
    precio:         redondear(d.precio_final ?? d.precio),
    stockProveedor: Number(d.stock) || 0,
    medidas:        [d.largo, d.altura, d.espesor].filter(Boolean).join(" x "),
    imagen:         img && !/sin_imagen/i.test(img) ? img : null,
    link:           p.link || null,
  };
}

async function buscarTermino(titulo) {
  const primera = await pedirPagina(titulo, 1);
  let filas = primera.products || [];
  const paginas = Math.min(Number(primera.pages) || 1, MAX_PAGINAS);

  if (paginas > 1) {
    const resto = await Promise.allSettled(
      Array.from({ length: paginas - 1 }, (_, i) => pedirPagina(titulo, i + 2))
    );
    for (const r of resto) {
      if (r.status === "fulfilled") filas = filas.concat(r.value.products || []);
    }
  }

  // El listado repite el mismo producto una vez por cada vehículo: se deja uno solo
  const vistos = new Map();
  for (const p of filas) {
    const clave = p.data && (p.data.cod || p.data.id);
    if (clave && !vistos.has(clave)) vistos.set(clave, mapear(p));
  }
  return [...vistos.values()];
}

module.exports = async function buscarAimar(codigo) {
  for (const t of terminos(codigo)) {
    const items = await buscarTermino(t);
    if (items.length) return items;
  }
  return [];
};

module.exports.terminos = terminos;
