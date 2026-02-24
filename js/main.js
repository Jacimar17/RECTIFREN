import { apiGet, apiPostForm } from "./api.js";
import {
  $, fmtDate, escapeHtml,
  renderStock, setBusy, setActiveChip,
  openEditModal, closeEditModal, getEditModalData
} from "./ui.js";

let cache = [];
let isAdmin = false;
let viewFilter = "all";
let busy = false;

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

  if (isAdmin) {
    btn.textContent = "Cerrar sesión";
    btn.title = "Cerrar sesión de administrador";
  } else {
    btn.textContent = "Administrador";
    btn.title = "Ingresar como administrador";
  }
}

async function loadStock() {
  $("status").textContent = "Cargando...";
  try {
    const data = await apiGet({ action: "list" });
    if (!data.ok) {
      $("status").textContent = `Error: ${data.error || "No se pudo cargar."}`;
      return;
    }
    cache = data.data || [];
    renderStock({ list: cache, isAdmin, viewFilter, query: $("search").value });
  } catch (err) {
    $("status").textContent = `Error: ${String(err)}`;
  }
}

async function loadMovs() {
  const panel = $("movPanel");
  if (!panel) return;

  if (!isAdmin) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";

  const range = $("movRange").value;
  const status = $("movStatus");
  status.textContent = "Cargando movimientos...";

  try {
    const data = await apiGet({ action: "movements", range });
    if (!data.ok) {
      status.textContent = `Error: ${data.error || "No se pudo cargar."}`;
      return;
    }

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
  const ls = $("loginStatus");

  ls.textContent = "Validando credenciales...";
  if (!user || !pass) {
    ls.textContent = "Complete usuario y contraseña.";
    return;
  }

  try {
    setBusyState(true, "Validando credenciales…");
    const res = await apiPostForm({ action: "login", user, pass });

    if (!res || !res.ok) {
      isAdmin = false;
      setAdminButtonState();
      ls.textContent = `Error: ${(res && res.error) ? res.error : "Login inválido / sin respuesta."}`;
      return;
    }

    sessionStorage.setItem("rectifren_admin_user", user);
    sessionStorage.setItem("rectifren_admin_pass", pass);

    isAdmin = true;
    setAdminButtonState();
    closeLoginModal();

    renderStock({ list: cache, isAdmin, viewFilter, query: $("search").value });
    await loadMovs();
  } catch (err) {
    ls.textContent = String(err).includes("AbortError")
      ? "Error: el servidor tardó demasiado (timeout)."
      : `Error de conexión: ${String(err)}`;
  } finally {
    setBusyState(false);
  }
}

function adminLogout() {
  sessionStorage.removeItem("rectifren_admin_user");
  sessionStorage.removeItem("rectifren_admin_pass");
  isAdmin = false;
  setAdminButtonState();

  renderStock({ list: cache, isAdmin, viewFilter, query: $("search").value });
  loadMovs();
  alert("Sesión de administrador cerrada.");
}

/* ===== Acciones ===== */

async function doInOut(act, codigo, marca) {
  const { user, pass } = getCreds();
  if (!user || !pass) {
    alert("No está autenticado como administrador.");
    return;
  }

  setBusyState(true, "Aplicando cambio…");
  try {
    const cantidad = 1;
    const res = await apiPostForm({ action: act, user, pass, codigo, marca, cantidad });
    if (!res.ok) {
      alert(`Error: ${res.error || "No se pudo operar."}`);
      return;
    }

    await loadStock();
    await loadMovs();
  } finally {
    setBusyState(false);
  }
}

function openEditForRow(codigo, marca, stockActual) {
  openEditModal({ codigo, marca, actual: stockActual });
}

async function saveEdit() {
  const { user, pass } = getCreds();
  if (!user || !pass) {
    alert("No está autenticado como administrador.");
    return;
  }

  const data = getEditModalData();
  if (!data.codigo || !data.marca) {
    $("editStatus").textContent = "Error: datos incompletos.";
    return;
  }

  if (!Number.isFinite(data.nuevoStock) || data.nuevoStock < 0) {
    $("editStatus").textContent = "Nuevo stock inválido.";
    return;
  }

  try {
    setBusyState(true, "Guardando edición…");

    const res = await apiPostForm({
      action: "set",
      user, pass,
      codigo: data.codigo,
      marca: data.marca,
      nuevoStock: data.nuevoStock
    });

    if (!res.ok) {
      $("editStatus").textContent = `Error: ${res.error || "No se pudo guardar."}`;
      return;
    }

    closeEditModal();
    await loadStock();
    await loadMovs();
  } finally {
    setBusyState(false);
  }
}

/* ===== Bind ===== */

function bindEvents() {
  $("search").addEventListener("input", () => {
    renderStock({ list: cache, isAdmin, viewFilter, query: $("search").value });
  });

  // Botón único: si está admin => logout, si no => abre login
  $("btnAdmin").addEventListener("click", () => {
    if (busy) return;
    if (isAdmin) adminLogout();
    else openLoginModal();
  });

  $("btnCloseModal").addEventListener("click", () => { if (!busy) closeLoginModal(); });
  $("btnCancel").addEventListener("click", () => { if (!busy) closeLoginModal(); });
  $("btnLogin").addEventListener("click", adminLogin);

  $("modalOverlay").addEventListener("click", (e) => {
    if (e.target === $("modalOverlay") && !busy) closeLoginModal();
  });

  $("movRange").addEventListener("change", loadMovs);

  $("fAll").addEventListener("click", () => {
    if (busy) return;
    viewFilter = "all";
    setActiveChip("fAll");
    renderStock({ list: cache, isAdmin, viewFilter, query: $("search").value });
  });

  $("fOut").addEventListener("click", () => {
    if (busy) return;
    viewFilter = "out";
    setActiveChip("fOut");
    renderStock({ list: cache, isAdmin, viewFilter, query: $("search").value });
  });

  $("fLow").addEventListener("click", () => {
    if (busy) return;
    viewFilter = "low";
    setActiveChip("fLow");
    renderStock({ list: cache, isAdmin, viewFilter, query: $("search").value });
  });

  $("tbody").addEventListener("click", async (ev) => {
    if (busy) return;

    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.disabled) return;

    const act = btn.getAttribute("data-act");
    const codigo = btn.getAttribute("data-c");
    const marca = btn.getAttribute("data-m");
    const stock = Number(btn.getAttribute("data-s") || 0);

    if (act === "in" || act === "out") {
      await doInOut(act, codigo, marca);
      return;
    }

    if (act === "set") {
      openEditForRow(codigo, marca, stock);
      return;
    }
  });

  $("btnCloseEdit").addEventListener("click", () => { if (!busy) closeEditModal(); });
  $("btnCancelEdit").addEventListener("click", () => { if (!busy) closeEditModal(); });
  $("btnSaveEdit").addEventListener("click", () => { if (!busy) saveEdit(); });

  $("editOverlay").addEventListener("click", (e) => {
    if (e.target === $("editOverlay") && !busy) closeEditModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !busy) {
      if ($("modalOverlay").style.display === "flex") closeLoginModal();
      if ($("editOverlay").style.display === "flex") closeEditModal();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // si hay credenciales guardadas, no asumimos que sean válidas:
  // simplemente dejamos el estado como "no admin" y usted inicia sesión.
  isAdmin = false;
  setAdminButtonState();

  bindEvents();
  loadStock();
  loadMovs();
});
