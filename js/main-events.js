import { $, setActiveChip, showToast } from "./ui.js";

export function bindMainEvents({ state, actions, searchDebounceMs }) {
  let searchTimer = null;
  const {
    adminLogin,
    adminLogout,
    applyTheme,
    bindMovSort,
    closeEquivModal,
    closeHistModal,
    closeLoginModal,
    doRender,
    invalidateSearch,
    loadMovs,
    loadStock,
    openLoginModal,
    productActions,
    startAutoRefresh,
    stopAutoRefresh,
    toggleCompact
  } = actions;

  function bindSortHeaders() {
    document.querySelectorAll("th.sortable").forEach(th => {
      th.addEventListener("click", () => {
        const col = th.dataset.col;
        if (state.sortCol === col) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        else { state.sortCol = col; state.sortDir = "asc"; }
        document.querySelectorAll("th.sortable").forEach(t => t.classList.remove("sort-asc","sort-desc"));
        th.classList.add(state.sortDir === "asc" ? "sort-asc" : "sort-desc");
        doRender();
      });
    });
  }

  $("search").addEventListener("input", () => {
    const val = $("search").value;
    const btn = $("btnClearSearch");
    if (btn) btn.style.display = val ? "flex" : "none";
    invalidateSearch();
    clearTimeout(searchTimer);
    if (!val.trim()) {
      state.rangeMin = null;
      state.rangeMax = null;
      if ($("rangeMin")) $("rangeMin").value = "";
      if ($("rangeMax")) $("rangeMax").value = "";
      if ($("rangeFilter")) $("rangeFilter").style.display = "none";
      if ($("btnAdvSearch")) $("btnAdvSearch").textContent = "⚡ Filtro stock";
      loadStock("");
      return;
    }
    searchTimer = setTimeout(() => loadStock(val.trim()), searchDebounceMs);
  });

  const btnClear = $("btnClearSearch");
  if (btnClear) btnClear.addEventListener("click", () => {
    $("search").value = "";
    btnClear.style.display = "none";
    $("search").focus();
    $("search").dispatchEvent(new Event("input"));
  });

  const btnExport = $("btnExport");
  if (btnExport) btnExport.addEventListener("click", () => {
    if (!state.cache.length) { showToast("No hay datos para exportar.", "info"); return; }
    const rows = [["CODIGO","MARCA","STOCK","UBICACION"]];
    for (const item of state.cache) rows.push([item.codigo||"", item.marca||"", String(item.stock||0), item.ubicacion === "NEGOCIO" ? "Negocio" : "Depósito/Galpón"]);
    const csv  = rows.map(r => r.map(c => `"${String(c).replaceAll('"','""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF"+csv], { type:"text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `rectifren_stock_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast("Stock exportado correctamente.", "success");
  });

  $("btnAdmin").addEventListener("click", () => {
    if (state.busy) return;
    if (state.isAdmin) adminLogout(); else openLoginModal();
  });

  $("btnTheme").addEventListener("click", () => {
    if (state.busy) return;
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  $("btnCloseModal").addEventListener("click", () => { if (!state.busy) closeLoginModal(); });
  $("btnCancel").addEventListener("click",      () => { if (!state.busy) closeLoginModal(); });
  $("btnLogin").addEventListener("click", adminLogin);
  $("adminPass").addEventListener("keydown", e => { if (e.key === "Enter") adminLogin(); });

  $("modalOverlay").addEventListener("click", e => {
    if (e.target === $("modalOverlay") && !state.busy) closeLoginModal();
  });

  $("movRange").addEventListener("change", loadMovs);

  const chipFilter = (filter, id) => () => {
    if (state.busy) return;
    state.viewFilter = filter; setActiveChip(id);
    const tb = document.getElementById("tbody");
    if (tb) {
      tb.classList.add("fading");
      setTimeout(() => { doRender(); tb.classList.remove("fading"); }, 120);
    } else { doRender(); }
  };
  $("fAll").addEventListener("click", chipFilter("all","fAll"));
  $("fOut").addEventListener("click", chipFilter("out","fOut"));
  $("fLow").addEventListener("click", chipFilter("low","fLow"));

  $("btnCompact")?.addEventListener("click", toggleCompact);

  $("btnAdvSearch")?.addEventListener("click", () => {
    const rf = $("rangeFilter");
    if (!rf) return;
    const visible = rf.style.display !== "none";
    rf.style.display = visible ? "none" : "flex";
    if (visible) { state.rangeMin = null; state.rangeMax = null; $("rangeMin").value=""; $("rangeMax").value=""; doRender(); }
    const btn = $("btnAdvSearch");
    if (btn) btn.textContent = visible ? "⚡ Filtro stock" : "⚡ Quitar filtro";
  });

  const applyRange = () => {
    const mn = $("rangeMin")?.value; const mx = $("rangeMax")?.value;
    state.rangeMin = mn !== "" && mn !== null ? Number(mn) : null;
    state.rangeMax = mx !== "" && mx !== null ? Number(mx) : null;
    doRender();
  };
  $("rangeMin")?.addEventListener("input", applyRange);
  $("rangeMax")?.addEventListener("input", applyRange);
  $("btnClearRange")?.addEventListener("click", () => {
    state.rangeMin = null; state.rangeMax = null;
    if ($("rangeMin")) $("rangeMin").value = "";
    if ($("rangeMax")) $("rangeMax").value = "";
    doRender();
  });

  bindMovSort();

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !state.busy) {
      if ($("betaLightbox")?.getAttribute("aria-hidden") === "false") return;
      if ($("modalOverlay").style.display === "flex") closeLoginModal();
      productActions.closeOpenModals();
      if ($("equivOverlay")?.style.display  === "flex") closeEquivModal();
      if ($("histOverlay")?.style.display  === "flex") closeHistModal();
    }
    if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
      e.preventDefault();
      $("search")?.focus();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoRefresh(); else startAutoRefresh();
  });

  bindSortHeaders();
}
