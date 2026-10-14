import { $ } from "./ui.js";

export function createInventoryRenderer({
  getState,
  renderFamilySummaries,
  renderStock,
  renderCards,
  pushUrlParams
}) {
  return function doRender() {
    const {
      cache,
      isAdmin,
      viewFilter,
      highlightKey,
      sortCol,
      sortDir,
      rangeMin,
      rangeMax,
      familyMemberIds,
      inventoryFamilies,
      inventoryLittonError
    } = getState();
    const query = $("search")?.value.trim() || "";
    const statsRow = $("statsRow");
    if (statsRow) statsRow.style.display = query ? "" : "none";
    const labels = document.querySelectorAll("#statsRow .stat-label");
    const defaultLabels = ["Total productos", "Unidades totales", "Sin stock", "Bajo stock", "En stock"];
    const searchLabels = ["Coincidencias cargadas", "Unidades encontradas", "Sin stock", "Bajo stock", "Con stock"];
    labels.forEach((label, index) => { label.textContent = query ? searchLabels[index] : defaultLabels[index]; });
    ["fAll", "fOut", "fLow", "btnAdvSearch"].forEach(id => {
      const control = $(id);
      if (control) control.disabled = !query;
    });
    const exportButton = $("btnExport");
    if (exportButton) exportButton.disabled = !query || cache.length === 0;
    const opts = {
      list: cache, isAdmin, viewFilter, query, highlightKey, sortCol, sortDir, rangeMin, rangeMax,
      familyMemberIds
    };
    const littonNotice = $("littonSearchNotice");
    if (littonNotice) {
      littonNotice.hidden = !inventoryLittonError || !query;
      littonNotice.textContent = inventoryLittonError
        ? `No se pudo ampliar esta búsqueda con Litton; se muestran las coincidencias locales disponibles. ${inventoryLittonError}`
        : "";
    }
    renderFamilySummaries(query ? inventoryFamilies : []);
    renderStock(opts);
    renderCards(opts);
    pushUrlParams(viewFilter);
  };
}
