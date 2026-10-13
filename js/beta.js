import { apiBetaProveedores, apiDetalleProveedores } from "./api.js";
import { $, escapeHtml, showToast } from "./ui.js";

export function bindBetaModal({ getIsAdmin, getAdminToken, adminLogout, isBusy }) {
  const overlay = $("betaOverlay");
  const results = $("betaResults");
  const lightbox = $("betaLightbox");
  if (!overlay || !results || !lightbox) return;

  let lastLittonResponse = null;
  let selectedResultIndex = -1;
  let activeViewId = 0;
  let inventoryVersion = 0;
  const detailCache = new Map();
  const detailRequests = new Map();

  function openBetaModal() {
    $("betaStatus").textContent = "";
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
    setTimeout(() => $("betaSearch")?.focus(), 80);
  }

  function closeBetaModal() {
    closeLightbox();
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  }

  function fmtPrecio(value) {
    const price = Number(value);
    if (!Number.isFinite(price)) return "—";
    return price.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  }

  function safeHttpUrl(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value) ? value : "";
  }

  function photoMarkup(value, code, sizeClass = "") {
    const url = safeHttpUrl(value);
    const label = escapeHtml(code || "Foto del producto");
    if (!url) {
      return `<div class="beta-photo-frame ${sizeClass}">
        <div class="beta-photo-placeholder"><span aria-hidden="true">📷</span><span>Foto no disponible</span></div>
      </div>`;
    }
    return `<div class="beta-photo-frame ${sizeClass}">
      <img class="beta-photo-image beta-zoomable" src="${escapeHtml(url)}" alt="${label}" data-caption="${label}" loading="lazy">
    </div>`;
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

  function providerStockBadge(item) {
    if (item.stockProveedor == null || item.stockProveedor === "") {
      return `<span class="beta-badge beta-stock-unknown">Stock no informado</span>`;
    }
    const stock = Number(item.stockProveedor);
    if (!Number.isFinite(stock)) {
      return `<span class="beta-badge beta-stock-unknown">Stock no informado</span>`;
    }
    if (Number.isFinite(stock) && stock > 0) {
      return `<span class="beta-badge beta-ok">${escapeHtml(String(stock))} u.</span>`;
    }
    return `<span class="beta-badge beta-stock-empty">Sin stock</span>`;
  }

  function renderResultCard(item, index) {
    const code = item.codigo || "Código s/d";
    return `<article class="beta-result-card" tabindex="0" role="button" data-result-index="${index}" aria-label="Ver detalle de ${escapeHtml(code)}">
      ${photoMarkup(item.imagen, code, "beta-result-photo")}
      <div class="beta-result-info">
        <div class="beta-code">${escapeHtml(code)}</div>
        <div class="beta-brand">${escapeHtml(item.marca || "Marca no informada")}</div>
        <div class="beta-name">${escapeHtml(item.nombre || "Sin descripción disponible")}</div>
        <div class="beta-result-badges">${semaforo(item.stockProveedor)}</div>
      </div>
      <div class="beta-result-price">${fmtPrecio(item.precio)}</div>
    </article>`;
  }

  function renderResults(response) {
    const items = response.data || [];
    const errors = response.errores || [];
    let html = "";
    for (const error of errors) {
      html += `<div class="hint beta-error"><strong>${escapeHtml(error.proveedor)}:</strong> ${escapeHtml(error.error)}</div>`;
    }
    if (!items.length && !errors.length) {
      html += `<div class="beta-empty-state">No encontré resultados. Probá con otro código.</div>`;
    }
    if (items.length) {
      html += `<div class="beta-results-grid">${items.map(renderResultCard).join("")}</div>`;
    }
    results.innerHTML = html;
  }

  function renderProviderItem(item, provider) {
    const code = item.codigo || "Código s/d";
    const link = safeHttpUrl(item.link);
    const measures = item.medidas ? `<span>${escapeHtml(item.medidas)}</span>` : "";
    return `<article class="beta-provider-card">
      ${photoMarkup(item.imagen, code, "beta-provider-photo")}
      <div class="beta-provider-card-content">
        <div class="beta-provider-code">${escapeHtml(code)}</div>
        <div class="beta-provider-price">${fmtPrecio(item.precio)}</div>
        <div class="beta-provider-meta">${escapeHtml(item.marca || "Marca no informada")}${item.nombre ? ` · ${escapeHtml(item.nombre)}` : ""}${measures ? ` · ${measures}` : ""}</div>
          <div class="beta-provider-badges">${providerStockBadge(item)}</div>
        ${link
          ? `<a class="beta-provider-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Ver en ${provider}</a>`
          : `<span class="beta-provider-link beta-provider-link-disabled">Enlace no disponible</span>`}
      </div>
    </article>`;
  }

  function renderProviderSection(provider) {
    const loading = `<div class="beta-provider-loading"><div class="spinner" aria-hidden="true"></div><span>Buscando en ${provider}…</span></div>`;
    return `<section class="beta-provider-section" data-provider="${provider}">
      <h3>${provider}</h3>
      <div class="beta-provider-state">${loading}</div>
    </section>`;
  }

  function updateProviderSections(response, responseError = "") {
    const errors = response?.errores || [];
    const groups = [
      ["Aimar", response?.data?.aimar || []],
      ["ATONOR", response?.data?.atonor || []]
    ];
    for (const [provider, items] of groups) {
      const section = results.querySelector(`[data-provider="${provider}"] .beta-provider-state`);
      if (!section) continue;
      const providerError = errors.find(item => item.proveedor === provider);
      if (providerError) {
        section.innerHTML = `<p class="beta-detail-error">${escapeHtml(providerError.error)}</p>`;
      } else if (responseError) {
        section.innerHTML = `<p class="beta-detail-error">${escapeHtml(responseError)}</p>`;
      } else if (items.length) {
        section.innerHTML = items.map(item => renderProviderItem(item, provider)).join("");
      } else {
        section.innerHTML = `<p class="beta-empty-state">Sin coincidencias en ${provider}</p>`;
      }
    }
  }

  function updateInventoryFamily(family, error = "") {
    const panel = results.querySelector(".beta-inventory-family-state");
    if (!panel) return;
    if (error) {
      panel.innerHTML = `<p class="beta-detail-error">${escapeHtml(error)}</p>`;
      return;
    }
    if (!family || !Array.isArray(family.filas) || !family.totales) {
      panel.innerHTML = `<p class="beta-detail-error">No se pudo cargar el inventario de la familia.</p>`;
      return;
    }

    const groups = [
      ["NEGOCIO", "Stock en el negocio"],
      ["DEPOSITO_GALPON", "Depósito/Galpón"],
    ];
    const sections = groups.map(([location, title]) => {
      const items = family.filas.filter(item => item.ubicacion === location);
      const rows = items.length
        ? items.map(item => `<li><span><strong>${escapeHtml(item.codigo || "Código s/d")}</strong> · ${escapeHtml(item.marca || "Marca no informada")}</span><b>${escapeHtml(String(item.stock ?? 0))} u.</b></li>`).join("")
        : `<li class="beta-family-empty">Sin productos en esta ubicación.</li>`;
      return `<section class="beta-inventory-location">
        <div class="beta-inventory-location-heading"><h4>${title}</h4><strong>${escapeHtml(String(family.totales[location] ?? 0))} u.</strong></div>
        <ul>${rows}</ul>
      </section>`;
    }).join("");

    panel.innerHTML = `<div class="beta-inventory-locations">${sections}</div>
      <div class="beta-family-total"><span>Total de la familia</span><strong>${escapeHtml(String(family.totales.total ?? 0))} u.</strong></div>`;
  }

  async function getProviderDetails(item) {
    const code = item.codigo || "";
    const cached = detailCache.get(code);
    if (cached?.version === inventoryVersion) return cached.response;
    const requestKey = `${inventoryVersion}:${code}`;
    if (detailRequests.has(requestKey)) return detailRequests.get(requestKey);

    const requestVersion = inventoryVersion;
    const request = (async () => {
      const token = getAdminToken();
      if (!token) {
        adminLogout();
        throw new Error("La sesión venció. Ingresá nuevamente.");
      }
      const response = await apiDetalleProveedores(code, item.aimarCode || code, token);
      if (response.ok && requestVersion === inventoryVersion) {
        detailCache.set(code, { version: requestVersion, response });
      }
      return response;
    })();
    detailRequests.set(requestKey, request);
    try {
      return await request;
    } finally {
      detailRequests.delete(requestKey);
    }
  }

  async function showDetails(item, index) {
    selectedResultIndex = index;
    const viewId = ++activeViewId;
    const code = item.codigo || "";
    results.innerHTML = `<button type="button" class="beta-back-button">← Volver a resultados</button>
      <section class="beta-main-product">
        ${photoMarkup(item.imagen, code, "beta-main-photo")}
        <div class="beta-main-info">
          <div class="beta-code beta-code-large">${escapeHtml(code || "Código s/d")}</div>
          <div class="beta-price beta-price-large">${fmtPrecio(item.precio)}</div>
          <div class="beta-brand">${escapeHtml(item.marca || "Marca no informada")}</div>
          <div class="beta-name">${escapeHtml(item.nombre || "Sin descripción disponible")}</div>
          <div class="beta-result-badges">${semaforo(item.stockProveedor)}</div>
        </div>
      </section>
      <section class="beta-inventory-family">
        <h2>En tu inventario</h2>
        <div class="beta-inventory-family-state"><div class="beta-provider-loading"><div class="spinner" aria-hidden="true"></div><span>Buscando en tu inventario…</span></div></div>
      </section>
      <h2 class="beta-suppliers-title">Dónde conseguirla</h2>
      <div class="beta-suppliers-grid">
        ${renderProviderSection("Aimar")}
        ${renderProviderSection("ATONOR")}
      </div>`;

    const cached = detailCache.get(code);
    if (cached?.version === inventoryVersion) {
      const response = cached.response;
      updateProviderSections(response);
      updateInventoryFamily(response.inventarioFamilia, response.inventarioError || "");
      return;
    }

    try {
      const response = await getProviderDetails(item);
      if (viewId !== activeViewId) return;
      if (!response.ok) {
        updateProviderSections(null, response.error || "No se pudieron consultar los proveedores.");
        updateInventoryFamily(null, response.error || "No se pudo consultar el inventario de la familia.");
        return;
      }
      updateProviderSections(response);
      updateInventoryFamily(response.inventarioFamilia, response.inventarioError || "");
    } catch (error) {
      if (viewId !== activeViewId) return;
      updateProviderSections(null, error.message || "Error al consultar los proveedores.");
      updateInventoryFamily(null, error.message || "Error al consultar el inventario.");
    }
  }

  function showResultsAndRestoreFocus() {
    ++activeViewId;
    if (!lastLittonResponse) return;
    renderResults(lastLittonResponse);
    const selected = results.querySelector(`[data-result-index="${selectedResultIndex}"]`);
    selected?.focus();
  }

  function openLightbox(image) {
    const source = safeHttpUrl(image.currentSrc || image.src);
    if (!source) return;
    const lightboxImage = lightbox.querySelector(".beta-lightbox-image");
    lightboxImage.src = source;
    lightboxImage.alt = image.alt || "";
    lightbox.querySelector(".beta-lightbox-caption").textContent = image.dataset.caption || image.alt || "";
    lightbox.style.display = "flex";
    lightbox.setAttribute("aria-hidden", "false");
    lightbox.querySelector(".beta-lightbox-close").focus();
  }

  function closeLightbox() {
    lightbox.style.display = "none";
    lightbox.setAttribute("aria-hidden", "true");
    const image = lightbox.querySelector(".beta-lightbox-image");
    image.removeAttribute("src");
  }

  async function buscarBeta() {
    const query = $("betaSearch").value.trim();
    if (!query) { $("betaStatus").textContent = "Escribí un código o producto."; return; }
    if (!getIsAdmin()) { showToast("Ingresá como administrador para usar la beta.", "error"); return; }

    const button = $("btnBetaSearch");
    button.disabled = true;
    $("betaStatus").textContent = "";
    results.innerHTML = `<div class="beta-search-loading"><div class="spinner" aria-hidden="true"></div><span>Buscando en Litton…</span></div>`;

    try {
      const token = getAdminToken();
      if (!token) {
        adminLogout();
        showToast("La sesión venció. Ingresá nuevamente.", "error");
        return;
      }
      const response = await apiBetaProveedores(query, token);
      if (!response.ok) {
        results.innerHTML = "";
        $("betaStatus").textContent = response.error || "Error en la búsqueda.";
        return;
      }
      lastLittonResponse = response;
      selectedResultIndex = -1;
      renderResults(response);
      $("betaStatus").textContent = `${response.total} resultado(s) para "${query}"`;
    } catch (error) {
      results.innerHTML = "";
      $("betaStatus").textContent = `Error: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  $("btnBeta")?.addEventListener("click", () => { if (!isBusy()) openBetaModal(); });
  $("btnCloseBeta")?.addEventListener("click", () => { if (!isBusy()) closeBetaModal(); });
  $("btnBetaSearch")?.addEventListener("click", buscarBeta);
  $("betaResults")?.addEventListener("click", event => {
    if (event.target.closest(".beta-back-button")) {
      showResultsAndRestoreFocus();
      return;
    }
    const card = event.target.closest(".beta-result-card");
    if (card) {
      const index = Number(card.dataset.resultIndex);
      const item = lastLittonResponse?.data?.[index];
      if (item) showDetails(item, index);
    }
  });
  $("betaResults")?.addEventListener("keydown", event => {
    const card = event.target.closest(".beta-result-card");
    if (!card || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    const index = Number(card.dataset.resultIndex);
    const item = lastLittonResponse?.data?.[index];
    if (item) showDetails(item, index);
  });
  $("betaSearch")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !isBusy()) buscarBeta();
  });
  overlay.addEventListener("error", event => {
    const image = event.target.closest?.(".beta-zoomable");
    if (!image) return;
    const placeholder = document.createElement("div");
    placeholder.className = "beta-photo-placeholder";
    placeholder.innerHTML = `<span aria-hidden="true">📷</span><span>Foto no disponible</span>`;
    image.replaceWith(placeholder);
  }, true);
  overlay.addEventListener("click", event => {
    const zoomable = event.target.closest?.(".beta-zoomable");
    if (zoomable) {
      event.preventDefault();
      event.stopPropagation();
      openLightbox(zoomable);
      return;
    }
    if (event.target === lightbox || event.target.closest?.(".beta-lightbox-close")) {
      closeLightbox();
      return;
    }
    if (event.target === overlay && !isBusy()) closeBetaModal();
  }, true);
  lightbox.addEventListener("click", event => {
    if (event.target === lightbox || event.target.closest?.(".beta-lightbox-close")) closeLightbox();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (lightbox.getAttribute("aria-hidden") === "false") {
      event.preventDefault();
      event.stopPropagation();
      closeLightbox();
    } else if (overlay.getAttribute("aria-hidden") === "false" && !isBusy()) {
      closeBetaModal();
    }
  });
  document.addEventListener("rectifren:inventory-updated", () => {
    inventoryVersion++;
    detailCache.clear();
    detailRequests.clear();
  });
}
