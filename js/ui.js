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
  ["statTotalVal","statUnitsVal","statOutVal","statLowVal","statOkVal"].forEach(id => {
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
  const units = list.reduce((acc, i) => acc + Number(i.stock || 0), 0);

  const setVal = (id, val) => {
    const el = $(id); if (!el) return;
    el.textContent = val;
    el.closest(".stat-card")?.classList.remove("stat-loading");
  };

  setVal("statTotalVal", total);
  setVal("statUnitsVal", units);
  setVal("statOutVal",   out);
  setVal("statLowVal",   low);
  setVal("statOkVal",    ok);

  // Titulo pestana
  document.title = out > 0 ? `(${out}) RECTIFREN | Inventario` : "RECTIFREN | Inventario";

  // Donut
  drawDonut({ ok, low, out });
}

function drawDonut({ ok, low, out }) {
  const canvas = document.getElementById("donutChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const total = ok + low + out;
  const W = canvas.width, H = canvas.height;
  const cx = W/2, cy = H/2, r = W/2 - 4, inner = r * 0.58;
  ctx.clearRect(0, 0, W, H);
  if (total === 0) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = r - inner; ctx.stroke(); return;
  }
  const segments = [
    { val: ok,  color: "#22c55e" },
    { val: low, color: "#f59e0b" },
    { val: out, color: "#ef4444" },
  ].filter(s => s.val > 0);
  let angle = -Math.PI / 2;
  for (const seg of segments) {
    const sweep = (seg.val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, (r + inner) / 2, angle, angle + sweep);
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = r - inner;
    ctx.lineCap = "butt";
    ctx.stroke();
    angle += sweep;
  }
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
  $("editActual").textContent = String(actual);
  $("editProductoOrig").textContent = `${codigo} — ${marca}`;
  const ci = $("editCodigoInput"); if (ci) ci.value = codigo;
  const mi = $("editMarcaInput");  if (mi) mi.value = marca;
  const input = $("editNuevo");
  input.value = String(actual);
  const ov = $("editOverlay");
  ov.style.display = "flex";
  ov.setAttribute("aria-hidden","false");
  ov.dataset.codigo = codigo;
  ov.dataset.marca  = marca;
  ov.dataset.actual = String(actual);
  setTimeout(() => { const ci2 = $("editCodigoInput"); if(ci2){ci2.focus();ci2.select();} }, 80);
}

export function closeEditModal() {
  const ov = $("editOverlay");
  ov.style.display = "none";
  ov.setAttribute("aria-hidden","true");
}

export function getEditModalData() {
  const ov = $("editOverlay");
  return {
    codigoOrig:  ov.dataset.codigo || "",
    marcaOrig:   ov.dataset.marca  || "",
    actual:      Number(ov.dataset.actual || 0),
    nuevoCodigo: $("editCodigoInput")?.value.trim() || ov.dataset.codigo || "",
    nuevaMarca:  $("editMarcaInput")?.value.trim()  || ov.dataset.marca  || "",
    nuevoStock:  Number($("editNuevo").value)
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
export function renderStock({ list, isAdmin, viewFilter, query, highlightKey, sortCol, sortDir, rangeMin, rangeMax }) {
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

  if (rangeMin !== null && rangeMin !== undefined) working = working.filter(it => Number(it.stock||0) >= rangeMin);
  if (rangeMax !== null && rangeMax !== undefined) working = working.filter(it => Number(it.stock||0) <= rangeMax);

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
          data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${stockNum}">+</button>
        <button class="mini danger" data-act="out"
          data-disabled="${minusDisabled?"1":"0"}"
          ${minusDisabled?"disabled":""}
          data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${stockNum}">−</button>
        <button class="mini" data-act="set"
          data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${stockNum}">✏️</button>
        <button class="mini del" data-act="del"
          data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" title="Eliminar producto">🗑</button>
      </td>` : "";

    tr.dataset.c = item.codigo || "";
    tr.dataset.m = item.marca  || "";
    tr.style.cursor = "pointer";
    tr.innerHTML = `
      <td class="col-codigo">${highlight(item.codigo||"", q)}</td>
      <td class="col-marca">${highlight(item.marca||"", q)}</td>
      <td class="col-stock">${stockCell}</td>
      ${acciones}
    `;
    tbody.appendChild(tr);
  }

  const filteredUnits = working.reduce((acc, i) => acc + Number(i.stock || 0), 0);
  $("status").textContent = `Mostrando ${working.length} de ${list.length} productos · ${filteredUnits} unidades en vista.`;
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
