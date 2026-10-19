export const $ = (id) => document.getElementById(id);

export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function fmtDate(iso) {
  try { return new Date(iso).toLocaleString("es-AR"); } catch { return iso; }
}

export function getStockState(item) {
  const s   = Number(item.stock || 0);
  const min = Number(item.stockMinimo !== undefined ? item.stockMinimo : 2);
  if (s === 0)    return "out";
  if (s <= min)   return "low";
  return "ok";
}

export function ubicacionBadge(ubicacion) {
  const enNegocio = ubicacion === "NEGOCIO";
  const label = enNegocio ? "Negocio" : "Depósito/Galpón";
  return `<span class="inventory-location-badge ${enNegocio ? "inventory-location-business" : "inventory-location-depot"}">${label}</span>`;
}

/** Normaliza un código de producto: sin espacios de más y en mayúsculas. */
export function normalizarCodigo(valor) {
  return String(valor ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function ubicacionLabel(ubicacion) {
  return ubicacion === "NEGOCIO" ? "Negocio" : "Depósito/Galpón";
}
