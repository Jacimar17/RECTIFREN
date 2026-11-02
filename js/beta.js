import {
  apiBetaProveedores,
  apiBuscarVehiculoLitton,
  apiDetalleProveedores,
  apiGet,
  apiVehiculosLitton
} from "./api.js?v=20261102";
import { $, escapeHtml, showToast } from "./ui.js";
import { createBetaView } from "./beta-view.js?v=20261102";
import { icon } from "./ui/icons.js";

export function bindBetaModal({ getIsAdmin, getAdminToken, adminLogout, isBusy }) {
  const overlay = $("betaOverlay");
  const results = $("betaResults");
  const lightbox = $("betaLightbox");
  if (!overlay || !results || !lightbox) return;

  let lastLittonResponse = null;
  let selectedResultIndex = -1;
  let activeViewId = 0;
  let marcasModelosLitton = null;
  let cargaMarcasModelos = null;
  const detailCache = new Map();
  const detailRequests = new Map();
  const inventoryCache = new Map();
  const inventoryRequests = new Map();
  const betaView = createBetaView(results);
  const {
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
  } = betaView;

  function openBetaModal() {
    $("betaStatus").textContent = "";
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
    if ($("betaSearchMode").value === "vehiculo") {
      setTimeout(() => $("betaVehicleMake")?.focus(), 80);
    } else {
      setTimeout(() => $("betaSearch")?.focus(), 80);
    }
  }

  function closeBetaModal() {
    closeLightbox();
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  }

  async function getProviderDetails(item) {
    const code = item.codigo || "";
    if (detailCache.has(code)) return detailCache.get(code);
    if (detailRequests.has(code)) return detailRequests.get(code);

    const request = (async () => {
      const token = getAdminToken();
      if (!token) {
        adminLogout();
        throw new Error("La sesión venció. Ingresá nuevamente.");
      }
      const response = await apiDetalleProveedores(code, token);
      if (response.ok) detailCache.set(code, response);
      return response;
    })();
    detailRequests.set(code, request);
    try {
      return await request;
    } finally {
      detailRequests.delete(code);
    }
  }

  async function getInventoryDetails(item) {
    const code = item.codigo || "";
    if (inventoryCache.has(code)) return inventoryCache.get(code);
    if (inventoryRequests.has(code)) return inventoryRequests.get(code);

    const request = apiGet({ action: "search", q: code, token: getAdminToken() });
    inventoryRequests.set(code, request);
    try {
      const response = await request;
      if (response.ok) inventoryCache.set(code, response);
      return response;
    } finally {
      inventoryRequests.delete(code);
    }
  }

  async function showDetails(item, index) {
    selectedResultIndex = index;
    const viewId = ++activeViewId;
    const code = item.codigo || "";
    const category = item.categoria
      ? `<div class="beta-main-category"><span>Categoría</span><strong>${escapeHtml(item.categoria)}</strong></div>`
      : "";
    results.innerHTML = `<button type="button" class="beta-back-button">${icon("arrow-left")} Volver a resultados</button>
      <section class="beta-main-product" aria-labelledby="beta-main-product-code">
        ${photoMarkup(item.imagen, code, "beta-main-photo")}
        <div class="beta-main-info">
          <span class="beta-section-eyebrow">Catálogo Litton</span>
          <h2 id="beta-main-product-code" class="beta-code beta-code-large">${escapeHtml(code || "Código s/d")}</h2>
          <div class="beta-price beta-price-large">${fmtPrecio(item.precio)}</div>
          <div class="beta-brand">${escapeHtml(item.marca || "Marca no informada")}</div>
          <div class="beta-name">${escapeHtml(item.nombre || "Sin descripción disponible")}</div>
          ${category}
          <div class="beta-result-badges">${semaforo(item.stockProveedor)}</div>
          <div class="beta-family-codes" aria-live="polite"></div>
        </div>
      </section>
      ${renderInventorySection()}
      <h2 class="beta-suppliers-title">Dónde conseguirla</h2>
      <div class="beta-suppliers-grid">
        ${renderProviderSection("ATONOR")}
        ${renderProviderSection("Aimar")}
      </div>`;

    loadInventoryDetails(item, viewId);
    if (detailCache.has(code)) {
      updateProviderSections(detailCache.get(code));
      return;
    }

    try {
      const response = await getProviderDetails(item);
      if (viewId !== activeViewId) return;
      if (!response.ok) {
        updateProviderSections(null, response.error || "No se pudieron consultar los proveedores.");
        return;
      }
      updateProviderSections(response);
    } catch (error) {
      if (viewId !== activeViewId) return;
      updateProviderSections(null, error.message || "Error al consultar los proveedores.");
    }
  }

  async function loadInventoryDetails(item, viewId) {
    try {
      const response = await getInventoryDetails(item);
      if (viewId !== activeViewId) return;
      if (!response.ok) {
        updateInventorySection(null, response.error || "No se pudo consultar el inventario.");
        return;
      }
      updateInventorySection(response);
    } catch (error) {
      if (viewId !== activeViewId) return;
      updateInventorySection(null, error.message || "Error al consultar el inventario.");
    }
  }

  function setSelectOptions(select, placeholder, values) {
    select.replaceChildren(new Option(placeholder, ""));
    for (const value of values) {
      select.add(new Option(value, value));
    }
  }

  async function cargarMarcasModelosLitton() {
    if (marcasModelosLitton) return marcasModelosLitton;
    if (cargaMarcasModelos) return cargaMarcasModelos;

    cargaMarcasModelos = (async () => {
      const token = getAdminToken();
      if (!token) {
        adminLogout();
        throw new Error("La sesión venció. Ingresá nuevamente.");
      }
      $("betaStatus").textContent = "Cargando marcas y modelos de Litton…";
      const response = await apiVehiculosLitton(token);
      if (!response.ok) throw new Error(response.error || "No se pudieron cargar las marcas de Litton.");
      if (!Array.isArray(response.data)) throw new Error("Litton devolvió una lista de vehículos inválida.");
      const entries = response.data.filter((item) =>
        typeof item?.marca === "string"
        && item.marca.trim()
        && Array.isArray(item.modelos)
        && item.modelos.some((model) => typeof model === "string" && model.trim())
      );
      const marcas = entries.map((item) => item.marca);
      if (!marcas.length) throw new Error("Litton no informó marcas y modelos disponibles.");
      marcasModelosLitton = entries;
      setSelectOptions($("betaVehicleMake"), "Elegí una marca", marcas);
      setSelectOptions($("betaVehicleModel"), "Elegí primero una marca", []);
      $("betaVehicleModel").disabled = true;
      $("betaStatus").textContent = "";
      return marcasModelosLitton;
    })();

    try {
      return await cargaMarcasModelos;
    } finally {
      cargaMarcasModelos = null;
    }
  }

  function actualizarModoBusqueda() {
    const vehicleMode = $("betaSearchMode").value === "vehiculo";
    $("betaCodeSearch").hidden = vehicleMode;
    $("betaVehicleSearch").hidden = !vehicleMode;
    if (vehicleMode) {
      cargarMarcasModelosLitton().catch((error) => {
        setSelectOptions($("betaVehicleMake"), "No se pudieron cargar las marcas", []);
        $("betaStatus").textContent = error.message || "No se pudieron cargar las marcas de Litton.";
      });
    } else {
      $("betaStatus").textContent = "";
      setTimeout(() => $("betaSearch")?.focus(), 0);
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

  async function buscarBetaVehiculo(page = 1) {
    const marca = $("betaVehicleMake").value;
    const modelo = $("betaVehicleModel").value;
    if (!marca || !modelo) {
      $("betaStatus").textContent = "Elegí la marca y el modelo del vehículo.";
      return;
    }
    if (!getIsAdmin()) {
      showToast("Ingresá como administrador para usar la beta.", "error");
      return;
    }

    const button = $("btnBetaSearchVehicle");
    button.disabled = true;
    $("betaStatus").textContent = "";
    results.innerHTML = `<div class="beta-search-loading"><div class="spinner" aria-hidden="true"></div><span>Buscando pastillas y comparando proveedores…</span></div>`;

    try {
      const token = getAdminToken();
      if (!token) {
        adminLogout();
        showToast("La sesión venció. Ingresá nuevamente.", "error");
        return;
      }
      const response = await apiBuscarVehiculoLitton({ marca, modelo, page }, token);
      if (!response.ok) {
        results.innerHTML = "";
        $("betaStatus").textContent = response.error || "Error en la búsqueda por vehículo.";
        return;
      }
      renderVehicleResults(response, buscarBetaVehiculo);
      const total = response.pagination?.total ?? response.total ?? 0;
      $("betaStatus").textContent = `${response.data?.length || 0} variante(s) para ${marca} ${modelo}${total > (response.data?.length || 0) ? ` · ${total} en total` : ""}`;
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
  $("btnBetaSearchVehicle")?.addEventListener("click", () => buscarBetaVehiculo());
  $("betaSearchMode")?.addEventListener("change", actualizarModoBusqueda);
  $("betaVehicleMake")?.addEventListener("change", () => {
    const make = $("betaVehicleMake").value;
    const entry = marcasModelosLitton?.find((item) => item.marca === make);
    const models = Array.isArray(entry?.modelos) ? entry.modelos.filter((model) => typeof model === "string" && model.trim()) : [];
    setSelectOptions($("betaVehicleModel"), !make ? "Elegí primero una marca" : models.length ? "Elegí un modelo" : "Sin modelos disponibles", models);
    $("betaVehicleModel").disabled = !make || models.length === 0;
    $("betaStatus").textContent = make && !models.length ? "Litton no informó modelos para esta marca." : "";
  });
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
    placeholder.innerHTML = `${icon("camera")}<span>Foto no disponible</span>`;
    image.replaceWith(placeholder);
  }, true);
  overlay.addEventListener("click", event => {
    const zoomable = event.target.closest?.(".beta-zoomable");
    if (zoomable) {
      if (zoomable.closest(".beta-result-card")) return;
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
}
