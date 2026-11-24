import { $, escapeHtml, ubicacionBadge } from "./dom.js";

let showZeroStockRows = false;
let currentFamilies = [];
let toggleBound = false;

export function isZeroStockRow(item) {
  if (item.stock === null || item.stock === undefined || item.stock === "") return false;
  const stock = Number(item.stock);
  return Number.isFinite(stock) && stock === 0;
}

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
  const nextFamilies = Array.isArray(families) ? families : [];
  if (nextFamilies !== currentFamilies) showZeroStockRows = false;
  currentFamilies = nextFamilies;
  if (!toggleBound) {
    container.addEventListener("click", (event) => {
      if (!event.target.closest("[data-family-zero-toggle]")) return;
      showZeroStockRows = !showZeroStockRows;
      renderFamilySummaries(currentFamilies);
    });
    toggleBound = true;
  }
  if (!currentFamilies.length) {
    container.innerHTML = "";
    return;
  }

  const hiddenRows = currentFamilies.reduce((total, family) =>
    total + (Array.isArray(family.filas) ? family.filas.filter(isZeroStockRow).length : 0), 0);
  const controls = hiddenRows
    ? `<div class="family-summary-controls">
        <button type="button" class="btn-export" data-family-zero-toggle aria-expanded="${showZeroStockRows}">
          ${showZeroStockRows ? "Ocultar resultados sin stock" : `Mostrar resultados ocultos (${hiddenRows})`}
        </button>
      </div>`
    : "";
  const displayedFamilies = currentFamilies.map((family) => ({
    ...family,
    filas: (Array.isArray(family.filas) ? family.filas : [])
      .filter((item) => showZeroStockRows || !isZeroStockRow(item)),
  })).filter((family) => family.filas.length);

  container.innerHTML = `${controls}${displayedFamilies.map((family) => {
    const rows = family.filas.map((item) => {
      const stock = item.stock === null || item.stock === undefined || item.stock === ""
        ? "s/d"
        : String(item.stock);
      return `<li class="family-summary-row">
        <span class="family-summary-product"><strong>${escapeHtml(item.codigo || "Código s/d")}</strong> · ${escapeHtml(item.marca || "Marca no informada")}</span>
        ${ubicacionBadge(item.ubicacion)}
        <span class="family-summary-stock">${escapeHtml(stock)}${stock === "s/d" ? "" : " u."}</span>
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
          ${totals.SIN_UBICACION ? `<span>Sin ubicación: <strong>${escapeHtml(String(totals.SIN_UBICACION))} u.</strong></span>` : ""}
          <span>Total: <strong>${escapeHtml(String(totals.total ?? 0))} u.</strong></span>
        </div>
      </div>
      ${catalog}
      <ul class="family-summary-rows">${rows}</ul>
    </article>`;
  }).join("")}`;
}
