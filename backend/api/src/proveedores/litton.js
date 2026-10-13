// Proveedor: Litton Brakes (catálogo público con equivalencias)
const BASE = "https://orders-dot-littonbrakes-services.rj.r.appspot.com/public/products/simple-search";
const PRODUCTO_BASE = "https://orders-dot-littonbrakes-services.rj.r.appspot.com/public/products";
const IMG  = "https://d3h8dra63998td.cloudfront.net/products/jpg/";

const MAX_RESULTADOS = 15;          // más que esto = búsqueda demasiado general
const PREFIJOS_NUMERICOS = ["PD/"]; // si escribís solo números, se prueba con estos prefijos primero

function variantes(entrada) {
  const q = entrada.trim();
  const limpio = q.replace(/\s+/g, "");
  const lista = [];
  const add = (v) => { if (v && !lista.includes(v)) lista.push(v); };

  // Solo números (ej: 528): probar primero con prefijo conocido
  if (/^\d+$/.test(limpio)) {
    PREFIJOS_NUMERICOS.forEach((p) => add(p + limpio));
  }

  add(q);
  add(limpio);

  // PD-528 / PD 528 / PD528 -> PD/528 (y variantes).
  // Se prueba también solo con la primera palabra, para códigos como "PD-528 S/A".
  const primero = q.split(/\s+/)[0];
  for (const base of [limpio, primero]) {
    const m = base.match(/^([A-Za-z]{1,4})[-\/]?(\d[0-9A-Za-z]*)$/);
    if (m) {
      const L = m[1].toUpperCase(), R = m[2].toUpperCase();
      add(`${L}/${R}`); add(`${L}-${R}`); add(`${L}${R}`);
    }
  }

  // LPR05P1379 -> 05P1379 (letras de marca adelante)
  const sinLetras = limpio.replace(/^[A-Za-z]{2,4}(?=\d)/, "");
  if (sinLetras !== limpio) add(sinLetras);

  return lista;
}

async function consultar(q) {
  const url = `${BASE}?lang=arg&substitutes=${encodeURIComponent(q)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
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

async function obtenerDetalle(codigo) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${PRODUCTO_BASE}/${encodeURIComponent(codigo)}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Litton respondió ${res.status} al consultar ${codigo}`);
    const detail = await res.json();
    if (!detail || typeof detail.code !== "string") {
      throw new Error(`Litton devolvió una ficha inválida para ${codigo}`);
    }
    return detail;
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`Litton tardó demasiado al consultar ${codigo}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

module.exports = async function buscarLitton(entrada) {
  let muyGeneral = 0;

  for (const v of variantes(entrada)) {
    const json  = await consultar(v);
    const total = json?.pagination?.total ?? 0;
    if (total === 0) continue;
    if (total > MAX_RESULTADOS) { muyGeneral = Math.max(muyGeneral, total); continue; }

    return (json.results || []).map((r) => ({
      codigo:         r.code,
      nombre:         r.name,
      marca:          r.subcategory,   // LITTON / REMSA
      categoria:      r.category,
      precio:         r.price,
      imagen:         r.image ? IMG + r.image : null,
      stockProveedor: r.stocklight,    // V / A / R (semáforo)
      busquedaUsada:  v,
    }));
  }

  if (muyGeneral) {
    throw new Error(`Búsqueda muy general (${muyGeneral} resultados). Escribí el código completo.`);
  }
  return [];
};

module.exports.obtenerDetalle = obtenerDetalle;
