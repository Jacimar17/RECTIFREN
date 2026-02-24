export const $ = (id) => document.getElementById(id);

export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function fmtDate(iso) {
  try { return new Date(iso).toLocaleString("es-AR"); }
  catch { return iso; }
}

// Regla actual:
// - SIN STOCK: stock === 0
// - BAJO STOCK: SOLO para codigo "528" cuando stock 4..5 inclusive
export function getStockState(item) {
  const stock = Number(item.stock || 0);
  const codigo = String(item.codigo || "").trim();

  if (stock === 0) return "out";
  if (codigo === "528" && stock >= 4 && stock <= 5) return "low";
  return "ok";
}

export function ensureAccionesHeader(isAdmin) {
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
  if (!isAdmin && existing) existing.remove();
}

export function setBusy(on, text = "Aplicando cambio…") {
  const overlay = $("busyOverlay");
  const msg = $("busyText");
  if (msg) msg.textContent = text;

  if (overlay) {
    overlay.style.display = on ? "flex" : "none";
    overlay.setAttribute("aria-hidden", on ? "false" : "true");
  }

  const ids = ["btnAdmin", "btnTheme", "fAll", "fOut", "fLow"];
  ids.forEach(id => {
    const b = $(id);
    if (b) b.disabled = on;
  });

  document.querySelectorAll("button[data-act]").forEach(btn => {
    btn.disabled = on || btn.dataset.disabled === "1";
  });
}

/* ===== Modal Editar Stock ===== */

export function openEditModal({ codigo, marca, actual }) {
  $("editStatus").textContent = "";
  $("editCodigo").textContent = codigo;
  $("editMarca").textContent = marca;
  $("editActual").textContent = String(actual);

  const input = $("editNuevo");
  input.value = String(actual);
  input.focus();
  input.select();

  const ov = $("editOverlay");
  ov.style.display = "flex";
  ov.setAttribute("aria-hidden", "false");

  ov.dataset.codigo = codigo;
  ov.dataset.marca = marca;
  ov.dataset.actual = String(actual);
}

export function closeEditModal() {
  const ov = $("editOverlay");
  ov.style.display = "none";
  ov.setAttribute("aria-hidden", "true");
}

export function getEditModalData() {
  const ov = $("editOverlay");
  return {
    codigo: ov.dataset.codigo || "",
    marca: ov.dataset.marca || "",
    actual: Number(ov.dataset.actual || 0),
    nuevoStock: Number($("editNuevo").value)
  };
}

/* ===== Orden por código (SIEMPRE) ===== */
function sortByCodigo(list) {
  return [...list].sort((a, b) => {
    const ca = String(a.codigo || "");
    const cb = String(b.codigo || "");
    return ca.localeCompare(cb, "es", { numeric: true, sensitivity: "base" });
  });
}

/* ===== Render ===== */

export function renderStock({ list, isAdmin, viewFilter, query, highlightKey }) {
  ensureAccionesHeader(isAdmin);

  const q = (query || "").trim().toLowerCase();
  const tbody = $("tbody");
  tbody.innerHTML = "";

  // ✅ siempre orden por código
  let working = sortByCodigo(list);

  // búsqueda
  working = working.filter(x => {
    if (!q) return true;
    return (x.codigo || "").toLowerCase().includes(q) || (x.marca || "").toLowerCase().includes(q);
  });

  // filtros
  if (viewFilter === "out") {
    working = working.filter(it => Number(it.stock || 0) === 0);
  } else if (viewFilter === "low") {
    working = working.filter(it => getStockState(it) === "low");
  }

  for (const item of working) {
    const stockNum = Number(item.stock || 0);
    const state = getStockState(item);

    const tr = document.createElement("tr");
    if (state === "out") tr.classList.add("row-out");
    if (state === "low") tr.classList.add("row-low");

    // ✅ resaltar fila modificada
    if (highlightKey && item.codigo === highlightKey.codigo && item.marca === highlightKey.marca) {
      tr.classList.add("row-flash");
    }

    let badge = "";
    if (state === "out") badge = `<span class="badge out">SIN STOCK</span>`;
    if (state === "low") badge = `<span class="badge low">BAJO STOCK</span>`;

    const minusDisabled = (stockNum === 0);

    const acciones = isAdmin ? `
      <td class="col-acciones">
        <button class="mini success" data-act="in"
          data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}">+</button>

        <button class="mini danger" data-act="out"
          data-disabled="${minusDisabled ? "1" : "0"}"
          ${minusDisabled ? "disabled" : ""}
          data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}">−</button>

        <button class="mini" data-act="set"
          data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${stockNum}">✏️</button>
      </td>
    ` : "";

    tr.innerHTML = `
      <td class="col-codigo">${escapeHtml(item.codigo || "")}</td>
      <td class="col-marca">${escapeHtml(item.marca || "")}</td>
      <td class="col-stock">${stockNum}${badge}</td>
      ${acciones}
    `;

    tbody.appendChild(tr);
  }

  $("status").textContent = `Mostrando ${working.length} de ${list.length} registros.`;
}

export function setActiveChip(id) {
  ["fAll","fOut","fLow"].forEach(x => $(x).classList.remove("active"));
  $(id).classList.add("active");
}
