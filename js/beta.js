import { apiBetaProveedores } from "./api.js";
import { $, escapeHtml, showToast } from "./ui.js";

export function bindBetaModal({ getIsAdmin, getAdminToken, adminLogout, isBusy }) {
  const overlay = $("betaOverlay");
  if (!overlay) return;

  function openBetaModal() {
    $("betaStatus").textContent = "";
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
    setTimeout(() => $("betaSearch")?.focus(), 80);
  }

  function closeBetaModal() {
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  }

  function fmtPrecio(value) {
    const price = Number(value);
    if (!Number.isFinite(price)) return "—";
    return price.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  }

  function semaforo(level) {
    const colors = { V: "var(--success)", A: "var(--warn)", R: "var(--danger)" };
    const color = colors[level] || "var(--muted)";
    return `<span class="beta-dot" style="background:${color}" title="Semáforo de stock del proveedor (${escapeHtml(level || "—")})"></span>`;
  }

  function renderResults(response) {
    const items = response.data || [];
    const errors = response.errores || [];
    let html = "";
    for (const error of errors) {
      html += `<div class="hint beta-error"><strong>${escapeHtml(error.proveedor)}:</strong> ${escapeHtml(error.error)}</div>`;
    }
    if (!items.length && !errors.length) {
      html += `<div class="hint">No encontré resultados. Probá con otro código.</div>`;
    }
    for (const item of items) {
      const inventory = item.enInventario;
      const inventoryHtml = inventory
        ? `<span class="beta-badge beta-ok">En tu inventario: ${escapeHtml(String(inventory.stock))} u. (${escapeHtml(inventory.marca)})</span>`
        : `<span class="beta-badge beta-no">No lo tenés</span>`;
      const image = item.imagen
        ? `<img class="beta-img" src="${escapeHtml(item.imagen)}" alt="" loading="lazy" />`
        : `<div class="beta-img"></div>`;
      html += `
        <div class="beta-item">
          ${image}
          <div class="beta-info">
            <div class="beta-title">${escapeHtml(item.codigo)} · ${escapeHtml(item.marca || item.proveedor)}</div>
            <div class="beta-name">${escapeHtml(item.nombre || "")}</div>
            <div class="beta-row">
              <strong>${fmtPrecio(item.precio)}</strong>
              ${semaforo(item.stockProveedor)}
              ${inventoryHtml}
            </div>
            <div class="muted tiny">Fuente: ${escapeHtml(item.proveedor)}</div>
          </div>
        </div>`;
    }
    $("betaResults").innerHTML = html;
  }

  async function buscarBeta() {
    const query = $("betaSearch").value.trim();
    if (!query) { $("betaStatus").textContent = "Escribí un código o producto."; return; }
    if (!getIsAdmin()) { showToast("Ingresá como administrador para usar la beta.", "error"); return; }

    const button = $("btnBetaSearch");
    button.disabled = true;
    $("betaStatus").textContent = "";
    $("betaResults").innerHTML = `
      <div class="beta-loading">
        <div class="spinner"></div>
        <div>Buscando en proveedores…<div class="muted">La primera búsqueda puede tardar unos segundos.</div></div>
      </div>`;

    try {
      const token = getAdminToken();
      if (!token) {
        adminLogout();
        showToast("La sesión venció. Ingresá nuevamente.", "error");
        return;
      }
      const response = await apiBetaProveedores(query, token);
      if (!response.ok) {
        $("betaResults").innerHTML = "";
        $("betaStatus").textContent = response.error || "Error en la búsqueda.";
        return;
      }
      renderResults(response);
      $("betaStatus").textContent = `${response.total} resultado(s) para "${query}"`;
    } catch (error) {
      $("betaResults").innerHTML = "";
      $("betaStatus").textContent = `Error: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  $("btnBeta")?.addEventListener("click", () => { if (!isBusy()) openBetaModal(); });
  $("btnCloseBeta")?.addEventListener("click", () => { if (!isBusy()) closeBetaModal(); });
  $("btnCloseBeta2")?.addEventListener("click", () => { if (!isBusy()) closeBetaModal(); });
  $("btnBetaSearch")?.addEventListener("click", buscarBeta);
  $("betaSearch")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !isBusy()) buscarBeta();
  });
  overlay.addEventListener("click", event => {
    if (event.target === overlay && !isBusy()) closeBetaModal();
  });
}
