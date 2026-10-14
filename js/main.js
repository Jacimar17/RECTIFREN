import { apiGet, apiPostForm } from "./api.js";
import { bindMainEvents } from "./main-events.js";
import { createAdminSession } from "./admin-session.js";
import { pushUrlParams, readUrlParams } from "./app-url.js";
import { createInventoryRenderer } from "./inventory-render.js";
import { applyTheme, initTheme } from "./theme.js";
import {
  $,
  renderStock, setBusy,
  showToast, updateStats, showSkeleton, updateChipCounts, renderCards, renderFamilySummaries
} from "./ui.js";
import { createEquivalencesController } from "./equivalences.js";
import { createMovementController } from "./movements.js";
import { bindBetaModal } from "./beta.js?v=20261014";
import { createProductActions } from "./product-actions.js";

let cache       = [];
let isAdmin     = false;
let viewFilter  = "all";
let busy        = false;
let highlightKey = null;
let sortCol     = null;
let sortDir     = "asc";
let autoRefreshTimer = null;
let rangeMin = null;
let rangeMax = null;
let stockRequestId = 0;
let searchHasMore = false;
let inventoryFamilies = [];
let familyMemberIds = new Set();
let inventoryLittonError = "";
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutos
const SEARCH_DEBOUNCE_MS = 450;
const doRender = createInventoryRenderer({
  getState: () => ({
    cache, isAdmin, viewFilter, highlightKey, sortCol, sortDir, rangeMin, rangeMax,
    familyMemberIds, inventoryFamilies, inventoryLittonError
  }),
  renderFamilySummaries,
  renderStock,
  renderCards,
  pushUrlParams
});
const { restoreAdminSession, getAdminToken, saveAdminSession, clearAdminSession } = createAdminSession(() => {
  adminLogout();
  showToast("La sesión venció. Ingresá nuevamente.", "info");
});
const movements = createMovementController({ getIsAdmin: () => isAdmin });
const { loadMovs, openHistModal, bindMovSort, bindHistModal, closeHistModal } = movements;
const { openEquivModal, closeEquivModal, bind: bindEquivModal } = createEquivalencesController({ getAdminToken });
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
    inventoryLittonError = "";
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
    inventoryLittonError = "";
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
    inventoryLittonError = data.littonError || "";
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

/* ===== Modo compacto ===== */
let compactMode = false;
function toggleCompact() {
  compactMode = !compactMode;
  document.body.classList.toggle("compact", compactMode);
  const btn = $("btnCompact");
  if (btn) btn.textContent = compactMode ? "☰ Normal" : "☰ Compacto";
}


/* ===== Init ===== */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  viewFilter = readUrlParams(viewFilter);

  isAdmin = restoreAdminSession();

  setAdminButtonState();
  bindMainEvents({
    state: {
      get busy() { return busy; },
      get isAdmin() { return isAdmin; },
      get cache() { return cache; },
      get viewFilter() { return viewFilter; },
      set viewFilter(value) { viewFilter = value; },
      get rangeMin() { return rangeMin; },
      set rangeMin(value) { rangeMin = value; },
      get rangeMax() { return rangeMax; },
      set rangeMax(value) { rangeMax = value; },
      get sortCol() { return sortCol; },
      set sortCol(value) { sortCol = value; },
      get sortDir() { return sortDir; },
      set sortDir(value) { sortDir = value; }
    },
    actions: {
      adminLogin, adminLogout, applyTheme, bindMovSort, closeEquivModal, closeHistModal,
      closeLoginModal, doRender, invalidateSearch: () => { stockRequestId++; },
      loadMovs, loadStock, openLoginModal, productActions, startAutoRefresh, stopAutoRefresh,
      toggleCompact
    },
    searchDebounceMs: SEARCH_DEBOUNCE_MS
  });
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
