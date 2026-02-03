import { apiGet, apiPostForm } from "./api.js";
import { $, fmtDate, escapeHtml, renderStock, setBusy, setActiveChip } from "./ui.js";

let cache = [];
let isAdmin = false;
let viewFilter = "all"; // all | out | low
let busy = false;

function getCreds() {
  return {
    user: sessionStorage.getItem("rectifren_admin_user") || "",
    pass: sessionStorage.getItem("rectifren_admin_pass") || ""
  };
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
        <td>${escapeHtml(m.nota || "")}</td>
      `;
      tbody.appendChild(tr);
    }

    status.textContent = `Movimientos: ${(data.data || []).length}`;
  } catch (err) {
    status.textContent = `Error: ${String(err)}`;
  }
}

function openModal() {
  $("loginStatus").textContent = "";
  $("modalOverlay").style.display = "flex";
  $("modalOverlay").setAttribute("aria-hidden", "false");
  $("adminUser").focus();
}

function closeModal() {
  $("modalOverlay").style.display = "none";
  $("modalOverlay").setAttribute("aria-hidden", "true");
}

function setBusyState(on, text) {
  busy = on;
  setBusy(on, text);
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
      ls.textContent = `Error: ${(res && res.error) ? res.error : "Login inválido / sin respuesta."}`;
      return;
    }

    sessionStorage.setItem("rectifren_admin_user", user);
    sessionStorage.setItem("rectifren_admin_pass", pass);

    isAdmin = true;
    closeModal();

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

  renderStock({ list: cache, isAdmin, viewFilter, query: $("search").value });
  loadMovs();
  alert("Sesión de administrador cerrada.");
}

async function handleAction(act, codigo, marca, currentStock) {
  if (busy) return;

  const { user, pass } = getCreds();
  if (!user || !pass) {
    alert("No está autenticado como administrador.");
    return;
  }

  try {
    // + / − automáticos: 1 unidad sin diálogo
    if (act === "in" || act === "out") {
      setBusyState(true, "Aplicando cambio…");
      const cantidad = 1;

      // ✅ SIN nota
      const res = await apiPostForm({ action: act, user, pass, codigo, marca, cantidad });
      if (!res.ok) {
        alert(`Error: ${res.error || "No se pudo operar."}`);
        return;
      }
    }

    // ✏️: pide nuevo stock (sin pedir nota)
    if (act === "set") {
      // se libera el overlay para que el prompt sea utilizable
      setBusyState(false);

      const raw = prompt(
        `Editar STOCK (nuevo valor)\n${codigo} - ${marca}\nStock actual: ${currentStock}`,
        String(currentStock)
      );
      if (raw === null) return;

      const nuevoStock = Number(raw);
      if (!Number.isFinite(nuevoStock) || nuevoStock < 0) {
        alert("Stock inválido.");
        return;
      }

      setBusyState(true, "Guardando edición…");

      // ✅ SIN nota
      const res = await apiPostForm({ action: "set", user, pass, codigo, marca, nuevoStock });
      if (!res.ok) {
        alert(`Error: ${res.error || "No se pudo guardar."}`);
        return;
      }
    }

    // refresco automático
    await loadStock();
    await loadMovs();

  } catch (err) {
    alert(`Error de conexión: ${String(err)}`);
  } finally {
    setBusyState(false);
  }
}

function bindEvents() {
  $("refresh").addEventListener("click", () => { if (!busy) loadStock(); });
  $("search").addEventListener("input", () => {
    renderStock({ list: cache, isAdmin, viewFilter, query: $("search").value });
  });

  $("btnAdmin").addEventListener("click", () => { if (!busy) openModal(); });
  $("btnCloseModal").addEventListener("click", () => { if (!busy) closeModal(); });
  $("btnCancel").addEventListener("click", () => { if (!busy) closeModal(); });

  $("modalOverlay").addEventListener("click", (e) => {
    if (e.target === $("modalOverlay") && !busy) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("modalOverlay").style.display === "flex" && !busy) closeModal();
  });

  $("btnLogin").addEventListener("click", adminLogin);
  $("btnLogout").addEventListener("click", () => { if (!busy) adminLogout(); });

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
    const s = Number(btn.getAttribute("data-s") || 0);

    await handleAction(act, codigo, marca, s);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  isAdmin = false;
  loadStock();
  loadMovs();
});
