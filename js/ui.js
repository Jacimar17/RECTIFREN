export const $ = (id) => document.getElementById(id);

export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function fmtDate(iso) {
  try { return new Date(iso).toLocaleString("es-AR"); } catch { return iso; }
}

export function getStockState(item) {
  const s = Number(item.stock || 0);
  if (s === 0) return "out";
  if (s <= 2)  return "low";
  return "ok";
}

/* ===== Header columna acciones ===== */
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

/* ===== Busy overlay ===== */
export function setBusy(on, text = "Aplicando cambio…") {
  const overlay = $("busyOverlay");
  const msg     = $("busyText");
  if (msg) msg.textContent = text;
  if (overlay) {
    overlay.style.display = on ? "flex" : "none";
    overlay.setAttribute("aria-hidden", on ? "false" : "true");
  }
  ["btnAdmin","btnTheme","fAll","fOut","fLow"].forEach(id => {
    const b = $(id); if (b) b.disabled = on;
  });
  document.querySelectorAll("button[data-act]").forEach(btn => {
    btn.disabled = on || btn.dataset.disabled === "1";
  });
}

/* ===== Toasts ===== */
export function showToast(message, type = "info", duration = 3200) {
  const container = $("toastContainer");
  if (!container) return;
  const icons = { success:"✅", error:"❌", info:"ℹ️" };
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type]||"ℹ️"}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-exit");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, duration);
}

/* ===== Stats ===== */
export function setStatsLoading() {
  ["statTotalVal","statOutVal","statLowVal","statOkVal"].forEach(id => {
    const el = $(id); if (!el) return;
    el.textContent = "—";
    el.closest(".stat-card")?.classList.add("stat-loading");
  });
}

export function updateStats(list) {
  const total = list.length;
  const out   = list.filter(i => getStockState(i) === "out").length;
  const low   = list.filter(i => getStockState(i) === "low").length;
  const ok    = total - out - low;

  const setVal = (id, val) => {
    const el = $(id); if (!el) return;
    el.textContent = val;
    el.closest(".stat-card")?.classList.remove("stat-loading");
  };

  setVal("statTotalVal", total);
  setVal("statOutVal",   out);
  setVal("statLowVal",   low);
  setVal("statOkVal",    ok);
}

/* ===== Skeleton loader ===== */
export function showSkeleton(rows = 8) {
  const tbody = $("tbody");
  tbody.innerHTML = "";
  setStatsLoading();
  const hasAdminCol = !!document.getElementById("thAcciones");
  const cols = hasAdminCol ? 4 : 3;
  const widths = [["55%"],["80%","65%","70%"],["35%"],["60%"]];

  for (let i = 0; i < rows; i++) {
    const tr = document.createElement("tr");
    tr.className = "skeleton-row";
    for (let c = 0; c < cols; c++) {
      const td = document.createElement("td");
      const w = widths[c] ? widths[c][i % widths[c].length] : "50%";
      td.innerHTML = `<span class="skeleton-cell" style="width:${w}; max-width:100%"></span>`;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

/* ===== Modal Editar ===== */
export function openEditModal({ codigo, marca, actual }) {
  $("editStatus").textContent = "";
  $("editCodigo").textContent = codigo;
  $("editMarca").textContent  = marca;
  $("editActual").textContent = String(actual);
  const input = $("editNuevo");
  input.value = String(actual);
  const ov = $("editOverlay");
  ov.style.display = "flex";
  ov.setAttribute("aria-hidden","false");
  ov.dataset.codigo = codigo;
  ov.dataset.marca  = marca;
  ov.dataset.actual = String(actual);
  setTimeout(() => { input.focus(); input.select(); }, 80);
}

export function closeEditModal() {
  const ov = $("editOverlay");
  ov.style.display = "none";
  ov.setAttribute("aria-hidden","true");
}

export function getEditModalData() {
  const ov = $("editOverlay");
  return {
    codigo:     ov.dataset.codigo || "",
    marca:      ov.dataset.marca  || "",
    actual:     Number(ov.dataset.actual || 0),
    nuevoStock: Number($("editNuevo").value)
  };
}

/* ===== Highlight match ===== */
function highlight(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(new RegExp(`(${q})`, "gi"), `<mark class="hl">$1</mark>`);
}

/* ===== Sort base ===== */
function sortByCodigo(list) {
  return [...list].sort((a,b) =>
    String(a.codigo||"").localeCompare(String(b.codigo||""),"es",{numeric:true,sensitivity:"base"})
  );
}

/* ===== Render ===== */
export function renderStock({ list, isAdmin, viewFilter, query, highlightKey, sortCol, sortDir }) {
  ensureAccionesHeader(isAdmin);
  const q = (query||"").trim().toLowerCase();
  const tbody = $("tbody");
  tbody.innerHTML = "";

  let working = sortByCodigo(list);

  if (q) working = working.filter(x =>
    (x.codigo||"").toLowerCase().includes(q) || (x.marca||"").toLowerCase().includes(q)
  );

  if (viewFilter === "out") working = working.filter(it => getStockState(it) === "out");
  if (viewFilter === "low") working = working.filter(it => getStockState(it) === "low");

  if (sortCol) {
    working = [...working].sort((a,b) => {
      let va = a[sortCol] ?? "", vb = b[sortCol] ?? "";
      if (sortCol === "stock") { va = Number(va); vb = Number(vb); }
      const cmp = typeof va === "number"
        ? va - vb
        : String(va).localeCompare(String(vb),"es",{numeric:true,sensitivity:"base"});
      return sortDir === "desc" ? -cmp : cmp;
    });
  }

  if (working.length === 0) {
    const tr = document.createElement("tr");
    const colspan = isAdmin ? 4 : 3;
    tr.innerHTML = `<td colspan="${colspan}" style="text-align:center; padding:28px; color:var(--muted)">
      Sin resultados para la búsqueda actual.
    </td>`;
    tbody.appendChild(tr);
  }

  for (const item of working) {
    const stockNum = Number(item.stock || 0);
    const state    = getStockState(item);

    const tr = document.createElement("tr");
    if (state === "out") tr.classList.add("row-out");
    if (state === "low") tr.classList.add("row-low");
    if (highlightKey && item.codigo === highlightKey.codigo && item.marca === highlightKey.marca) {
      tr.classList.add("row-flash");
    }

    let badge = "";
    if (state === "out") badge = `<span class="badge out">SIN STOCK</span>`;
    if (state === "low") badge = `<span class="badge low">BAJO</span>`;

    const barPct  = state === "out" ? 0 : state === "low" ? 40 : 100;
    const barClass = state === "out" ? "bar-danger" : state === "low" ? "bar-warn" : "";

    const numColor = state === "out"
      ? "color:var(--danger); font-weight:800"
      : state === "low"
      ? "color:var(--warn); font-weight:800"
      : "color:var(--success)";

    const stockCell = `
      <div class="stock-bar-wrap">
        <span style="${numColor}">${stockNum}</span>${badge}
        <div class="stock-bar">
          <div class="stock-bar-fill ${barClass}" style="width:${barPct}%"></div>
        </div>
      </div>`;

    const minusDisabled = stockNum === 0;
    const acciones = isAdmin ? `
      <td class="col-acciones">
        <button class="mini success" data-act="in"
          data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}">+</button>
        <button class="mini danger" data-act="out"
          data-disabled="${minusDisabled?"1":"0"}"
          ${minusDisabled?"disabled":""}
          data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}">−</button>
        <button class="mini" data-act="set"
          data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${stockNum}">✏️</button>
      </td>` : "";

    tr.innerHTML = `
      <td class="col-codigo">${highlight(item.codigo||"", q)}</td>
      <td class="col-marca">${highlight(item.marca||"", q)}</td>
      <td class="col-stock">${stockCell}</td>
      ${acciones}
    `;
    tbody.appendChild(tr);
  }

  $("status").textContent = `Mostrando ${working.length} de ${list.length} registros.`;
}

export function setActiveChip(id) {
  ["fAll","fOut","fLow"].forEach(x => $(x)?.classList.remove("active"));
  $(id)?.classList.add("active");
}

/* ===== Chip counts ===== */
export function updateChipCounts(list) {
  const out = list.filter(i => getStockState(i) === "out").length;
  const low = list.filter(i => getStockState(i) === "low").length;
  const fOut = $("fOut"); if (fOut) fOut.textContent = `Faltantes${out ? ` (${out})` : ""}`;
  const fLow = $("fLow"); if (fLow) fLow.textContent = `Bajo stock${low ? ` (${low})` : ""}`;
}
