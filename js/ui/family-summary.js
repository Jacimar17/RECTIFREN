import { $, escapeHtml, ubicacionBadge } from "./dom.js";

export function renderFamilySummaries(families) {
  const container = $("familySummary");
  if (!container) return;
  if (!Array.isArray(families) || !families.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = families.map((family) => {
    const rows = family.filas.map((item) => {
      const location = item.ubicacion === "NEGOCIO" ? "NEGOCIO" : "DEPOSITO_GALPON";
      return `<li class="family-summary-row">
        <span class="family-summary-product"><strong>${escapeHtml(item.codigo || "Código s/d")}</strong> · ${escapeHtml(item.marca || "Marca no informada")}</span>
        ${ubicacionBadge(location)}
        <span class="family-summary-stock">${escapeHtml(String(item.stock ?? 0))} u.</span>
      </li>`;
    }).join("");
    const totals = family.totales || {};
    return `<article class="family-summary-card">
      <div class="family-summary-heading">
        <h2>Familia de códigos en tu inventario</h2>
        <div class="family-summary-totals">
          <span>Negocio: <strong>${escapeHtml(String(totals.NEGOCIO ?? 0))} u.</strong></span>
          <span>Depósito/Galpón: <strong>${escapeHtml(String(totals.DEPOSITO_GALPON ?? 0))} u.</strong></span>
          <span>Total: <strong>${escapeHtml(String(totals.total ?? 0))} u.</strong></span>
        </div>
      </div>
      <ul class="family-summary-rows">${rows}</ul>
    </article>`;
  }).join("");
}
