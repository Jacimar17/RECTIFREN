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
    const availability = {
      V: { label: "Disponible", color: "var(--success)", className: "beta-available" },
      A: { label: "Stock limitado", color: "var(--warn)", className: "beta-limited" },
      R: { label: "Sin stock", color: "var(--danger)", className: "beta-unavailable" }
    };
    const status = availability[level] || { label: "Sin información", color: "var(--muted)", className: "" };
    return `<span class="beta-supplier-stock ${status.className}" title="Disponibilidad informada por el proveedor">
      <span class="beta-dot" style="background:${status.color}" aria-hidden="true"></span>
      <span>${status.label}</span>
    </span>`;
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
        ? `<span class="beta-badge beta-ok">En inventario <strong>${escapeHtml(String(inventory.stock))} u.</strong> · ${escapeHtml(inventory.marca)}</span>`
        : `<span class="beta-badge beta-no">No está en tu inventario</span>`;
      const image = item.imagen
        ? `<img class="beta-img" src="${escapeHtml(item.imagen)}" alt="" loading="lazy" />`
        : `<div class="beta-img beta-img-empty" aria-hidden="true">▧</div>`;
      html += `
        <div class="beta-item">
          <div class="beta-image-wrap">${image}</div>
          <div class="beta-info">
            <div class="beta-heading">
              <div class="beta-title">${escapeHtml(item.codigo || "Código s/d")}</div>
              <span class="beta-provider">${escapeHtml(item.proveedor || "Proveedor")}</span>
            </div>
            <div class="beta-brand">${escapeHtml(item.marca || "Marca no informada")}</div>
            <div class="beta-name">${escapeHtml(item.nombre || "Sin descripción disponible")}</div>
            <div class="beta-details">
              <div class="beta-price">
                <span class="beta-meta-label">Precio</span>
                <strong>${fmtPrecio(item.precio)}</strong>
              </div>
              ${semaforo(item.stockProveedor)}
            </div>
            <div class="beta-inventory">${inventoryHtml}</div>
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
