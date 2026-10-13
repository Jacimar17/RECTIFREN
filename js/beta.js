import { apiBetaProveedores, apiDetalleProveedores } from "./api.js";
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

  function renderDetalleItem(item) {
    const stock = item.stockProveedor == null
      ? "Stock sin informar"
      : `Stock informado: ${escapeHtml(String(item.stockProveedor))} u.`;
    const image = item.imagen
      ? `<img class="beta-detail-img" src="${escapeHtml(item.imagen)}" alt="" loading="lazy">`
      : "";
    const link = item.link
      ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">Ver producto</a>`
      : "";
    return `<article class="beta-detail-item">
      ${image}
      <div class="beta-detail-info">
        <strong>${escapeHtml(item.codigo || "Código s/d")}</strong>
        <span>${escapeHtml(item.marca || "Marca no informada")}</span>
        <span>${escapeHtml(item.nombre || "Sin descripción")}</span>
        <span>${fmtPrecio(item.precio)} · ${stock}</span>
        ${link}
      </div>
    </article>`;
  }

  function renderDetalles(response) {
    const groups = [
      ["Aimar", response.data?.aimar || []],
      ["ATONOR", response.data?.atonor || []],
    ];
    const errors = response.errores || [];
    let html = "";

    for (const [name, items] of groups) {
      const error = errors.find(item => item.proveedor === name);
      html += `<section class="beta-detail-provider">
        <h4>${name}</h4>
        ${error
          ? `<p class="beta-detail-error">${escapeHtml(error.error)}</p>`
          : items.length
            ? items.map(renderDetalleItem).join("")
            : `<p class="muted">Sin coincidencias.</p>`}
      </section>`;
    }
    return html;
  }

  async function consultarDetalles(button) {
    const code = button.dataset.providerCode || "";
    const aimarCode = button.dataset.aimarCode || code;
    const panel = button.parentElement.querySelector(".beta-detail-results");
    if (!panel) return;

    if (button.getAttribute("aria-expanded") === "true") {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
      return;
    }

    button.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    if (panel.dataset.loaded === "true") return;

    button.disabled = true;
    panel.innerHTML = `<p class="muted">Consultando Aimar y ATONOR…</p>`;
    try {
      const token = getAdminToken();
      if (!token) {
        adminLogout();
        panel.innerHTML = `<p class="beta-detail-error">La sesión venció. Ingresá nuevamente.</p>`;
        return;
      }
      const response = await apiDetalleProveedores(code, aimarCode, token);
      if (!response.ok) {
        panel.innerHTML = `<p class="beta-detail-error">${escapeHtml(response.error || "No se pudieron consultar los proveedores.")}</p>`;
        return;
      }
      panel.innerHTML = renderDetalles(response);
      panel.dataset.loaded = "true";
    } catch (error) {
      panel.innerHTML = `<p class="beta-detail-error">Error: ${escapeHtml(error.message)}</p>`;
    } finally {
      button.disabled = false;
    }
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
            <div class="beta-detail-action">
              <button type="button" class="beta-detail-toggle" aria-expanded="false"
                data-provider-code="${escapeHtml(item.codigo || "")}"
                data-aimar-code="${escapeHtml(item.aimarCode || item.codigo || "")}">
                Consultar Aimar y ATONOR
              </button>
              <div class="beta-detail-results" hidden></div>
            </div>
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
  $("betaResults")?.addEventListener("click", event => {
    const button = event.target.closest(".beta-detail-toggle");
    if (button) consultarDetalles(button);
  });
  $("betaSearch")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !isBusy()) buscarBeta();
  });
  overlay.addEventListener("click", event => {
    if (event.target === overlay && !isBusy()) closeBetaModal();
  });
}
