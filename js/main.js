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
let pendingAction = null; // { act, codigo, marca, stock }
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
let rangeMin = null;
let rangeMax = null;

function doRender() {
  renderStock({ list: cache, isAdmin, viewFilter, query: $("search")?.value || "", highlightKey, sortCol, sortDir, rangeMin, rangeMax });
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
    movCache = data.data || [];
    renderMovs(movCache);
    status.textContent = `Movimientos: ${movCache.length}`;
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
    const bap = $("btnAddProduct"); if(bap) bap.style.display="flex";
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
  const bap2 = $("btnAddProduct"); if(bap2) bap2.style.display="none";
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
  const { user, pass } = getCreds();
  if (!user || !pass) { showToast("No está autenticado como administrador.", "error"); return; }
  setBusyState(true, "Aplicando cambio…");
  try {
    const res = await apiPostForm({ action: act, user, pass, codigo, marca, cantidad: 1, nota });
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
  const { user, pass } = getCreds();
  if (!user || !pass) { showToast("No está autenticado.", "error"); return; }
  const codigo = $("addCodigo")?.value.trim();
  const marca  = $("addMarca")?.value.trim();
  const stock  = Number($("addStock")?.value || 0);
  const st     = $("addStatus");
  if (!codigo) { if(st) st.textContent="El código es obligatorio."; return; }
  if (!marca)  { if(st) st.textContent="La marca es obligatoria.";  return; }
  if (!Number.isFinite(stock) || stock < 0) { if(st) st.textContent="Stock inválido."; return; }
  try {
    setBusyState(true, "Agregando producto…");
    const res = await apiPostForm({ action:"add", user, pass, codigo, marca, stock });
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
  const { user, pass } = getCreds();
  if (!user || !pass) { showToast("No está autenticado.", "error"); return; }
  try {
    setBusyState(true, "Eliminando producto…");
    const res = await apiPostForm({ action:"delete", user, pass, codigo, marca });
    if (!res.ok) { showToast(`Error: ${res.error||"No se pudo eliminar."}`, "error"); return; }
    showToast(`Producto ${codigo} eliminado.`, "success");
    await loadStock(); await loadMovs(); setLastUpdatedNow();
  } finally { setBusyState(false); }
}

async function deleteProduct(codigo, marca) {
  openDelModal(codigo, marca);
}


/* ===== Historial por producto ===== */
async function openHistModal(codigo, marca) {
  const ov = $("histOverlay"); if (!ov) return;
  $("histCodigo").textContent = codigo;
  $("histMarca").textContent  = marca;
  $("histTitle").textContent  = `Historial — ${codigo}`;
  $("histStatus").textContent = "Cargando…";
  $("histTbody").innerHTML    = "";
  ov.style.display = "flex"; ov.setAttribute("aria-hidden","false");
  try {
    const data = await apiGet({ action: "movements", range: "month" });
    const all  = (data.ok ? data.data || [] : [])
      .filter(m => m.codigo === codigo && m.marca === marca);
    const tbody = $("histTbody");
    tbody.innerHTML = "";
    if (all.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">Sin movimientos recientes.</td></tr>`;
    } else {
      for (const m of all) {
        const tr = document.createElement("tr");
        const isIn  = m.accion === "in"  || m.accion === "IN";
        const isDel = m.accion === "delete" || m.accion === "DELETE";
        const color = isIn ? "color:var(--success)" : isDel ? "color:var(--danger)" : "color:var(--warn)";
        tr.innerHTML = `
          <td>${escapeHtml(fmtDate(m.fecha))}</td>
          <td style="${color};font-weight:700">${escapeHtml(m.accion)}</td>
          <td class="center">${Number(m.cantidad||0)}</td>
          <td class="center">${Number(m.stock_anterior||0)}</td>
          <td class="center">${Number(m.stock_nuevo||0)}</td>
          <td>${escapeHtml(m.nota||"")}</td>
        `;
        tbody.appendChild(tr);
      }
    }
    $("histStatus").textContent = `${all.length} movimiento(s) en los últimos 30 días.`;
  } catch (err) {
    $("histStatus").textContent = `Error: ${String(err)}`;
  }
}

function closeHistModal() {
  const ov = $("histOverlay"); if (!ov) return;
  ov.style.display = "none"; ov.setAttribute("aria-hidden","true");
}

/* ===== Modo compacto ===== */
let compactMode = false;
function toggleCompact() {
  compactMode = !compactMode;
  document.body.classList.toggle("compact", compactMode);
  const btn = $("btnCompact");
  if (btn) btn.textContent = compactMode ? "☰ Normal" : "☰ Compacto";
}

async function saveEdit() {
  const { user, pass } = getCreds();
  if (!user || !pass) { showToast("No está autenticado como administrador.", "error"); return; }
  const data = getEditModalData();
  if (!data.codigoOrig || !data.marcaOrig) { $("editStatus").textContent = "Error: datos incompletos."; return; }
  if (!data.nuevoCodigo) { $("editStatus").textContent = "El código no puede estar vacío."; return; }
  if (!data.nuevaMarca)  { $("editStatus").textContent = "La marca no puede estar vacía."; return; }
  if (!Number.isFinite(data.nuevoStock) || data.nuevoStock < 0) { $("editStatus").textContent = "Nuevo stock inválido."; return; }
  try {
    setBusyState(true, "Guardando cambios…");
    const res = await apiPostForm({
      action: "set", user, pass,
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

/* ===== Sort movimientos ===== */
let movSortCol = "fecha";
let movSortDir = "desc";
let movCache   = [];

function renderMovs(data) {
  const tbody = $("movTbody"); if (!tbody) return;
  tbody.innerHTML = "";
  let rows = [...data];
  rows.sort((a, b) => {
    let va = a[movSortCol] ?? "", vb = b[movSortCol] ?? "";
    if (movSortCol === "cantidad") { va = Number(va); vb = Number(vb); }
    if (movSortCol === "fecha")    { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
    const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "es");
    return movSortDir === "desc" ? -cmp : cmp;
  });
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--muted)">Sin movimientos.</td></tr>`;
    return;
  }
  for (const m of rows) {
    const tr = document.createElement("tr");
    const isIn = (m.accion||"").toLowerCase() === "in";
    const col  = isIn ? "color:var(--success)" : "color:var(--warn)";
    tr.innerHTML = `
      <td>${escapeHtml(fmtDate(m.fecha))}</td>
      <td style="${col};font-weight:700">${escapeHtml(m.accion)}</td>
      <td>${escapeHtml(m.codigo)}</td>
      <td>${escapeHtml(m.marca)}</td>
      <td class="center">${Number(m.cantidad||0)}</td>
      <td class="center">${Number(m.stock_anterior||0)}</td>
      <td class="center">${Number(m.stock_nuevo||0)}</td>
      <td>${escapeHtml(m.nota||"")}</td>
    `;
    tbody.appendChild(tr);
  }
}

function bindMovSort() {
  document.querySelectorAll("th.mov-sortable").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.mcol;
      if (movSortCol === col) movSortDir = movSortDir === "asc" ? "desc" : "asc";
      else { movSortCol = col; movSortDir = col === "fecha" ? "desc" : "asc"; }
      document.querySelectorAll("th.mov-sortable").forEach(t => t.classList.remove("mov-sort-asc","mov-sort-desc"));
      th.classList.add(movSortDir === "asc" ? "mov-sort-asc" : "mov-sort-desc");
      renderMovs(movCache);
    });
  });
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

  $("tbody").addEventListener("click", async ev => {
    if (busy) return;
    const btn = ev.target.closest("button[data-act]");
    if (!btn || btn.disabled) return;
    const act    = btn.getAttribute("data-act");
    const codigo = btn.getAttribute("data-c");
    const marca  = btn.getAttribute("data-m");
    const stock  = Number(btn.getAttribute("data-s") || 0);
    if (act === "in" || act === "out") { await doInOut(act, codigo, marca, stock); return; }
    if (act === "set") { openEditModal({ codigo, marca, actual: stock }); return; }
    if (act === "del") { await deleteProduct(codigo, marca); return; }
  });

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
  const histOv = $("histOverlay");
  if (histOv) {
    $("btnCloseHist")?.addEventListener("click", () => closeHistModal());
    histOv.addEventListener("click", e => { if(e.target===histOv) closeHistModal(); });
  }

  // Row click -> historial (solo click en td, no en botones)
  $("tbody").addEventListener("click", async ev => {
    if (busy) return;
    if (ev.target.closest("button")) return; // ya manejado arriba
    const tr = ev.target.closest("tr[data-c]");
    if (!tr) return;
    const codigo = tr.dataset.c;
    const marca  = tr.dataset.m;
    if (codigo && marca) await openHistModal(codigo, marca);
  });

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
  isAdmin = false;
  setAdminButtonState();
  bindEvents();
  loadStock().then(() => startAutoRefresh());
  loadMovs();
  setLastUpdatedNow();
});
