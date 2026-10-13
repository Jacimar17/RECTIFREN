import { apiGet, apiPostForm, authJsonHeaders } from "./api.js";
import { API_URL } from "./config.js";
import {
  $,
  renderStock, setBusy, setActiveChip,
  openEditModal, closeEditModal, getEditModalData,
  showToast, updateStats, showSkeleton, updateChipCounts, renderCards
} from "./ui.js";
import { createEquivalencesController } from "./equivalences.js";
import { createMovementController } from "./movements.js";
import { bindBetaModal } from "./beta.js";

let cache       = [];
let isAdmin     = false;
let viewFilter  = "all";
let busy        = false;
let highlightKey = null;
let pendingAction = null; // { act, codigo, marca, stock }
let sortCol     = null;
let sortDir     = "asc";
let autoRefreshTimer = null;
let searchTimer = null;
let stockRequestId = 0;
let searchHasMore = false;
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutos
const SEARCH_DEBOUNCE_MS = 250;
const movements = createMovementController({ getIsAdmin: () => isAdmin });
const { loadMovs, openHistModal, bindMovSort, bindHistModal, closeHistModal } = movements;
const { openEquivModal, bind: bindEquivModal } = createEquivalencesController({ getAdminToken });

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
  const opts = { list: cache, isAdmin, viewFilter, query, highlightKey, sortCol, sortDir, rangeMin, rangeMax };
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
    updateChipCounts(cache);
    doRender();
    $("status").textContent = "Escribí un código o marca para buscar.";
    return;
  }

  const oldCache = [...cache];
  searchHasMore = false;
  if (!notify) {
    cache = [];
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
    searchHasMore = Boolean(data.hasMore);
    updateStats(cache);
    updateChipCounts(cache);
    doRender();
    if (searchHasMore) {
      $("status").textContent += " Se muestran hasta 100; afiná la búsqueda.";
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

/* ===== Acciones stock ===== */
function openNoteModal(act, codigo, marca, stock) {
  pendingAction = { act, codigo, marca, stock };
  const ov = $("noteOverlay"); if (!ov) return;
  $("noteTitle").textContent = act === "in" ? "Agregar una unidad" : "Retirar una unidad";
  $("noteCodigo").textContent = codigo;
  $("noteAccion").textContent = act === "in" ? "+ Entrada" : "− Salida";
  $("noteStock").textContent  = String(stock);
  $("noteInput").value = "";
  ov.style.display = "flex";
  ov.setAttribute("aria-hidden","false");
  setTimeout(() => $("noteInput")?.focus(), 80);
}

function closeNoteModal() {
  const ov = $("noteOverlay"); if (!ov) return;
  ov.style.display = "none";
  ov.setAttribute("aria-hidden","true");
  pendingAction = null;
}

async function confirmNote() {
  if (!pendingAction) return;
  const { act, codigo, marca } = pendingAction;
  const nota = $("noteInput")?.value.trim() || "";
  closeNoteModal();
  const token = getAdminToken();
  if (!token) { adminLogout(); showToast("La sesión venció. Ingresá nuevamente.", "error"); return; }
  setBusyState(true, "Aplicando cambio…");
  try {
    const res = await apiPostForm({ action: act, token, codigo, marca, cantidad: 1, nota });
    if (!res.ok) { showToast(`Error: ${res.error || "No se pudo operar."}`, "error"); return; }
    highlightKey = { codigo, marca };
    showToast(`Stock ${act === "in" ? "aumentado" : "reducido"} para ${codigo}.`, "success");
    await loadStock(); await loadMovs(); setLastUpdatedNow();
  } finally { setBusyState(false); }
}

async function doInOut(act, codigo, marca, stock) {
  openNoteModal(act, codigo, marca, stock);
}


/* ===== Agregar producto ===== */
function openAddModal() {
  ["addCodigo","addMarca"].forEach(id => { const el = $(id); if(el) el.value=""; });
  const st = $("addStock"); if(st) st.value="0";
  const s = $("addStatus"); if(s) s.textContent="";
  const ov = $("addOverlay"); if(!ov) return;
  ov.style.display="flex"; ov.setAttribute("aria-hidden","false");
  setTimeout(() => $("addCodigo")?.focus(), 80);
}

function closeAddModal() {
  const ov = $("addOverlay"); if(!ov) return;
  ov.style.display="none"; ov.setAttribute("aria-hidden","true");
}

async function confirmAdd() {
  const token = getAdminToken();
  if (!token) { adminLogout(); showToast("La sesión venció. Ingresá nuevamente.", "error"); return; }
  const codigo = $("addCodigo")?.value.trim();
  const marca  = $("addMarca")?.value.trim();
  const stock  = Number($("addStock")?.value || 0);
  const st     = $("addStatus");
  if (!codigo) { if(st) st.textContent="El código es obligatorio."; return; }
  if (!marca)  { if(st) st.textContent="La marca es obligatoria.";  return; }
  if (!Number.isFinite(stock) || stock < 0) { if(st) st.textContent="Stock inválido."; return; }
  try {
    setBusyState(true, "Agregando producto…");
    const res = await apiPostForm({ action:"add", token, codigo, marca, stock });
    if (!res.ok) { if(st) st.textContent=`Error: ${res.error||"No se pudo agregar."}`; return; }
    closeAddModal();
    showToast(`Producto ${codigo} agregado.`, "success");
    await loadStock(); await loadMovs(); setLastUpdatedNow();
  } finally { setBusyState(false); }
}

let pendingDelete = null;

function openDelModal(codigo, marca) {
  pendingDelete = { codigo, marca };
  const ov = $("delOverlay"); if (!ov) return;
  $("delCodigo").textContent = codigo;
  $("delMarca").textContent  = marca;
  ov.style.display = "flex"; ov.setAttribute("aria-hidden","false");
}

function closeDelModal() {
  const ov = $("delOverlay"); if (!ov) return;
  ov.style.display = "none"; ov.setAttribute("aria-hidden","true");
  pendingDelete = null;
}

async function confirmDel() {
  if (!pendingDelete) return;
  const { codigo, marca } = pendingDelete;
  closeDelModal();
  const token = getAdminToken();
  if (!token) { adminLogout(); showToast("La sesión venció. Ingresá nuevamente.", "error"); return; }
  try {
    setBusyState(true, "Eliminando producto…");
    const res = await apiPostForm({ action:"delete", token, codigo, marca });
    if (!res.ok) { showToast(`Error: ${res.error||"No se pudo eliminar."}`, "error"); return; }
    showToast(`Producto ${codigo} eliminado.`, "success");
    await loadStock(); await loadMovs(); setLastUpdatedNow();
  } finally { setBusyState(false); }
}

async function deleteProduct(codigo, marca) {
  openDelModal(codigo, marca);
}


/* ===== Modo compacto ===== */
let compactMode = false;
function toggleCompact() {
  compactMode = !compactMode;
  document.body.classList.toggle("compact", compactMode);
  const btn = $("btnCompact");
  if (btn) btn.textContent = compactMode ? "☰ Normal" : "☰ Compacto";
}


/* ===== Stock mínimo ===== */
let minimoProductoId = null;

function openMinimoModal(id, codigo, marca, actual) {
  minimoProductoId = id;
  $("minimoCodigo").textContent = codigo;
  $("minimoMarca").textContent  = marca;
  $("minimoInput").value        = actual;
  $("minimoStatus").textContent = "";
  const ov = $("minimoOverlay");
  ov.style.display = "flex";
  ov.setAttribute("aria-hidden","false");
  setTimeout(() => { const i = $("minimoInput"); i.focus(); i.select(); }, 80);
}

function closeMinimoModal() {
  $("minimoOverlay").style.display = "none";
  $("minimoOverlay").setAttribute("aria-hidden","true");
  minimoProductoId = null;
}

async function saveMinimoModal() {
  if (!minimoProductoId) return;
  const val = Number($("minimoInput").value);
  if (isNaN(val) || val < 0) { $("minimoStatus").textContent = "Valor inválido."; return; }
  const token = getAdminToken();
  if (!token) { adminLogout(); showToast("La sesión venció. Ingresá nuevamente.", "error"); return; }
  try {
    setBusyState(true, "Guardando...");
    const res = await fetch(`${API_URL}/api/productos/${minimoProductoId}/minimo`, {
      method: "PATCH",
      headers: authJsonHeaders(token),
      body: JSON.stringify({ stockMinimo: val })
    });
    const data = await res.json();
    if (!data.ok) { $("minimoStatus").textContent = `Error: ${data.error}`; return; }
    closeMinimoModal();
    showToast(`Stock mínimo actualizado a ${val}.`, "success");
    await loadStock();
  } finally {
    setBusyState(false);
  }
}

function bindMinimoModal() {
  $("btnCloseMinimo")?.addEventListener("click",  closeMinimoModal);
  $("btnCancelMinimo")?.addEventListener("click", closeMinimoModal);
  $("btnSaveMinimo")?.addEventListener("click",   saveMinimoModal);
  $("minimoInput")?.addEventListener("keydown", e => { if(e.key==="Enter") saveMinimoModal(); });
  $("minimoOverlay")?.addEventListener("click", e => { if(e.target===$("minimoOverlay")) closeMinimoModal(); });
}

async function saveEdit() {
  const token = getAdminToken();
  if (!token) { adminLogout(); showToast("La sesión venció. Ingresá nuevamente.", "error"); return; }
  const data = getEditModalData();
  if (!data.codigoOrig || !data.marcaOrig) { $("editStatus").textContent = "Error: datos incompletos."; return; }
  if (!data.nuevoCodigo) { $("editStatus").textContent = "El código no puede estar vacío."; return; }
  if (!data.nuevaMarca)  { $("editStatus").textContent = "La marca no puede estar vacía."; return; }
  if (!Number.isFinite(data.nuevoStock) || data.nuevoStock < 0) { $("editStatus").textContent = "Nuevo stock inválido."; return; }
  try {
    setBusyState(true, "Guardando cambios…");
    const res = await apiPostForm({
      action: "set", token,
      codigo: data.codigoOrig, marca: data.marcaOrig,
      nuevoCodigo: data.nuevoCodigo, nuevaMarca: data.nuevaMarca,
      nuevoStock: data.nuevoStock
    });
    if (!res.ok) { $("editStatus").textContent = `Error: ${res.error || "No se pudo guardar."}`; return; }
    closeEditModal();
    highlightKey = { codigo: data.nuevoCodigo, marca: data.nuevaMarca };
    showToast(`Producto actualizado correctamente.`, "success");
    await loadStock(); await loadMovs(); setLastUpdatedNow();
  } finally { setBusyState(false); }
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
    const rows = [["CODIGO","MARCA","STOCK"]];
    for (const item of cache) rows.push([item.codigo||"", item.marca||"", String(item.stock||0)]);
    const csv  = rows.map(r => r.map(c => `"${String(c).replaceAll('"','""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF"+csv], { type:"text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `rectifren_stock_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast("Stock exportado correctamente.", "success");
  });

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

  const handleStockAction = async (ev, allowRowClick) => {
    if (busy) return;
    const btn = ev.target.closest("button[data-act]");
    if (btn && !btn.disabled) {
      const act    = btn.getAttribute("data-act");
      const codigo = btn.getAttribute("data-c");
      const marca  = btn.getAttribute("data-m");
      const stock  = Number(btn.getAttribute("data-s") || 0);
      if (act === "in" || act === "out") { await doInOut(act, codigo, marca, stock); return; }
      if (act === "set") { openEditModal({ codigo, marca, actual: stock }); return; }
      if (act === "del") { await deleteProduct(codigo, marca); return; }
      if (act === "equiv")   { const id = btn.getAttribute("data-id"); await openEquivModal(id, codigo, marca); return; }
      if (act === "minimo") { const id = btn.getAttribute("data-id"); const min = Number(btn.getAttribute("data-min")||2); openMinimoModal(id, codigo, marca, min); return; }
      return;
    }
    if (allowRowClick && !ev.target.closest("button")) {
      const row = ev.target.closest("[data-c]");
      if (row) { const c = row.dataset.c, m = row.dataset.m; if(c&&m) await openHistModal(c,m); }
    }
  };

  $("tbody").addEventListener("click", ev => handleStockAction(ev, true));

  const cardGrid = document.getElementById("cardGrid");
  if (cardGrid) cardGrid.addEventListener("click", ev => handleStockAction(ev, true));

  $("btnCloseEdit").addEventListener("click",  () => { if (!busy) closeEditModal(); });
  $("btnCancelEdit").addEventListener("click", () => { if (!busy) closeEditModal(); });
  $("btnSaveEdit").addEventListener("click",   () => { if (!busy) saveEdit(); });
  $("editNuevo").addEventListener("keydown",   e => { if (e.key === "Enter" && !busy) saveEdit(); });

  $("editOverlay").addEventListener("click", e => {
    if (e.target === $("editOverlay") && !busy) closeEditModal();
  });

  // Note modal
  const noteOv = $("noteOverlay");
  if (noteOv) {
    $("btnCloseNote")?.addEventListener("click",   () => { if(!busy) closeNoteModal(); });
    $("btnCancelNote")?.addEventListener("click",  () => { if(!busy) closeNoteModal(); });
    $("btnConfirmNote")?.addEventListener("click", () => { if(!busy) confirmNote(); });
    $("noteInput")?.addEventListener("keydown", e => { if(e.key==="Enter" && !busy) confirmNote(); });
    noteOv.addEventListener("click", e => { if(e.target===noteOv && !busy) closeNoteModal(); });
  }

  // Add product modal
  const addOv = $("addOverlay");
  if (addOv) {
    $("btnAddProduct")?.addEventListener("click",  () => { if(!busy) openAddModal(); });
    $("btnCloseAdd")?.addEventListener("click",    () => { if(!busy) closeAddModal(); });
    $("btnCancelAdd")?.addEventListener("click",   () => { if(!busy) closeAddModal(); });
    $("btnConfirmAdd")?.addEventListener("click",  () => { if(!busy) confirmAdd(); });
    addOv.addEventListener("click", e => { if(e.target===addOv && !busy) closeAddModal(); });
  }

  // Delete confirm modal
  const delOv = $("delOverlay");
  if (delOv) {
    $("btnCloseDel")?.addEventListener("click",   () => { if(!busy) closeDelModal(); });
    $("btnCancelDel")?.addEventListener("click",  () => { if(!busy) closeDelModal(); });
    $("btnConfirmDel")?.addEventListener("click", () => { if(!busy) confirmDel(); });
    delOv.addEventListener("click", e => { if(e.target===delOv && !busy) closeDelModal(); });
  }

  // Historial modal
  // Row/card click -> historial (manejado en handleStockAction)

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
      if ($("modalOverlay").style.display === "flex") closeLoginModal();
      if ($("editOverlay").style.display   === "flex") closeEditModal();
      if ($("noteOverlay")?.style.display  === "flex") closeNoteModal();
      if ($("addOverlay")?.style.display   === "flex") closeAddModal();
      if ($("equivOverlay")?.style.display  === "flex") closeEquivModal();
      if ($("minimoOverlay")?.style.display === "flex") closeMinimoModal();
      if ($("delOverlay")?.style.display   === "flex") closeDelModal();
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
  bindHistModal();
  bindEquivModal();
  bindMinimoModal();
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
