import {
  apiGet, apiPostForm,
  apiIniciarSincronizacionLitton, apiEstadoSincronizacionLitton
} from "./api.js";
import {
  $,
  renderStock, setBusy, setActiveChip,
  showToast, updateStats, showSkeleton, updateChipCounts, renderCards, renderFamilySummaries, escapeHtml
} from "./ui.js";
import { createEquivalencesController } from "./equivalences.js";
import { createMovementController } from "./movements.js";
import { bindBetaModal } from "./beta.js?v=20260644";
import { createProductActions } from "./product-actions.js";

let cache       = [];
let isAdmin     = false;
let viewFilter  = "all";
let busy        = false;
let highlightKey = null;
let sortCol     = null;
let sortDir     = "asc";
let autoRefreshTimer = null;
let searchTimer = null;
let stockRequestId = 0;
let searchHasMore = false;
let inventoryFamilies = [];
let familyMemberIds = new Set();
let familySyncRunning = false;
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutos
const SEARCH_DEBOUNCE_MS = 250;
const movements = createMovementController({ getIsAdmin: () => isAdmin });
const { loadMovs, openHistModal, bindMovSort, bindHistModal, closeHistModal } = movements;
const { openEquivModal, bind: bindEquivModal } = createEquivalencesController({ getAdminToken });
const productActions = createProductActions({
  getAdminToken,
  adminLogout: () => adminLogout(),
  isBusy: () => busy,
  setBusyState,
  loadStock,
  loadMovs,
  setLastUpdatedNow,
  setHighlightKey: value => { highlightKey = value; },
  openHistModal,
  openEquivModal
});

/* ===== URL params ===== */
function readUrlParams() {
  const p = new URLSearchParams(location.search);
  const f = p.get("filter");
  const q = p.get("q");
  if (f && ["all","out","low"].includes(f)) viewFilter = f;
  if (q) { const s = $("search"); if (s) { s.value = q; $("btnClearSearch") && ($("btnClearSearch").style.display = "flex"); } }
  const chipMap = { all:"fAll", out:"fOut", low:"fLow" };
  setActiveChip(chipMap[viewFilter] || "fAll");
}

function pushUrlParams() {
  const q = $("search")?.value || "";
  const p = new URLSearchParams();
  if (viewFilter !== "all") p.set("filter", viewFilter);
  if (q) p.set("q", q);
  const str = p.toString();
  history.replaceState(null, "", str ? `?${str}` : location.pathname);
}

/* ===== Sesión ===== */
const ADMIN_SESSION_KEY = "rectifren_admin_session";
let adminSession = null;
let sessionExpiryTimer = null;

function scheduleSessionExpiry() {
  if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
  const remaining = (adminSession?.expiresAt || 0) - Date.now();
  if (remaining <= 0) return;
  sessionExpiryTimer = setTimeout(() => {
    adminLogout();
    showToast("La sesión venció. Ingresá nuevamente.", "info");
  }, remaining);
}

function restoreAdminSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || "null");
    if (saved?.token && Number.isFinite(saved.expiresAt) && saved.expiresAt > Date.now()) {
      adminSession = saved;
      scheduleSessionExpiry();
      return true;
    }
  } catch { /* sesión inválida */ }
  localStorage.removeItem(ADMIN_SESSION_KEY);
  adminSession = null;
  return false;
}

function getAdminToken() {
  return adminSession?.expiresAt > Date.now() ? adminSession.token : "";
}

function saveAdminSession(token, expiresAt) {
  adminSession = { token, expiresAt };
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(adminSession));
  scheduleSessionExpiry();
}

function clearAdminSession() {
  if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
  sessionExpiryTimer = null;
  adminSession = null;
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

function setBusyState(on, text) { busy = on; setBusy(on, text); }

function setAdminButtonState() {
  const btn = $("btnAdmin"); if (!btn) return;
  btn.textContent = isAdmin ? "Cerrar sesión" : "Administrador";
  btn.title       = isAdmin ? "Cerrar sesión de administrador" : "Ingresar como administrador";
  const addButton = $("btnAddProduct");
  if (addButton) addButton.style.display = isAdmin ? "flex" : "none";
  const syncButton = $("btnSyncFamilies");
  if (syncButton) syncButton.style.display = isAdmin ? "inline-flex" : "none";
}

function setLastUpdatedNow() {
  const el = $("lastUpdated"); if (!el) return;
  el.textContent = `Última actualización: ${new Date().toLocaleString("es-AR")}`;
}

/* ===== Tema ===== */
function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("rectifren_theme", t);
  const btn = $("btnTheme");
  if (btn) btn.textContent = t === "dark" ? "☀️" : "🌙";
}

function initTheme() {
  const saved = localStorage.getItem("rectifren_theme");
  if (saved === "dark" || saved === "light") { applyTheme(saved); return; }
  applyTheme(window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

/* ===== Render ===== */
let rangeMin = null;
let rangeMax = null;

function doRender() {
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
  renderFamilySummaries(query ? inventoryFamilies : []);
  renderStock(opts);
  renderCards(opts);
  pushUrlParams();
}

/* ===== Notificaciones ===== */
let notifPermission = false;

async function requestNotifPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") { notifPermission = true; return; }
  if (Notification.permission !== "denied") {
    const perm = await Notification.requestPermission();
    notifPermission = perm === "granted";
  }
}

function checkNewOutOfStock(oldCache, newCache) {
  if (!notifPermission) return;
  const wasOut = new Set(oldCache.filter(i => Number(i.stock||0) === 0).map(i => `${i.codigo}|${i.marca}`));
  const nowOut = newCache.filter(i => Number(i.stock||0) === 0);
  const nuevos = nowOut.filter(i => !wasOut.has(`${i.codigo}|${i.marca}`));
  for (const item of nuevos) {
    new Notification("⚠ RECTIFREN — Sin stock", {
      body: `${item.codigo} (${item.marca}) quedó sin stock.`,
      icon: "assets/logo_rectifren.png"
    });
  }
}

/* ===== Auto-refresh ===== */
function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(async () => {
    const query = $("search")?.value.trim() || "";
    if (busy || !query) return;
    await loadStock(query, { notify: true });
  }, AUTO_REFRESH_MS);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
}

/* ===== Carga stock ===== */
async function loadStock(query = $("search")?.value.trim() || "", { notify = false } = {}) {
  const requestId = ++stockRequestId;
  if (!query) {
    searchHasMore = false;
    cache = [];
    inventoryFamilies = [];
    familyMemberIds = new Set();
    updateChipCounts(cache);
    doRender();
    $("status").textContent = "Escribí un código o marca para buscar.";
    return;
  }

  const oldCache = [...cache];
  searchHasMore = false;
  if (!notify) {
    cache = [];
    inventoryFamilies = [];
    familyMemberIds = new Set();
    updateChipCounts(cache);
    doRender();
  }
  $("status").textContent = `Buscando "${query}"...`;
  if (!notify) showSkeleton(10);
  try {
    const data = await apiGet({ action: "search", q: query });
    if (requestId !== stockRequestId) return;
    if (!data.ok) {
      $("status").textContent = `Error: ${data.error || "No se pudo cargar."}`;
      showToast(data.error || "No se pudo cargar el stock.", "error");
      return;
    }
    cache = data.data || [];
    inventoryFamilies = Array.isArray(data.familias) ? data.familias : [];
    familyMemberIds = new Set([
      ...(Array.isArray(data.matchedIds) ? data.matchedIds.map(String) : []),
      ...inventoryFamilies.flatMap((family) =>
        Array.isArray(family.filas) ? family.filas.map((item) => String(item._id)) : []
      )
    ]);
    searchHasMore = Boolean(data.hasMore);
    updateStats(cache);
    updateChipCounts(cache);
    doRender();
    if (searchHasMore) {
      $("status").textContent += " Hay más coincidencias; afiná la búsqueda.";
    }
    if (notify && $("search")?.value.trim() === query) {
      checkNewOutOfStock(oldCache, cache);
    }
    setLastUpdatedNow();
    if (highlightKey) setTimeout(() => { highlightKey = null; }, 1200);
  } catch (err) {
    if (requestId !== stockRequestId) return;
    $("status").textContent = `Error: ${String(err)}`;
    showToast("Error de conexión al cargar el stock.", "error");
  }
}

/* ===== Login ===== */
function openLoginModal() {
  $("loginStatus").textContent = "";
  $("modalOverlay").style.display = "flex";
  $("modalOverlay").setAttribute("aria-hidden", "false");
  setTimeout(() => $("adminUser")?.focus(), 80);
}

function closeLoginModal() {
  $("modalOverlay").style.display = "none";
  $("modalOverlay").setAttribute("aria-hidden", "true");
}

async function adminLogin() {
  const user = $("adminUser").value.trim();
  const pass = $("adminPass").value;
  const ls   = $("loginStatus");
  if (!user || !pass) { ls.textContent = "Complete usuario y contraseña."; return; }
  ls.textContent = "Validando credenciales...";
  try {
    setBusyState(true, "Validando credenciales…");
    const res = await apiPostForm({ action: "login", user, pass });
    if (!res || !res.ok) {
      isAdmin = false; setAdminButtonState();
      ls.textContent = `Error: ${res?.error || "Login inválido."}`;
      showToast("Credenciales incorrectas.", "error");
      return;
    }
    if (!res.token || !Number.isFinite(res.expiresAt)) {
      throw new Error("Respuesta de sesión inválida.");
    }
    saveAdminSession(res.token, res.expiresAt);
    $("adminPass").value = "";
    isAdmin = true; setAdminButtonState();
    closeLoginModal(); doRender();
    await loadMovs(); setLastUpdatedNow();
    showToast("Sesión de administrador iniciada.", "success");
  } catch (err) {
    ls.textContent = String(err).includes("AbortError")
      ? "Error: el servidor tardó demasiado."
      : `Error de conexión: ${String(err)}`;
    showToast("Error de conexión.", "error");
  } finally { setBusyState(false); }
}

function adminLogout() {
  clearAdminSession();
  isAdmin = false; setAdminButtonState();
  doRender(); loadMovs(); setLastUpdatedNow();
  showToast("Sesión cerrada correctamente.", "info");
}

function formatFamilySyncProgress(job) {
  const progress = job.total ? ` (${job.processed}/${job.total})` : "";
  const messages = {
    loading: "Preparando inventario para consultar Litton…",
    search: "Buscando códigos internos en Litton…",
    details: "Recuperando equivalencias oficiales del catálogo…",
    saving: "Guardando vínculos de equivalencia…",
  };
  return `${messages[job.stage] || "Sincronizando equivalencias Litton…"}${progress}`;
}

function familySyncReport(summary) {
  const ambiguousItems = summary.detalleAmbiguos || [];
  const errorItems = summary.detalleErrores || [];
  const ambiguous = ambiguousItems.map((item) =>
    `<li>${escapeHtml(item.codigo)} · ${escapeHtml(item.marca || "Marca s/d")} — familias candidatas: ${escapeHtml((item.familias || []).join(", "))}</li>`
  );
  const errors = errorItems.map((item) =>
    `<li>${escapeHtml(item.codigo || "Código s/d")} — ${escapeHtml(item.error || "Error sin detalle")}</li>`
  );
  const details = ambiguous.length || errors.length
    ? `<details><summary>Ver ambigüedades y errores informados</summary>
        ${ambiguous.length ? `<p><strong>Asociaciones omitidas por ambigüedad (${summary.ambiguos}):</strong></p><ul>${ambiguous.join("")}</ul>` : ""}
        ${errors.length ? `<p><strong>Errores de consulta (${summary.errores}):</strong></p><ul>${errors.join("")}</ul>` : ""}
        ${Number(summary.ambiguos) > ambiguous.length ? `<p>Se omitieron ${escapeHtml(String(Number(summary.ambiguos) - ambiguous.length))} ambigüedades adicionales del detalle.</p>` : ""}
        ${Number(summary.errores) > errors.length ? `<p>Se omitieron ${escapeHtml(String(Number(summary.errores) - errors.length))} errores adicionales del detalle.</p>` : ""}
      </details>`
    : "";
  return `<strong>Sincronización completada.</strong>
    ${escapeHtml(String(summary.productosVinculados || 0))} productos asociados; ${escapeHtml(String(summary.sinCoincidencia || 0))} sin coincidencia; ${escapeHtml(String(summary.ambiguos || 0))} ambiguos omitidos; ${escapeHtml(String(summary.errores || 0))} errores.
    Se actualizaron ${escapeHtml(String(summary.productosActualizados || 0))} filas de equivalencias. El stock y los movimientos no se modificaron.
    ${details}`;
}

async function synchronizeLittonFamilies() {
  const button = $("btnSyncFamilies");
  const status = $("familySyncStatus");
  if (!button || !status || familySyncRunning || !isAdmin || busy) return;

  const token = getAdminToken();
  if (!token) {
    adminLogout();
    showToast("La sesión venció. Ingresá nuevamente.", "error");
    return;
  }

  familySyncRunning = true;
  button.disabled = true;
  status.hidden = false;
  status.textContent = "Iniciando sincronización segura de equivalencias Litton…";
  try {
    let response = await apiIniciarSincronizacionLitton(token);
    let job = response.job;
    if (!response.ok && job?.status !== "running") {
      throw new Error(response.error || "No se pudo iniciar la sincronización.");
    }
    if (!job?.id) throw new Error("El servidor no devolvió el identificador del trabajo.");

    while (job.status === "running") {
      status.textContent = formatFamilySyncProgress(job);
      await new Promise(resolve => setTimeout(resolve, 1500));
      const currentToken = getAdminToken();
      if (!currentToken) {
        adminLogout();
        throw new Error("La sesión venció durante la sincronización. Ingresá nuevamente para volver a consultar.");
      }
      response = await apiEstadoSincronizacionLitton(job.id, currentToken);
      if (!response.ok) throw new Error(response.error || "No se pudo consultar el progreso.");
      job = response.job;
      if (!job) throw new Error("El servidor devolvió un estado de sincronización inválido.");
    }

    if (job.status !== "completed") throw new Error(job.error || "La sincronización no pudo completarse.");
    status.innerHTML = familySyncReport(job.summary || {});
    const partial = job.summary?.errores || job.summary?.ambiguos;
    showToast(
      partial
        ? "La sincronización terminó con elementos omitidos. Revisá el detalle."
        : "Equivalencias Litton sincronizadas. El stock no fue alterado.",
      partial ? "info" : "success"
    );
    const query = $("search")?.value.trim() || "";
    if (query) await loadStock(query);
  } catch (error) {
    status.hidden = false;
    status.textContent = `No se pudo completar la sincronización: ${error.message || String(error)}`;
    showToast(error.message || "Falló la sincronización de equivalencias Litton.", "error");
  } finally {
    familySyncRunning = false;
    button.disabled = false;
  }
}

/* ===== Modo compacto ===== */
let compactMode = false;
function toggleCompact() {
  compactMode = !compactMode;
  document.body.classList.toggle("compact", compactMode);
  const btn = $("btnCompact");
  if (btn) btn.textContent = compactMode ? "☰ Normal" : "☰ Compacto";
}


/* ===== Sort headers ===== */
function bindSortHeaders() {
  document.querySelectorAll("th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (sortCol === col) sortDir = sortDir === "asc" ? "desc" : "asc";
      else { sortCol = col; sortDir = "asc"; }
      document.querySelectorAll("th.sortable").forEach(t => t.classList.remove("sort-asc","sort-desc"));
      th.classList.add(sortDir === "asc" ? "sort-asc" : "sort-desc");
      doRender();
    });
  });
}

/* ===== Bind events ===== */
function bindEvents() {
  $("search").addEventListener("input", () => {
    const val = $("search").value;
    const btn = $("btnClearSearch");
    if (btn) btn.style.display = val ? "flex" : "none";
    stockRequestId++;
    clearTimeout(searchTimer);
    if (!val.trim()) {
      rangeMin = null;
      rangeMax = null;
      if ($("rangeMin")) $("rangeMin").value = "";
      if ($("rangeMax")) $("rangeMax").value = "";
      if ($("rangeFilter")) $("rangeFilter").style.display = "none";
      if ($("btnAdvSearch")) $("btnAdvSearch").textContent = "⚡ Filtro stock";
      loadStock("");
      return;
    }
    searchTimer = setTimeout(() => loadStock(val.trim()), SEARCH_DEBOUNCE_MS);
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
    if (!cache.length) { showToast("No hay datos para exportar.", "info"); return; }
    const rows = [["CODIGO","MARCA","STOCK","UBICACION"]];
    for (const item of cache) rows.push([item.codigo||"", item.marca||"", String(item.stock||0), item.ubicacion === "NEGOCIO" ? "Negocio" : "Depósito/Galpón"]);
    const csv  = rows.map(r => r.map(c => `"${String(c).replaceAll('"','""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF"+csv], { type:"text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `rectifren_stock_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast("Stock exportado correctamente.", "success");
  });

  $("btnSyncFamilies")?.addEventListener("click", synchronizeLittonFamilies);

  $("btnAdmin").addEventListener("click", () => {
    if (busy) return;
    if (isAdmin) adminLogout(); else openLoginModal();
  });

  $("btnTheme").addEventListener("click", () => {
    if (busy) return;
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(cur === "dark" ? "light" : "dark");
  });

  $("btnCloseModal").addEventListener("click", () => { if (!busy) closeLoginModal(); });
  $("btnCancel").addEventListener("click",      () => { if (!busy) closeLoginModal(); });
  $("btnLogin").addEventListener("click", adminLogin);
  $("adminPass").addEventListener("keydown", e => { if (e.key === "Enter") adminLogin(); });

  $("modalOverlay").addEventListener("click", e => {
    if (e.target === $("modalOverlay") && !busy) closeLoginModal();
  });

  $("movRange").addEventListener("change", loadMovs);

  const chipFilter = (f, id) => () => {
    if (busy) return;
    viewFilter = f; setActiveChip(id);
    const tb = document.getElementById("tbody");
    if (tb) {
      tb.classList.add("fading");
      setTimeout(() => { doRender(); tb.classList.remove("fading"); }, 120);
    } else { doRender(); }
  };
  $("fAll").addEventListener("click", chipFilter("all","fAll"));
  $("fOut").addEventListener("click", chipFilter("out","fOut"));
  $("fLow").addEventListener("click", chipFilter("low","fLow"));

  // Compact toggle
  $("btnCompact")?.addEventListener("click", toggleCompact);

  // Búsqueda avanzada - rango de stock
  $("btnAdvSearch")?.addEventListener("click", () => {
    const rf = $("rangeFilter");
    if (!rf) return;
    const visible = rf.style.display !== "none";
    rf.style.display = visible ? "none" : "flex";
    if (visible) { rangeMin = null; rangeMax = null; $("rangeMin").value=""; $("rangeMax").value=""; doRender(); }
    const btn = $("btnAdvSearch");
    if (btn) btn.textContent = visible ? "⚡ Filtro stock" : "⚡ Quitar filtro";
  });

  const applyRange = () => {
    const mn = $("rangeMin")?.value; const mx = $("rangeMax")?.value;
    rangeMin = mn !== "" && mn !== null ? Number(mn) : null;
    rangeMax = mx !== "" && mx !== null ? Number(mx) : null;
    doRender();
  };
  $("rangeMin")?.addEventListener("input", applyRange);
  $("rangeMax")?.addEventListener("input", applyRange);
  $("btnClearRange")?.addEventListener("click", () => {
    rangeMin = null; rangeMax = null;
    if ($("rangeMin")) $("rangeMin").value = "";
    if ($("rangeMax")) $("rangeMax").value = "";
    doRender();
  });

  // Mov sort
  bindMovSort();

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !busy) {
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

  // Visibility: pausar auto-refresh cuando la pestaña está oculta
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoRefresh(); else startAutoRefresh();
  });

  bindSortHeaders();
}

/* ===== Init ===== */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  readUrlParams();

  isAdmin = restoreAdminSession();

  setAdminButtonState();
  bindEvents();
  productActions.bind();
  bindHistModal();
  bindEquivModal();
  bindBetaModal({
    getIsAdmin: () => isAdmin,
    getAdminToken,
    adminLogout,
    isBusy: () => busy
  });
  loadStock();
  startAutoRefresh();
  if (isAdmin) loadMovs();
  setLastUpdatedNow();
  setTimeout(requestNotifPermission, 3000);
});
