import { $, escapeHtml, getStockState, ubicacionBadge } from "./dom.js";
import { highlight } from "./render-utils.js";

export function renderCards({ list, isAdmin, viewFilter, query, highlightKey, sortCol, sortDir, rangeMin, rangeMax, familyMemberIds }) {
  const grid = document.getElementById("cardGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const q = (query||"").trim().toLowerCase();
  let working = [...list].sort((a,b) =>
    String(a.codigo||"").localeCompare(String(b.codigo||""),"es",{numeric:true,sensitivity:"base"})
  );

  const familyIds = familyMemberIds instanceof Set ? familyMemberIds : new Set();
  if (q) working = working.filter(x =>
    (x.codigo||"").toLowerCase().includes(q)
    || (x.marca||"").toLowerCase().includes(q)
    || familyIds.has(String(x._id))
  );
  if (viewFilter === "out") working = working.filter(i => getStockState(i) === "out");
  if (viewFilter === "low") working = working.filter(i => getStockState(i) === "low");
  if (rangeMin !== null && rangeMin !== undefined) working = working.filter(i => Number(i.stock||0) >= rangeMin);
  if (rangeMax !== null && rangeMax !== undefined) working = working.filter(i => Number(i.stock||0) <= rangeMax);

  if (sortCol) {
    working = [...working].sort((a,b) => {
      let va = a[sortCol]??"", vb = b[sortCol]??"";
      if (sortCol==="stock"){va=Number(va);vb=Number(vb);}
      const cmp = typeof va==="number"?va-vb:String(va).localeCompare(String(vb),"es",{numeric:true,sensitivity:"base"});
      return sortDir==="desc"?-cmp:cmp;
    });
  }

  if (working.length === 0) {
    const message = q ? "Sin resultados para la búsqueda actual." : "Escribí un código o marca para buscar.";
    grid.innerHTML = `<div style="text-align:center;padding:32px;color:var(--muted)">${message}</div>`;
    return;
  }

  for (const item of working) {
    const stockNum = Number(item.stock||0);
    const state    = getStockState(item);
    const barPct   = state==="out"?0:state==="low"?40:100;
    const barColor = state==="out"?"var(--danger)":state==="low"?"var(--warn)":"var(--success)";
    const sClass   = state==="out"?"s-out":state==="low"?"s-low":"s-ok";
    const cClass   = state==="out"?"card-out":state==="low"?"card-low":"card-ok";

    const card = document.createElement("div");
    card.className = `stock-card ${cClass}`;
    card.dataset.c = item.codigo||"";
    card.dataset.m = item.marca||"";

    let badge = "";
    if (state==="out") badge=`<span class="badge out">SIN STOCK</span>`;
    if (state==="low") badge=`<span class="badge low">BAJO</span>`;

    const actions = isAdmin ? `
      <div class="stock-card-actions">
        <button class="mini success" data-act="in"  data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${stockNum}">+ Entrada</button>
        <button class="mini danger"  data-act="out" data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${stockNum}" ${stockNum===0?"disabled":""}>− Salida</button>
        <button class="mini"         data-act="set" data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-s="${stockNum}" data-u="${escapeHtml(item.ubicacion || "")}">✏️</button>
        <button class="mini"         data-act="equiv"  data-id="${item._id||""}" data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}">🔗</button>
        <button class="mini"         data-act="minimo" data-id="${item._id||""}" data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}" data-min="${item.stockMinimo!==undefined?item.stockMinimo:2}">⚠️</button>
        <button class="mini del"     data-act="del" data-c="${escapeHtml(item.codigo)}" data-m="${escapeHtml(item.marca)}">🗑</button>
      </div>` : "";

    card.innerHTML = `
      <div class="stock-card-body">
        <div class="stock-card-info">
          <div class="stock-card-codigo">${highlight(item.codigo||"", q)} ${badge}</div>
          <div class="stock-card-marca">${highlight(item.marca||"", q)}</div>
          <div class="stock-card-location">${ubicacionBadge(item.ubicacion)}</div>
        </div>
        <div class="stock-card-right">
          <div class="stock-card-stock ${sClass}">${stockNum}</div>
        </div>
      </div>
      <div class="stock-card-bar">
        <div class="stock-card-bar-fill" style="width:${barPct}%;background:${barColor}"></div>
      </div>
      ${actions}
    `;
    grid.appendChild(card);
  }
}
