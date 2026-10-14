import { escapeHtml } from "./ui.js";

export function createBetaView(results) {
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
    if (typeof item.stockDisponible === "boolean") {
      const label = item.stockDisponible ? "Disponible" : "Sin stock";
      const className = item.stockDisponible ? "beta-ok" : "beta-stock-empty";
      return `<span class="beta-badge ${className}">${label}</span>`;
    }
    if (item.stockProveedor == null || item.stockProveedor === "") {
      return `<span class="beta-badge beta-stock-unknown">Stock no informado</span>`;
    }
    const stock = Number(item.stockProveedor);
    if (!Number.isFinite(stock)) {
      return `<span class="beta-badge beta-stock-unknown">Stock no informado</span>`;
    }
    if (stock > 0) {
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
    const measures = item.medidas ? `<span class="beta-provider-measures">${escapeHtml(item.medidas)}</span>` : "";
    const providerClass = provider.toLowerCase();
    const matchCode = item.codigoConsultado
      ? `<div class="beta-provider-match">Coincidencia por <strong>${escapeHtml(item.codigoConsultado)}</strong></div>`
      : "";
    return `<article class="beta-provider-card beta-provider-card-${providerClass}">
      ${photoMarkup(item.imagen, code, "beta-provider-photo")}
      <div class="beta-provider-card-content">
        <div class="beta-provider-code">${escapeHtml(code)}</div>
        <div class="beta-provider-price">${fmtPrecio(item.precio)}</div>
        ${matchCode}
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
    return `<section class="beta-provider-section beta-provider-section-${provider.toLowerCase()}" data-provider="${provider}">
      <header class="beta-provider-heading">
        <span class="beta-provider-heading-mark" aria-hidden="true"></span>
        <div><h3>${provider}</h3><p>Disponibilidad y precios</p></div>
      </header>
      <div class="beta-provider-state">${loading}</div>
    </section>`;
  }

  function updateProviderSections(response, responseError = "") {
    const errors = response?.errores || [];
    const familyCodes = results.querySelector(".beta-family-codes");
    if (familyCodes) {
      const codes = Array.isArray(response?.equivalencias) ? response.equivalencias : [];
      familyCodes.innerHTML = codes.length
        ? `<span class="beta-family-label">Códigos de la familia</span><div class="beta-family-code-list">${codes.map((item) => `<span class="beta-family-code">${escapeHtml(item.codigo)}</span>`).join("")}</div>`
        : "";
    }
    const groups = [
      ["ATONOR", response?.data?.atonor || []],
      ["Aimar", response?.data?.aimar || []]
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

  return {
    fmtPrecio,
    safeHttpUrl,
    photoMarkup,
    semaforo,
    renderResults,
    renderProviderSection,
    updateProviderSections
  };
}
