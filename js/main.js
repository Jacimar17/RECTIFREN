import { apiGet, apiPostForm } from "./api.js";
import {
  $, fmtDate, escapeHtml,
  renderStock, setBusy, setActiveChip,
  openEditModal, closeEditModal, getEditModalData,
  showToast, updateStats, showSkeleton, updateChipCounts
} from "./ui.js";

let cache       = [];
let isAdmin     = false;
let viewFilter  = "all";
let busy        = false;
let highlightKey = null;
let sortCol     = null;
let sortDir     = "asc";
let autoRefreshTimer = null;
const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutos

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

/* ===== Creds ===== */
function getCreds() {
  return {
    user: sessionStorage.getItem("rectifren_admin_user") || "",
    pass: sessionStorage.getItem("rectifren_admin_pass") || ""
  };
}

function setBusyState(on, text) { busy = on; setBusy(on, text); }

function setAdminButtonState() {
  const btn = $("btnAdmin"); if (!btn) return;
  btn.textContent = isAdmin ? "Cerrar sesión" : "Administrador";
  btn.title       = isAdmin ? "Cerrar sesión de administrador" : "Ingresar como administrador";
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
function doRender() {
  renderStock({ list: cache, isAdmin, viewFilter, query: $("search")?.value || "", highlightKey, sortCol, sortDir });
  pushUrlParams();
}

/* ===== Auto-refresh ===== */
function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(async () => {
    if (busy) return;
    try {
      const data = await apiGet({ action: "list" });
      if (data.ok) {
        cache = data.data || [];
        updateStats(cache);
        updateChipCounts(cache);
        doRender();
        setLastUpdatedNow();
      }
    } catch { /* silencioso */ }
  }, AUTO_REFRESH_MS);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
}

/* ===== Carga stock ===== */
async function loadStock() {
  $("status").textContent = "Cargando...";
  showSkeleton(10);
  try {
    const data = await apiGet({ action: "list" });
    if (!data.ok) {
      $("status").textContent = `Error: ${data.error || "No se pudo cargar."}`;
      showToast(data.error || "No se pudo cargar el stock.", "error");
      return;
    }
    cache = data.data || [];
    updateStats(cache);
    updateChipCounts(cache);
    doRender();
    setLastUpdatedNow();
    if (highlightKey) setTimeout(() => { highlightKey = null; }, 1200);
  } catch (err) {
    $("status").textContent = `Error: ${String(err)}`;
    showToast("Error de conexión al cargar el stock.", "error");
  }
}

/* ===== Movimientos ===== */
async function loadMovs() {
  const panel = $("movPanel"); if (!panel) return;
  if (!isAdmin) { panel.style.display = "none"; return; }
  panel.style.display = "block";
  const range  = $("movRange").value;
  const status = $("movStatus");
  status.textContent = "Cargando movimientos...";
  try {
    const data = await apiGet({ action: "movements", range });
    if (!data.ok) { status.textContent = `Error: ${data.error || "No se pudo cargar."}`; return; }
    const tbody = $("movTbody");
    tbody.innerHTML = "";
    for (const m of (data.data || [])) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(fmtDate(m.fecha))}</td>
        <td>${escapeHtml(m.accion)}</td>
        <td>${escapeHtml(m.codigo)}</td>
        <td>${escapeHtml(m.marca)}</td>
        <td class="center">${Number(m.cantidad || 0)}</td>
        <td class="center">${Number(m.stock_anterior || 0)}</td>
        <td class="center">${Number(m.stock_nuevo || 0)}</td>
        <td>${escapeHtml(m.nota || "")}</td>
      `;
      tbody.appendChild(tr);
    }
    status.textContent = `Movimientos: ${(data.data || []).length}`;
  } catch (err) {
    status.textContent = `Error: ${String(err)}`;
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
    sessionStorage.setItem("rectifren_admin_user", user);
    sessionStorage.setItem("rectifren_admin_pass", pass);
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
  sessionStorage.removeItem("rectifren_admin_user");
  sessionStorage.removeItem("rectifren_admin_pass");
  isAdmin = false; setAdminButtonState();
  doRender(); loadMovs(); setLastUpdatedNow();
  showToast("Sesión cerrada correctamente.", "info");
}

/* ===== Acciones stock ===== */
async function doInOut(act, codigo, marca) {
  const { user, pass } = getCreds();
  if (!user || !pass) { showToast("No está autenticado como administrador.", "error"); return; }
  setBusyState(true, "Aplicando cambio…");
  try {
    const res = await apiPostForm({ action: act, user, pass, codigo, marca, cantidad: 1 });
    if (!res.ok) { showToast(`Error: ${res.error || "No se pudo operar."}`, "error"); return; }
    highlightKey = { codigo, marca };
    showToast(`Stock ${act === "in" ? "aumentado" : "reducido"} para ${codigo}.`, "success");
    await loadStock(); await loadMovs(); setLastUpdatedNow();
  } finally { setBusyState(false); }
}

async function saveEdit() {
  const { user, pass } = getCreds();
  if (!user || !pass) { showToast("No está autenticado como administrador.", "error"); return; }
  const data = getEditModalData();
  if (!data.codigo || !data.marca) { $("editStatus").textContent = "Error: datos incompletos."; return; }
  if (!Number.isFinite(data.nuevoStock) || data.nuevoStock < 0) { $("editStatus").textContent = "Nuevo stock inválido."; return; }
  try {
    setBusyState(true, "Guardando edición…");
    const res = await apiPostForm({ action: "set", user, pass, codigo: data.codigo, marca: data.marca, nuevoStock: data.nuevoStock });
    if (!res.ok) { $("editStatus").textContent = `Error: ${res.error || "No se pudo guardar."}`; return; }
    closeEditModal();
    highlightKey = { codigo: data.codigo, marca: data.marca };
    showToast(`Stock de ${data.codigo} actualizado a ${data.nuevoStock}.`, "success");
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
    doRender();
  });

  const btnClear = $("btnClearSearch");
  if (btnClear) btnClear.addEventListener("click", () => {
    $("search").value = "";
    btnClear.style.display = "none";
    $("search").focus();
    doRender();
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
    viewFilter = f; setActiveChip(id); doRender();
  };
  $("fAll").addEventListener("click", chipFilter("all","fAll"));
  $("fOut").addEventListener("click", chipFilter("out","fOut"));
  $("fLow").addEventListener("click", chipFilter("low","fLow"));

  $("tbody").addEventListener("click", async ev => {
    if (busy) return;
    const btn = ev.target.closest("button[data-act]");
    if (!btn || btn.disabled) return;
    const act    = btn.getAttribute("data-act");
    const codigo = btn.getAttribute("data-c");
    const marca  = btn.getAttribute("data-m");
    const stock  = Number(btn.getAttribute("data-s") || 0);
    if (act === "in" || act === "out") { await doInOut(act, codigo, marca); return; }
    if (act === "set") { openEditModal({ codigo, marca, actual: stock }); return; }
  });

  $("btnCloseEdit").addEventListener("click",  () => { if (!busy) closeEditModal(); });
  $("btnCancelEdit").addEventListener("click", () => { if (!busy) closeEditModal(); });
  $("btnSaveEdit").addEventListener("click",   () => { if (!busy) saveEdit(); });
  $("editNuevo").addEventListener("keydown",   e => { if (e.key === "Enter" && !busy) saveEdit(); });

  $("editOverlay").addEventListener("click", e => {
    if (e.target === $("editOverlay") && !busy) closeEditModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !busy) {
      if ($("modalOverlay").style.display === "flex") closeLoginModal();
      if ($("editOverlay").style.display   === "flex") closeEditModal();
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
  isAdmin = false;
  setAdminButtonState();
  bindEvents();
  loadStock().then(() => startAutoRefresh());
  loadMovs();
  setLastUpdatedNow();
});
