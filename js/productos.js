/**
 * ============================================================
 * RECTIFREN — Catálogo Público (productos.html)
 * ============================================================
 */

import { CONTACT_INFO, MARCAS } from "./public-config.js";
import { apiGetCatalogoPublico } from "./api.js";

// Estado de la vista de catálogo
let currentQuery = "";
let currentMarca = "";
let currentPage = 1;
const PAGE_LIMIT = 24;
let debounceTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  initNoticeAndContacts();
  initMarcaFilterOptions();
  readUrlParams();
  bindCatalogEvents();
  cargarCatalogo();
});

/**
 * Llena enlaces de contacto comunes del footer y WhatsApp
 */
function initNoticeAndContacts() {
  const waUrl = `https://wa.me/${CONTACT_INFO.whatsapp}?text=${encodeURIComponent(CONTACT_INFO.whatsappMensaje)}`;

  const noticeWaLink = document.getElementById("noticeWaLink");
  if (noticeWaLink) noticeWaLink.href = waUrl;

  const btnWhatsappFloat = document.getElementById("btnWhatsappFloat");
  if (btnWhatsappFloat) btnWhatsappFloat.href = waUrl;

  const footerTel = document.getElementById("footerTel");
  if (footerTel) {
    footerTel.textContent = CONTACT_INFO.telefono;
    footerTel.href = `tel:${CONTACT_INFO.telefono.replace(/\s+/g, "")}`;
  }

  const footerWa = document.getElementById("footerWa");
  if (footerWa) {
    footerWa.textContent = `+${CONTACT_INFO.whatsapp}`;
    footerWa.href = waUrl;
  }

  const footerDir = document.getElementById("footerDir");
  if (footerDir) footerDir.textContent = CONTACT_INFO.direccion;

  const footerEmail = document.getElementById("footerEmail");
  if (footerEmail) {
    footerEmail.textContent = CONTACT_INFO.email;
    footerEmail.href = `mailto:${CONTACT_INFO.email}`;
  }

  const footerHorarios = document.getElementById("footerHorarios");
  if (footerHorarios) footerHorarios.textContent = CONTACT_INFO.horarios;

  const mapsIframe = document.getElementById("footerMapsIframe");
  if (mapsIframe) mapsIframe.src = CONTACT_INFO.googleMapsEmbedUrl;

  const btnOpenMaps = document.getElementById("btnOpenMaps");
  if (btnOpenMaps) btnOpenMaps.href = CONTACT_INFO.googleMapsUrl;
}

/**
 * Poblado de opciones en el select de filtro por marca
 */
function initMarcaFilterOptions() {
  const select = document.getElementById("catalogFilterMarca");
  if (!select) return;

  const options = ['<option value="">Todas las marcas</option>'];
  MARCAS.forEach(m => {
    options.push(`<option value="${m.nombre}">${m.nombre}</option>`);
  });
  select.innerHTML = options.join("");
}

/**
 * Lee parámetros de búsqueda o marca desde la URL (ej: ?q=528&marca=LITTON)
 */
function readUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q") || "";
  const marca = params.get("marca") || "";
  const cat = params.get("cat") || "";

  if (q) {
    currentQuery = q;
    const searchInput = document.getElementById("catalogSearchInput");
    if (searchInput) searchInput.value = q;
  } else if (cat) {
    // Si viene por categoría, usamos el término como búsqueda inicial
    currentQuery = cat.replace(/-/g, " ");
    const searchInput = document.getElementById("catalogSearchInput");
    if (searchInput) searchInput.value = currentQuery;
  }

  if (marca) {
    currentMarca = marca;
    const marcaSelect = document.getElementById("catalogFilterMarca");
    if (marcaSelect) marcaSelect.value = marca;
  }
}

/**
 * Vinculación de eventos de inputs, filtros y paginación
 */
function bindCatalogEvents() {
  const searchInput = document.getElementById("catalogSearchInput");
  const clearBtn = document.getElementById("catalogClearSearch");
  const marcaSelect = document.getElementById("catalogFilterMarca");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      if (clearBtn) clearBtn.style.display = val ? "inline-flex" : "none";

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentQuery = val;
        currentPage = 1;
        cargarCatalogo();
      }, 400);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }
      clearBtn.style.display = "none";
      currentQuery = "";
      currentPage = 1;
      cargarCatalogo();
    });
  }

  if (marcaSelect) {
    marcaSelect.addEventListener("change", (e) => {
      currentMarca = e.target.value;
      currentPage = 1;
      cargarCatalogo();
    });
  }

  // Buscador del header en productos.html
  const headerForm = document.getElementById("headerSearchForm");
  const headerInput = document.getElementById("headerSearchInput");
  if (headerForm && headerInput) {
    headerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = headerInput.value.trim();
      if (searchInput) searchInput.value = val;
      if (clearBtn) clearBtn.style.display = val ? "inline-flex" : "none";
      currentQuery = val;
      currentPage = 1;
      cargarCatalogo();
    });
  }
}

/**
 * Consulta el endpoint público y renderiza los productos
 */
async function cargarCatalogo() {
  const container = document.getElementById("catalogProductsGrid");
  const statusEl = document.getElementById("catalogStatus");
  const paginationEl = document.getElementById("catalogPagination");

  if (!container) return;

  renderSkeletons(container, 8);
  if (statusEl) statusEl.textContent = "Buscando repuestos en catálogo...";

  try {
    const res = await apiGetCatalogoPublico({
      q: currentQuery,
      marca: currentMarca,
      page: currentPage,
      limit: PAGE_LIMIT
    });

    if (!res || !res.ok) {
      if (statusEl) statusEl.textContent = `Error al cargar: ${res?.error || "Servidor no disponible"}`;
      container.innerHTML = `
        <div class="catalog-empty">
          <span>⚠️</span>
          <h3>No se pudo cargar el catálogo</h3>
          <p>${res?.error || "Verificá tu conexión a internet o intentá más tarde."}</p>
        </div>
      `;
      if (paginationEl) paginationEl.innerHTML = "";
      return;
    }

    const productos = res.data || [];
    const total = res.total || productos.length;
    const totalPages = res.totalPages || Math.ceil(total / PAGE_LIMIT) || 1;

    if (statusEl) {
      statusEl.textContent = total === 1
        ? "1 repuesto encontrado"
        : `${total} repuestos encontrados`;
    }

    if (productos.length === 0) {
      container.innerHTML = `
        <div class="catalog-empty">
          <span>🔍</span>
          <h3>No se encontraron productos</h3>
          <p>Probá buscando con otro código, marca o limpíá los filtros aplicados.</p>
        </div>
      `;
      if (paginationEl) paginationEl.innerHTML = "";
      return;
    }

    // Render de tarjetas de producto
    container.innerHTML = productos.map(prod => renderProductoCard(prod)).join("");

    // Render de paginación
    renderPaginacion(paginationEl, currentPage, totalPages);

  } catch (err) {
    if (statusEl) statusEl.textContent = "Error de conexión al cargar catálogo.";
    container.innerHTML = `
      <div class="catalog-empty">
        <span>🔌</span>
        <h3>Error de conexión</h3>
        <p>No se pudo conectar con el catálogo de RECTIFREN: ${String(err)}</p>
      </div>
    `;
    if (paginationEl) paginationEl.innerHTML = "";
  }
}

/**
 * Render de tarjeta individual de producto
 * NUNCA muestra costos ni stock.
 * Si la foto falla o no existe, muestra "Foto no disponible".
 */
function renderProductoCard(prod) {
  const codigo = escapeHtml(prod.codigo || "S/C");
  const marca = escapeHtml(prod.marca || "RECTIFREN");
  const descripcion = escapeHtml(prod.descripcion || prod.titulo || "Repuesto automotor de alta calidad");
  const foto = prod.foto ? encodeURI(prod.foto) : "";

  // Mensaje prellenado para WhatsApp con el código del repuesto
  const waMensaje = `Hola RECTIFREN, quiero consultar por el repuesto código ${codigo}${prod.marca ? " (" + prod.marca + ")" : ""}.`;
  const waLink = `https://wa.me/${CONTACT_INFO.whatsapp}?text=${encodeURIComponent(waMensaje)}`;

  return `
    <article class="product-card">
      <div class="product-card-thumb">
        ${foto ? `
          <img 
            src="${foto}" 
            alt="${codigo}" 
            class="product-card-img" 
            loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          />
          <div class="product-no-img" style="display:none;">
            <span class="no-img-icon">📷</span>
            <span class="no-img-text">Foto no disponible</span>
          </div>
        ` : `
          <div class="product-no-img">
            <span class="no-img-icon">📷</span>
            <span class="no-img-text">Foto no disponible</span>
          </div>
        `}
        <span class="product-badge-marca">${marca}</span>
      </div>

      <div class="product-card-body">
        <div class="product-card-code">${codigo}</div>
        <p class="product-card-desc" title="${descripcion}">${descripcion}</p>
        
        <div class="product-card-footer">
          <a 
            href="${waLink}" 
            target="_blank" 
            rel="noopener" 
            class="btn-product-whatsapp"
            title="Consultar precio y disponibilidad de ${codigo}"
          >
            💬 Consultar por WhatsApp
          </a>
        </div>
      </div>
    </article>
  `;
}

/**
 * Renderiza los controles de paginación
 */
function renderPaginacion(container, page, totalPages) {
  if (!container) return;
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  let html = `
    <div class="pagination-wrapper">
      <button 
        class="pagination-btn ${page <= 1 ? "disabled" : ""}" 
        data-page="${page - 1}" 
        ${page <= 1 ? "disabled" : ""}
      >
        ← Anterior
      </button>
  `;

  // Ventana de páginas
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, page + 2);

  if (startPage > 1) {
    html += `<button class="pagination-btn" data-page="1">1</button>`;
    if (startPage > 2) html += `<span class="pagination-ellipsis">…</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `
      <button 
        class="pagination-btn ${i === page ? "active" : ""}" 
        data-page="${i}"
      >
        ${i}
      </button>
    `;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<span class="pagination-ellipsis">…</span>`;
    html += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
  }

  html += `
      <button 
        class="pagination-btn ${page >= totalPages ? "disabled" : ""}" 
        data-page="${page + 1}" 
        ${page >= totalPages ? "disabled" : ""}
      >
        Siguiente →
      </button>
    </div>
  `;

  container.innerHTML = html;

  // Bind clics de paginación
  container.querySelectorAll("button[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetPage = parseInt(btn.dataset.page, 10);
      if (targetPage && targetPage !== currentPage && targetPage >= 1 && targetPage <= totalPages) {
        currentPage = targetPage;
        cargarCatalogo();
        window.scrollTo({ top: 120, behavior: "smooth" });
      }
    });
  });
}

/**
 * Skeletons de carga
 */
function renderSkeletons(container, count = 8) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="product-card skeleton-card">
        <div class="product-card-thumb skeleton-block"></div>
        <div class="product-card-body">
          <div class="skeleton-line" style="width:40%;height:18px;"></div>
          <div class="skeleton-line" style="width:80%;height:14px;margin-top:8px;"></div>
          <div class="skeleton-line" style="width:100%;height:38px;margin-top:16px;"></div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

