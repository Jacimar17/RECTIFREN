import { apiGet } from "./api.js";
import { $, escapeHtml, fmtDate } from "./ui.js";

export function createMovementController({ getIsAdmin }) {
  let sortCol = "fecha";
  let sortDir = "desc";
  let cache = [];

  async function loadMovs() {
    const panel = $("movPanel");
    if (!panel) return;
    if (!getIsAdmin()) { panel.style.display = "none"; return; }
    panel.style.display = "block";
    const range = $("movRange").value;
    const status = $("movStatus");
    status.textContent = "Cargando movimientos...";
    try {
      const data = await apiGet({ action: "movements", range });
      if (!data.ok) { status.textContent = `Error: ${data.error || "No se pudo cargar."}`; return; }
      cache = data.data || [];
      renderMovs(cache);
      status.textContent = `Movimientos: ${cache.length}`;
    } catch (err) {
      status.textContent = `Error: ${String(err)}`;
    }
  }

  async function openHistModal(codigo, marca) {
    const overlay = $("histOverlay");
    if (!overlay) return;
    $("histCodigo").textContent = codigo;
    $("histMarca").textContent = marca;
    $("histTitle").textContent = `Historial — ${codigo}`;
    $("histStatus").textContent = "Cargando…";
    $("histTbody").innerHTML = "";
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
    try {
      const data = await apiGet({ action: "movements", range: "month" });
      const all = (data.ok ? data.data || [] : [])
        .filter(movement => movement.codigo === codigo && movement.marca === marca);
      const tbody = $("histTbody");
      tbody.innerHTML = "";
      if (all.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">Sin movimientos recientes.</td></tr>`;
      } else {
        for (const movement of all) {
          const row = document.createElement("tr");
          const isIn = movement.accion === "in" || movement.accion === "IN";
          const isDel = movement.accion === "delete" || movement.accion === "DELETE";
          const color = isIn ? "color:var(--success)" : isDel ? "color:var(--danger)" : "color:var(--warn)";
          row.innerHTML = `
            <td>${escapeHtml(fmtDate(movement.createdAt || movement.fecha))}</td>
            <td style="${color};font-weight:700">${escapeHtml(movement.accion)}</td>
            <td class="center">${Number(movement.cantidad || 0)}</td>
            <td class="center">${Number(movement.stock_anterior || 0)}</td>
            <td class="center">${Number(movement.stock_nuevo || 0)}</td>
            <td>${escapeHtml(movement.nota || "")}</td>
          `;
          tbody.appendChild(row);
        }
      }
      $("histStatus").textContent = `${all.length} movimiento(s) en los últimos 30 días.`;
    } catch (err) {
      $("histStatus").textContent = `Error: ${String(err)}`;
    }
  }

  function closeHistModal() {
    const overlay = $("histOverlay");
    if (!overlay) return;
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  }

  function renderMovs(data) {
    const tbody = $("movTbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    const rows = [...data].sort((a, b) => {
      let va = sortCol === "fecha" ? (a.createdAt || a.fecha || "") : (a[sortCol] ?? "");
      let vb = sortCol === "fecha" ? (b.createdAt || b.fecha || "") : (b[sortCol] ?? "");
      if (sortCol === "cantidad") { va = Number(va); vb = Number(vb); }
      if (sortCol === "fecha") { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "es");
      return sortDir === "desc" ? -cmp : cmp;
    });
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--muted)">Sin movimientos.</td></tr>`;
      return;
    }
    for (const movement of rows) {
      const row = document.createElement("tr");
      const isIn = (movement.accion || "").toLowerCase() === "in";
      const color = isIn ? "color:var(--success)" : "color:var(--warn)";
      row.innerHTML = `
        <td>${escapeHtml(fmtDate(movement.createdAt || movement.fecha))}</td>
        <td style="${color};font-weight:700">${escapeHtml(movement.accion)}</td>
        <td>${escapeHtml(movement.codigo)}</td>
        <td>${escapeHtml(movement.marca)}</td>
        <td class="center">${Number(movement.cantidad || 0)}</td>
        <td class="center">${Number(movement.stock_anterior || 0)}</td>
        <td class="center">${Number(movement.stock_nuevo || 0)}</td>
        <td>${escapeHtml(movement.nota || "")}</td>
      `;
      tbody.appendChild(row);
    }
  }

  function bindMovSort() {
    document.querySelectorAll("th.mov-sortable").forEach(th => {
      th.addEventListener("click", () => {
        const col = th.dataset.mcol;
        if (sortCol === col) sortDir = sortDir === "asc" ? "desc" : "asc";
        else { sortCol = col; sortDir = col === "fecha" ? "desc" : "asc"; }
        document.querySelectorAll("th.mov-sortable").forEach(item => item.classList.remove("mov-sort-asc", "mov-sort-desc"));
        th.classList.add(sortDir === "asc" ? "mov-sort-asc" : "mov-sort-desc");
        renderMovs(cache);
      });
    });
  }

  function bindHistModal() {
    const overlay = $("histOverlay");
    if (!overlay) return;
    $("btnCloseHist")?.addEventListener("click", closeHistModal);
    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeHistModal();
    });
  }

  return { loadMovs, openHistModal, bindMovSort, bindHistModal, closeHistModal };
}
