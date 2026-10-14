import { $, escapeHtml, getStockState, ubicacionBadge } from "./dom.js";
import { highlight, sortByCodigo } from "./render-utils.js";

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
export function renderStock({ list, isAdmin, viewFilter, query, highlightKey, sortCol, sortDir, rangeMin, rangeMax, familyMemberIds }) {
  ensureAccionesHeader(isAdmin);
  const q = (query||"").trim().toLowerCase();
  const tbody = $("tbody");
  tbody.innerHTML = "";

  let working = sortByCodigo(list);

  const familyIds = familyMemberIds instanceof Set ? familyMemberIds : new Set();
  if (q) working = working.filter(x =>
    (x.codigo||"").toLowerCase().includes(q)
    || (x.marca||"").toLowerCase().includes(q)
    || familyIds.has(String(x._id))
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
    const colspan = isAdmin ? 5 : 4;
    const message = q ? "Sin resultados para la búsqueda actual." : "Escribí un código o marca para buscar.";
    tr.innerHTML = `<td colspan="${colspan}" style="text-align:center; padding:28px; color:var(--muted)">${message}</td>`;
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
    if (state === "low") badge = `<span class="badge low">⚠️</span>`;

    const barPct  = state === "out" ? 0 : state === "low" ? 40 : 100;
    const barClass = state === "out" ? "bar-danger" : state === "low" ? "bar-warn" : "";

    const numColor = state === "out"
      ? "color:var(--danger); font-weight:800"
      : state === "low"
      ? "color:var(--warn); font-weight:800"
      : "color:var(--success)";

    const prevStock = window._prevStock?.[`${item.codigo}|${item.marca}`];
    const flipClass = prevStock !== undefined
      ? (stockNum > prevStock ? "stock-flip-up" : stockNum < prevStock ? "stock-flip-down" : "")
      : "";
    if (!window._prevStock) window._prevStock = {};
    window._prevStock[`${item.codigo}|${item.marca}`] = stockNum;

    const stockCell = `
      <div class="stock-bar-wrap">
        <span class="stock-num ${flipClass}" style="${numColor}">${stockNum}</span>
        <div class="stock-bar">
          <div class="stock-bar-fill ${barClass}" style="width:${barPct}%"></div>
        </div>
      </div>`;

    const minusDisabled = stockNum === 0;
    const acciones = isAdmin ? `
      <td class="col-acciones">
        <div class="btn-group">
          <button class="mini success" data-act="in" data-tooltip="Entrada"
            data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${stockNum}">+</button>
          <button class="mini danger" data-act="out" data-tooltip="Salida"
            data-disabled="${minusDisabled?"1":"0"}"
            ${minusDisabled?"disabled":""}
            data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${stockNum}">−</button>
          <button class="mini" data-act="set" data-tooltip="Editar"
            data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${stockNum}" data-u="${escapeHtml(item.ubicacion || "")}">✏️</button>
          <button class="mini" data-act="equiv" data-tooltip="Equivalencias"
            data-id="${item._id||""}" data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}">🔗</button>
          <button class="mini" data-act="minimo" data-tooltip="Stock mínimo"
            data-id="${item._id||""}" data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-min="${item.stockMinimo!==undefined?item.stockMinimo:2}">⚠️</button>
          <button class="mini del" data-act="del" data-tooltip="Eliminar"
            data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}">🗑</button>
        </div>
      </td>` : "";

    tr.dataset.c = item.codigo || "";
    tr.dataset.m = item.marca  || "";
    tr.style.cursor = "pointer";
    tr.innerHTML = `
      <td class="col-codigo">${highlight(item.codigo||"", q)}</td>
      <td class="col-marca">${highlight(item.marca||"", q)}</td>
      <td class="col-stock">${stockCell}</td>
      <td class="col-ubicacion">${ubicacionBadge(item.ubicacion)}</td>
      ${acciones}
    `;
    tbody.appendChild(tr);
  }

  const filteredUnits = working.reduce((acc, i) => acc + Number(i.stock || 0), 0);
  $("status").textContent = q
    ? `Mostrando ${working.length} de ${list.length} coincidencias · ${filteredUnits} unidades en vista.`
    : "Escribí un código o marca para buscar.";
}
