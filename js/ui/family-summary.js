import { $, escapeHtml, ubicacionBadge } from "./dom.js";

function specificationEntries(ficha) {
  const raw = ficha.specifications || ficha.specs || ficha.attributes || {};
  const entries = Array.isArray(raw)
    ? raw.map((item) => [
      item?.key_es || item?.name || item?.label || item?.taxonomy || item?.key,
      item?.value ?? item?.values ?? item?.terms,
    ])
    : Object.entries(raw);
  return entries.map(([label, value]) => {
    if (!label) return "";
    const values = Array.isArray(value)
      ? value.map((item) => typeof item === "object" ? item?.name || item?.value : item).filter(Boolean).join(", ")
      : typeof value === "object" && value !== null
        ? value.name || value.value || ""
        : value;
    return values === "" || values === undefined || values === null
      ? ""
      : `<span><strong>${escapeHtml(String(label))}:</strong> ${escapeHtml(String(values))}</span>`;
  }).filter(Boolean).slice(0, 8).join("");
}

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
    const ficha = family.fichaLitton || {};
    const aliases = (family.equivalenciasCatalogo || []).map((item) =>
      `<span><strong>${escapeHtml(item.codigo || "")}</strong>${item.marca ? ` · ${escapeHtml(item.marca)}` : ""}</span>`
    ).join("");
    const specifications = specificationEntries(ficha);
    const image = /^https:\/\//i.test(family.imagenLitton || "")
      ? `<img class="family-summary-image" src="${escapeHtml(family.imagenLitton)}" alt="${escapeHtml(ficha.name || family.id || "Producto Litton")}" loading="lazy">`
      : "";
    const catalog = ficha.name || aliases || image
      ? `<div class="family-summary-catalog">
          ${image}
          <div class="family-summary-identity">
            ${ficha.name ? `<strong>${escapeHtml(ficha.name)}</strong>` : ""}
            ${ficha.group ? `<span>Familia: ${escapeHtml(ficha.group)}</span>` : ""}
            ${ficha.category ? `<span>Categoría: ${escapeHtml(ficha.category)}</span>` : ""}
            ${ficha.brand || ficha.subcategory ? `<span>Marca de catálogo: ${escapeHtml(ficha.brand || ficha.subcategory)}</span>` : ""}
            ${specifications ? `<div class="family-summary-specs">${specifications}</div>` : ""}
            ${aliases ? `<div class="family-summary-aliases">${aliases}</div>` : ""}
          </div>
        </div>`
      : "";
    return `<article class="family-summary-card">
      <div class="family-summary-heading">
        <h2>${ficha.code ? `Ficha Litton · ${escapeHtml(ficha.code)}` : "Familia de códigos en tu inventario"}</h2>
        <div class="family-summary-totals">
          <span>Negocio: <strong>${escapeHtml(String(totals.NEGOCIO ?? 0))} u.</strong></span>
          <span>Depósito/Galpón: <strong>${escapeHtml(String(totals.DEPOSITO_GALPON ?? 0))} u.</strong></span>
          <span>Total: <strong>${escapeHtml(String(totals.total ?? 0))} u.</strong></span>
        </div>
      </div>
      ${catalog}
      <ul class="family-summary-rows">${rows}</ul>
    </article>`;
  }).join("");
}
