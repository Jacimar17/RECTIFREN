import { apiGet, apiPostForm } from "./api.js";
import {
  $, fmtDate, escapeHtml,
  renderStock, setBusy, setActiveChip,
  openEditModal, closeEditModal, getEditModalData,
  showToast, updateStats, showSkeleton
} from "./ui.js";

let cache = [];
let isAdmin = false;
let viewFilter = "all";
let busy = false;
let highlightKey = null;

// Sorting state
let sortCol = null;
let sortDir = "asc";

function getCreds() {
  return {
    user: sessionStorage.getItem("rectifren_admin_user") || "",
    pass: sessionStorage.getItem("rectifren_admin_pass") || ""
  };
}

function setBusyState(on, text) {
  busy = on;
  setBusy(on, text);
}

function setAdminButtonState() {
  const btn = $("btnAdmin");
  if (!btn) return;
  btn.textContent = isAdmin ? "Cerrar sesión" : "Administrador";
  btn.title       = isAdmin ? "Cerrar sesión de administrador" : "Ingresar como administrador";
}

function setLastUpdatedNow() {
  const el = $("lastUpdated");
  if (!el) return;
  el.textContent = `Última actualización: ${new Date().toLocaleString("es-AR")}`;
}

function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("rectifren_theme", t);
  const btn = $("btnTheme");
  if (btn) btn.textContent = (t === "dark") ? "☀️" : "🌙";
}

function initTheme() {
  const saved = localStorage.getItem("rectifren_theme");
  if (saved === "dark" || saved === "light") { applyTheme(saved); return; }
  applyTheme(window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

function doRender() {
  renderStock({ list: cache, isAdmin, viewFilter, query: $("search").value, highlightKey, sortCol, sortDir });
}

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
    doRender();
    setLastUpdatedNow();
    if (highlightKey) setTimeout(() => { highlightKey = null; }, 1200);
  } catch (err) {
    $("status").textContent = `Error: ${String(err)}`;
    showToast("Error de conexión al cargar el stock.", "error");
  }
}

async function loadMovs() {
  const panel = $("movPanel");
  if (!panel) return;
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
        <td></td>
      `;
      tbody.appendChild(tr);
    }
    status.textContent = `Movimientos: ${(data.data || []).length}`;
  } catch (err) {
    status.textContent = `Error: ${String(err)}`;
  }
}

/* ===== Login modal ===== */
function openLoginModal() {
  $("loginStatus").textContent = "";
  $("modalOverlay").style.display = "flex";
  $("modalOverlay").setAttribute("aria-hidden", "false");
  $("adminUser").focus();
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
      isAdmin = false;
      setAdminButtonState();
      ls.textContent = `Error: ${(res && res.error) ? res.error : "Login inválido."}`;
      showToast("Credenciales incorrectas.", "error");
      return;
    }

    sessionStorage.setItem("rectifren_admin_user", user);
    sessionStorage.setItem("rectifren_admin_pass", pass);
    isAdmin = true;
    setAdminButtonState();
    closeLoginModal();
    doRender();
    await loadMovs();
    setLastUpdatedNow();
    showToast("Sesión de administrador iniciada.", "success");

  } catch (err) {
    ls.textContent = String(err).includes("AbortError")
      ? "Error: el servidor tardó demasiado."
      : `Error de conexión: ${String(err)}`;
    showToast("Error de conexión.", "error");
  } finally {
    setBusyState(false);
  }
}

function adminLogout() {
  sessionStorage.removeItem("rectifren_admin_user");
  sessionStorage.removeItem("rectifren_admin_pass");
  isAdmin = false;
  setAdminButtonState();
  doRender();
  loadMovs();
  setLastUpdatedNow();
  showToast("Sesión cerrada correctamente.", "info");
}

/* ===== Acciones ===== */
async function doInOut(act, codigo, marca) {
  const { user, pass } = getCreds();
  if (!user || !pass) { showToast("No está autenticado como administrador.", "error"); return; }

  setBusyState(true, "Aplicando cambio…");
  try {
    const res = await apiPostForm({ action: act, user, pass, codigo, marca, cantidad: 1 });
    if (!res.ok) {
      showToast(`Error: ${res.error || "No se pudo operar."}`, "error");
      return;
    }
    highlightKey = { codigo, marca };
    showToast(`Stock ${act === "in" ? "aumentado" : "reducido"} para ${codigo}.`, "success");
    await loadStock();
    await loadMovs();
    setLastUpdatedNow();
  } finally {
    setBusyState(false);
  }
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
    await loadStock();
    await loadMovs();
    setLastUpdatedNow();
  } finally {
    setBusyState(false);
  }
}

/* ===== Sorting headers ===== */
function bindSortHeaders() {
  document.querySelectorAll("th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortCol = col;
        sortDir = "asc";
      }
      // Update classes
      document.querySelectorAll("th.sortable").forEach(t => t.classList.remove("sort-asc","sort-desc"));
      th.classList.add(sortDir === "asc" ? "sort-asc" : "sort-desc");
      doRender();
    });
  });
}

/* ===== Bind ===== */
function bindEvents() {
  $("search").addEventListener("input", () => {
    const val = $("search").value;
    const btn = $("btnClearSearch");
    if (btn) btn.style.display = val ? "flex" : "none";
    doRender();
  });

  const btnClear = $("btnClearSearch");
  if (btnClear) {
    btnClear.addEventListener("click", () => {
      $("search").value = "";
      btnClear.style.display = "none";
      $("search").focus();
      doRender();
    });
  }

  const btnExport = $("btnExport");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      if (!cache.length) { showToast("No hay datos para exportar.", "info"); return; }
      const rows = [["CODIGO","MARCA","STOCK"]];
      for (const item of cache) {
        rows.push([item.codigo||"", item.marca||"", String(item.stock||0)]);
      }
      const csv = rows.map(r => r.map(c => `"${String(c).replaceAll('"','""')}"`).join(",")).join("\r\n");
      const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `rectifren_stock_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Stock exportado correctamente.", "success");
    });
  }

  $("btnAdmin").addEventListener("click", () => {
    if (busy) return;
    if (isAdmin) adminLogout(); else openLoginModal();
  });

  $("btnTheme").addEventListener("click", () => {
    if (busy) return;
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  $("btnCloseModal").addEventListener("click", () => { if (!busy) closeLoginModal(); });
  $("btnCancel").addEventListener("click",      () => { if (!busy) closeLoginModal(); });
  $("btnLogin").addEventListener("click", adminLogin);

  $("modalOverlay").addEventListener("click", (e) => {
    if (e.target === $("modalOverlay") && !busy) closeLoginModal();
  });

  $("movRange").addEventListener("change", loadMovs);

  $("fAll").addEventListener("click", () => { if (busy) return; viewFilter="all"; setActiveChip("fAll"); doRender(); });
  $("fOut").addEventListener("click", () => { if (busy) return; viewFilter="out"; setActiveChip("fOut"); doRender(); });
  $("fLow").addEventListener("click", () => { if (busy) return; viewFilter="low"; setActiveChip("fLow"); doRender(); });

  $("tbody").addEventListener("click", async (ev) => {
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

  $("editOverlay").addEventListener("click", (e) => {
    if (e.target === $("editOverlay") && !busy) closeEditModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !busy) {
      if ($("modalOverlay").style.display === "flex") closeLoginModal();
      if ($("editOverlay").style.display   === "flex") closeEditModal();
    }
  });

  bindSortHeaders();
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  isAdmin = false;
  setAdminButtonState();
  bindEvents();
  loadStock();
  loadMovs();
  setLastUpdatedNow();
});
