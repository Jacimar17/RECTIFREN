import { escapeHtml } from "./ui.js";
import { icon } from "./ui/icons.js";

export function createBetaView(results) {
  function fmtPrecio(value) {
    const price = Number(value);
    if (!Number.isFinite(price)) return "—";
    return price.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0
    });
  }

  function safeHttpUrl(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value) ? value : "";
  }

  function photoMarkup(value, code, sizeClass = "") {
    const url = safeHttpUrl(value);
    const label = escapeHtml(code || "Foto del producto");
    if (!url) {
      return `<div class="beta-photo-frame ${sizeClass}">
        <div class="beta-photo-placeholder">${icon("camera")}<span>Foto no disponible</span></div>
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

  function renderVehicleOffer(item, provider) {
    const code = item.codigoProveedor || "Código s/d";
    const priceAmount = item.precio?.importe;
    const price = priceAmount === null || priceAmount === undefined
      ? "Precio no informado"
      : fmtPrecio(priceAmount);
    const availability = item.stock?.cantidad !== null && item.stock?.cantidad !== undefined
      ? `${item.stock.cantidad} u. · ${item.stock.estado === "sin_stock" ? "Sin stock" : "Disponible"}`
      : ({
        disponible: "Disponible",
        limitado: "Stock limitado",
        sin_stock: "Sin stock",
        desconocido: "Disponibilidad s/d",
      }[item.stock?.estado] || "Disponibilidad s/d");
    const url = safeHttpUrl(item.url);
    const codeMarkup = url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(code)}</a>`
      : `<strong>${escapeHtml(code)}</strong>`;
    return `<div class="beta-vehicle-offer beta-vehicle-offer-${provider.toLowerCase()}">
      <div class="beta-vehicle-offer-heading">${codeMarkup}<strong>${escapeHtml(price)}</strong></div>
      <span>${escapeHtml(item.marca || item.descripcion || provider)}</span>
      <small>${escapeHtml(availability)}</small>
    </div>`;
  }

  function renderVehicleOfferCell(product, provider) {
    const items = product.ofertas?.[provider.id] || [];
    if (items.length) return items.map((item) => renderVehicleOffer(item, provider.nombre)).join("");
    const error = (product.errores || []).find((item) =>
      String(item.proveedor || "").toLowerCase() === provider.nombre.toLowerCase()
      || String(item.proveedor || "").toLowerCase() === "litton"
    );
    return error
      ? `<span class="beta-vehicle-offer-error">${escapeHtml(error.error)}</span>`
      : `<span class="beta-vehicle-no-offer">Sin coincidencias en ${escapeHtml(provider.nombre)}</span>`;
  }

  function renderVehicleResults(response, pageChanged) {
    const items = Array.isArray(response.data) ? response.data : [];
    const errors = Array.isArray(response.errores) ? response.errores : [];
    const providers = Array.isArray(response.proveedores) && response.proveedores.length
      ? response.proveedores
      : [{ id: "aimar", nombre: "Aimar" }, { id: "atonor", nombre: "ATONOR" }];
    const query = response.query || {};
    let html = errors.map((error) =>
      `<div class="hint beta-error"><strong>${escapeHtml(error.proveedor || "Litton")}:</strong> ${escapeHtml(error.error || "Error en la búsqueda.")}</div>`
    ).join("");

    if (!items.length && !errors.length) {
      results.innerHTML = `${html}<div class="beta-empty-state">No encontré pastillas para ${escapeHtml(query.marca || "")} ${escapeHtml(query.modelo || "")}.</div>`;
      return;
    }

    if (items.length) {
      html += `<p class="beta-vehicle-summary">Aplicación: <strong>${escapeHtml(query.marca || "")} ${escapeHtml(query.modelo || "")}</strong>. Se muestran todas las variantes de esta página.</p>
        <div class="beta-vehicle-table-wrap">
          <table class="beta-vehicle-table">
            <thead><tr><th scope="col">Pastilla Litton</th>${providers.map((provider) => `<th scope="col">${escapeHtml(provider.nombre)}</th>`).join("")}</tr></thead>
            <tbody>${items.map((item) => `<tr>
              <th scope="row"><div class="beta-vehicle-product">
                ${photoMarkup(item.imagen, item.codigo, "beta-vehicle-photo")}
                <div><strong>${escapeHtml(item.codigo || "Código s/d")}</strong><span>${escapeHtml(item.nombre || "Sin descripción disponible")}</span><small>${escapeHtml(item.marca || "LITTON")}</small></div>
              </div></th>
              ${providers.map((provider) => `<td>${renderVehicleOfferCell(item, provider)}</td>`).join("")}
            </tr>`).join("")}</tbody>
          </table>
        </div>`;
    }

    const pagination = response.pagination || {};
    const currentPage = Number(response.page || pagination.page || 1);
    const totalPages = Number(pagination.pages || pagination.totalPages || pagination.total_pages || 0);
    if (totalPages > 1) {
      html += `<nav class="beta-vehicle-pagination" aria-label="Páginas de resultados">
        <button type="button" class="beta-vehicle-page-button" data-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>Anterior</button>
        <span>Página ${currentPage} de ${totalPages}</span>
        <button type="button" class="beta-vehicle-page-button" data-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>Siguiente</button>
      </nav>`;
    }

    results.innerHTML = html;
    results.querySelectorAll(".beta-vehicle-page-button").forEach((button) => {
      button.addEventListener("click", () => pageChanged(Number(button.dataset.page)));
    });
  }

  function renderProviderItem(item, provider) {
    const code = item.codigo || "Código s/d";
    const brand = typeof item.marca === "string" ? item.marca.trim() : "";
    const providerClass = provider.toLowerCase();
    return `<article class="beta-provider-card beta-provider-card-${providerClass}">
      ${photoMarkup(item.imagen, code, "beta-provider-photo")}
      <div class="beta-provider-card-content">
        ${brand ? `<div class="beta-provider-brand">${escapeHtml(brand)}</div>` : ""}
        <div class="beta-provider-code">${escapeHtml(code)}</div>
        <div class="beta-provider-price">${fmtPrecio(item.precio)}</div>
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

  function renderInventorySection() {
    return `<section class="beta-inventory-section" aria-labelledby="beta-inventory-title">
      <header class="beta-inventory-heading">
        <h2 id="beta-inventory-title">En tu inventario</h2>
      </header>
      <div class="beta-inventory-state">
        <div class="beta-provider-loading"><div class="spinner" aria-hidden="true"></div><span>Buscando códigos relacionados en tu inventario…</span></div>
      </div>
    </section>`;
  }

  function updateInventorySection(response, responseError = "") {
    const section = results.querySelector(".beta-inventory-state");
    if (!section) return;
    if (responseError || !response?.ok) {
      section.innerHTML = `<p class="beta-detail-error">${escapeHtml(responseError || response?.error || "No se pudo consultar el inventario.")}</p>`;
      return;
    }

    const families = Array.isArray(response.familias) ? response.familias : [];
    const familyRows = families.flatMap((family) => Array.isArray(family.filas) ? family.filas : []);
    const items = familyRows.length ? familyRows : (Array.isArray(response.data) ? response.data : []);
    const warning = response.littonError
      ? `<p class="beta-inventory-warning">El cruce con Litton fue parcial: ${escapeHtml(response.littonError)}</p>`
      : "";
    const uniqueItems = [...new Map(items.map((item) => [
      String(item._id || `${item.codigo}|${item.marca}|${item.ubicacion}`),
      item
    ])).values()];
    if (!uniqueItems.length) {
      section.innerHTML = `${warning}<p class="beta-inventory-empty">No hay productos relacionados en tu inventario.</p>`;
      return;
    }

    const totals = { NEGOCIO: 0, DEPOSITO_GALPON: 0, total: 0 };
    const rows = uniqueItems.map((item) => {
      const stock = Number(item.stock ?? 0);
      const quantity = Number.isFinite(stock) ? stock : 0;
      const location = item.ubicacion === "NEGOCIO" ? "NEGOCIO" : "DEPOSITO_GALPON";
      totals[location] += quantity;
      totals.total += quantity;
      const locationLabel = location === "NEGOCIO" ? "Negocio" : "Depósito/Galpón";
      return `<li class="beta-inventory-row">
        <span class="beta-inventory-product"><strong>${escapeHtml(item.codigo || "Código s/d")}</strong><span>${escapeHtml(item.marca || "Marca no informada")}</span></span>
        <span class="inventory-location-badge ${location === "NEGOCIO" ? "inventory-location-business" : "inventory-location-depot"}">${locationLabel}</span>
        <span class="beta-inventory-stock">${escapeHtml(String(quantity))} u.</span>
      </li>`;
    }).join("");

    section.innerHTML = `${warning}<ul class="beta-inventory-rows">${rows}</ul>
      <div class="beta-inventory-totals">
        <span>Negocio: <strong>${escapeHtml(String(totals.NEGOCIO))} u.</strong></span>
        <span>Depósito/Galpón: <strong>${escapeHtml(String(totals.DEPOSITO_GALPON))} u.</strong></span>
        <span>Total: <strong>${escapeHtml(String(totals.total))} u.</strong></span>
      </div>`;
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
    renderVehicleResults,
    renderInventorySection,
    updateInventorySection,
    renderProviderSection,
    updateProviderSections
  };
}
