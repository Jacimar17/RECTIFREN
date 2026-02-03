const API_URL = "https://script.google.com/macros/s/AKfycbzFSQtb-uD43OWt6VVmrzgGuq-deTeViiPsYVdOa7HQz17hqiuDQyxgDVLYbnmQ166EPQ/exec";

const el = (id) => document.getElementById(id);

let cache = [];
let isAdmin = false;

function getCreds() {
  return {
    user: sessionStorage.getItem("rectifren_admin_user") || "",
    pass: sessionStorage.getItem("rectifren_admin_pass") || ""
  };
}

async function apiGet(params) {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: "GET" });
  return await res.json();
}

async function apiPost(body) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return await res.json();
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString("es-AR");
  } catch {
    return iso;
  }
}

function ensureAccionesHeader() {
  const theadRow = document.querySelector("table#stockTable thead tr");
  if (!theadRow) return;

  const existing = document.getElementById("thAcciones");
  if (isAdmin && !existing) {
    const th = document.createElement("th");
    th.id = "thAcciones";
    th.className = "col-acciones";
    th.textContent = "ACCIONES";
    theadRow.appendChild(th);
  }
  if (!isAdmin && existing) {
    existing.remove();
  }
}

function render(list) {
  ensureAccionesHeader();

  const q = (el("search").value || "").trim().toLowerCase();
  const tbody = el("tbody");
  tbody.innerHTML = "";

  const filtered = list.filter(x => {
    if (!q) return true;
    return (x.codigo || "").toLowerCase().includes(q) || (x.marca || "").toLowerCase().includes(q);
  });

  for (const item of filtered) {
    const tr = document.createElement("tr");

    const acciones = isAdmin
      ? `
        <td class="col-acciones">
          <button class="mini" data-act="in"  data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${Number(item.stock || 0)}">+</button>
          <button class="mini danger" data-act="out" data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${Number(item.stock || 0)}">−</button>
          <button class="mini" data-act="set" data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${Number(item.stock || 0)}">✏️</button>
        </td>
      `
      : "";

    tr.innerHTML = `
      <td class="col-codigo">${escapeHtml(item.codigo || "")}</td>
      <td class="col-marca">${escapeHtml(item.marca || "")}</td>
      <td class="col-stock">${Number(item.stock || 0)}</td>
      ${acciones}
    `;

    tbody.appendChild(tr);
  }

  el("status").textContent = `Mostrando ${filtered.length} de ${list.length} registros.`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadStock() {
  el("status").textContent = "Cargando...";
  try {
    const data = await apiGet({ action: "list" });
    if (!data.ok) {
      el("status").textContent = `Error: ${data.error || "No se pudo cargar."}`;
      return;
    }
    cache = data.data || [];
    render(cache);
  } catch (err) {
    el("status").textContent = `Error: ${String(err)}`;
  }
}

async function loadMovs() {
  const panel = el("movPanel");
  if (!panel) return;

  if (!isAdmin) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "block";

  const range = el("movRange").value;
  const status = el("movStatus");
  status.textContent = "Cargando movimientos...";

  const data = await apiGet({ action: "movements", range });

  if (!data.ok) {
    status.textContent = `Error: ${data.error || "No se pudo cargar."}`;
    return;
  }

  const tbody = el("movTbody");
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
}

async function adminLogin() {
  const user = el("adminUser").value.trim();
  const pass = el("adminPass").value;

  const ls = el("loginStatus");
  ls.textContent = "Validando credenciales...";

  if (!user || !pass) {
    ls.textContent = "Complete usuario y contraseña.";
    return;
  }

  const res = await apiPost({ action: "login", user, pass });

  if (!res.ok) {
    isAdmin = false;
    ls.textContent = `Error: ${res.error || "Login inválido"}`;
    return;
  }

  sessionStorage.setItem("rectifren_admin_user", user);
  sessionStorage.setItem("rectifren_admin_pass", pass);

  isAdmin = true;
  ls.textContent = "Login correcto. Edición habilitada.";

  closeModal();
  render(cache);
  await loadMovs();
}

function adminLogout() {
  sessionStorage.removeItem("rectifren_admin_user");
  sessionStorage.removeItem("rectifren_admin_pass");
  isAdmin = false;

  render(cache);
  loadMovs();
  alert("Sesión de administrador cerrada.");
}

async function handleAction(act, codigo, marca, currentStock) {
  const { user, pass } = getCreds();

  if (!user || !pass) {
    alert("No está autenticado como administrador.");
    return;
  }

  if (act === "in" || act === "out") {
    const raw = prompt(
      `Ingrese cantidad para ${act === "in" ? "SUMAR (ENTRADA)" : "RESTAR (SALIDA)"}\n${codigo} - ${marca}`,
      "1"
    );
    if (raw === null) return;

    const cantidad = Number(raw);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      alert("Cantidad inválida.");
      return;
    }

    const nota = prompt("Nota (opcional):", "") || "";

    const res = await apiPost({ action: act, user, pass, codigo, marca, cantidad, nota });
    if (!res.ok) {
      alert(`Error: ${res.error || "No se pudo operar."}`);
      return;
    }
  }

  if (act === "set") {
    const raw = prompt(
      `Nuevo STOCK para:\n${codigo} - ${marca}\n(Stock actual: ${currentStock})`,
      String(currentStock)
    );
    if (raw === null) return;

    const nuevoStock = Number(raw);
    if (!Number.isFinite(nuevoStock) || nuevoStock < 0) {
      alert("Stock inválido.");
      return;
    }

    const nota = prompt("Nota (opcional):", "Ajuste") || "";

    const res = await apiPost({ action: "set", user, pass, codigo, marca, nuevoStock, nota });
    if (!res.ok) {
      alert(`Error: ${res.error || "No se pudo guardar."}`);
      return;
    }
  }

  // “Guardado automático”: la operación guarda, y luego refrescamos vista y movimientos.
  await loadStock();
  await loadMovs();
}

// ---------------- Modal (control en app.js) ----------------

function openModal() {
  el("loginStatus").textContent = "";
  el("modalOverlay").style.display = "flex";
  el("modalOverlay").setAttribute("aria-hidden", "false");
  el("adminUser").focus();
}

function closeModal() {
  el("modalOverlay").style.display = "none";
  el("modalOverlay").setAttribute("aria-hidden", "true");
}

// ---------------- Init ----------------

document.addEventListener("DOMContentLoaded", () => {
  // Eventos stock
  el("refresh").addEventListener("click", loadStock);
  el("search").addEventListener("input", () => render(cache));

  // Modal eventos
  el("btnAdmin").addEventListener("click", openModal);
  el("btnCloseModal").addEventListener("click", closeModal);
  el("btnCancel").addEventListener("click", closeModal);

  el("modalOverlay").addEventListener("click", (e) => {
    if (e.target === el("modalOverlay")) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el("modalOverlay").style.display === "flex") closeModal();
  });

  // Login real
  el("btnLogin").addEventListener("click", adminLogin);

  // Movimientos
  el("movRange").addEventListener("change", loadMovs);

  // Botón cerrar sesión
  el("btnLogout").addEventListener("click", adminLogout);

  // Delegación de eventos para botones +/−/✏️
  el("tbody").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;

    const act = btn.getAttribute("data-act");
    const codigo = btn.getAttribute("data-c");
    const marca = btn.getAttribute("data-m");
    const s = Number(btn.getAttribute("data-s") || 0);

    await handleAction(act, codigo, marca, s);
  });

  // Estado inicial: NO admin hasta que valide login
  isAdmin = false;

  loadStock();
  loadMovs();
});
