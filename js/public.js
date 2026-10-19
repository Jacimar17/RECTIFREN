/**
 * ============================================================
 * RECTIFREN — Lógica del Sitio Web Público
 * ============================================================
 */

import { CONTACT_INFO, CATEGORIAS, MARCAS, HERO_SLIDES } from "./public-config.js";

document.addEventListener("DOMContentLoaded", () => {
  initNoticeAndContacts();
  initHeroSlider();
  renderCategorias();
  renderMarcasMarquee();
  initHeaderSearch();
});

/**
 * Llena datos de contacto en footer, notice bar y botón flotante de WhatsApp
 */
function initNoticeAndContacts() {
  const waUrl = `https://wa.me/${CONTACT_INFO.whatsapp}?text=${encodeURIComponent(CONTACT_INFO.whatsappMensaje)}`;

  // Link en barra de aviso superior
  const noticeWaLink = document.getElementById("noticeWaLink");
  if (noticeWaLink) {
    noticeWaLink.href = waUrl;
  }

  // Botón flotante de WhatsApp
  const btnWhatsappFloat = document.getElementById("btnWhatsappFloat");
  if (btnWhatsappFloat) {
    btnWhatsappFloat.href = waUrl;
  }

  // Footer - Datos de contacto
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

  // Footer - Google Maps
  const mapsIframe = document.getElementById("footerMapsIframe");
  if (mapsIframe) mapsIframe.src = CONTACT_INFO.googleMapsEmbedUrl;

  const btnOpenMaps = document.getElementById("btnOpenMaps");
  if (btnOpenMaps) btnOpenMaps.href = CONTACT_INFO.googleMapsUrl;

  // Footer - Categorías links
  const footerCats = document.getElementById("footerCategoriesList");
  if (footerCats) {
    footerCats.innerHTML = CATEGORIAS.map(cat => `
      <li>
        <a href="productos.html?cat=${encodeURIComponent(cat.id)}">${cat.titulo}</a>
      </li>
    `).join("");
  }
}

/**
 * Renderiza la grilla de categorías con foto y caja roja de título
 */
function renderCategorias() {
  const grid = document.getElementById("categoriesGrid");
  if (!grid) return;

  grid.innerHTML = CATEGORIAS.map(cat => {
    return `
      <article class="category-card" data-cat="${cat.id}">
        <div class="category-image-wrap">
          <img 
            src="${cat.imagen}" 
            alt="${cat.titulo}" 
            class="category-image"
            loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
          />
          <div class="category-placeholder" style="display:none;">
            <span class="category-icon">${cat.icono || "⚙️"}</span>
            <span class="category-placeholder-label">${cat.titulo}</span>
          </div>
        </div>
        <div class="category-header-box">
          ${cat.titulo}
        </div>
        <div class="category-body">
          <p class="category-desc">${cat.descripcion}</p>
          <a href="productos.html?cat=${encodeURIComponent(cat.id)}" class="category-link">
            Consultar catálogo →
          </a>
        </div>
      </article>
    `;
  }).join("");
}

/**
 * Renderiza el carrusel continuo de marcas (marquee) con fallback tipográfico
 */
function renderMarcasMarquee() {
  const track = document.getElementById("marcasTrack");
  if (!track) return;

  // Duplicamos el listado para garantizar un scroll infinito sin saltos
  const marcasList = [...MARCAS, ...MARCAS];

  track.innerHTML = marcasList.map(m => {
    const imgPath = `assets/marcas/${m.slug}.png`;
    return `
      <div class="marca-item" title="${m.nombre}">
        <img 
          src="${imgPath}" 
          alt="${m.nombre}" 
          class="marca-img"
          loading="lazy"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
        />
        <span class="marca-text-logo" style="display:none;">${m.nombre}</span>
      </div>
    `;
  }).join("");
}

/**
 * Inicializa el carrusel de inicio
 */
function initHeroSlider() {
  const slider = document.getElementById("heroSlider");
  const dotsContainer = document.getElementById("heroDots");
  if (!slider) return;

  slider.innerHTML = HERO_SLIDES.map((slide, idx) => `
    <div class="hero-slide ${idx === 0 ? "active" : ""}" data-theme="${slide.placeholderTema || "dark"}">
      <div class="hero-slide-bg"></div>
      <div class="container">
        <div class="hero-content">
          <span class="hero-badge">RECTIFREN · Frenos & Repuestos</span>
          <h1 class="hero-title">${slide.titulo}</h1>
          <p class="hero-desc">${slide.bajada}</p>
          <a href="${slide.botonUrl}" class="btn-cta">${slide.botonTexto} →</a>
        </div>
      </div>
    </div>
  `).join("");

  if (dotsContainer) {
    dotsContainer.innerHTML = HERO_SLIDES.map((_, idx) => `
      <button class="hero-dot ${idx === 0 ? "active" : ""}" data-index="${idx}" aria-label="Ir a slide ${idx + 1}"></button>
    `).join("");
  }

  let currentSlide = 0;
  const slides = slider.querySelectorAll(".hero-slide");
  const dots = dotsContainer ? dotsContainer.querySelectorAll(".hero-dot") : [];
  let timer = null;

  function goToSlide(index) {
    slides[currentSlide]?.classList.remove("active");
    dots[currentSlide]?.classList.remove("active");
    currentSlide = (index + slides.length) % slides.length;
    slides[currentSlide]?.classList.add("active");
    dots[currentSlide]?.classList.add("active");
  }

  function startAutoSlide() {
    stopAutoSlide();
    timer = setInterval(() => {
      goToSlide(currentSlide + 1);
    }, 6000);
  }

  function stopAutoSlide() {
    if (timer) clearInterval(timer);
  }

  const prevBtn = document.getElementById("heroPrev");
  const nextBtn = document.getElementById("heroNext");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      goToSlide(currentSlide - 1);
      startAutoSlide();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      goToSlide(currentSlide + 1);
      startAutoSlide();
    });
  }

  dots.forEach(dot => {
    dot.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      goToSlide(idx);
      startAutoSlide();
    });
  });

  slider.addEventListener("mouseenter", stopAutoSlide);
  slider.addEventListener("mouseleave", startAutoSlide);

  startAutoSlide();
}

/**
 * Buscador de catálogo por código en el Header
 */
function initHeaderSearch() {
  const form = document.getElementById("headerSearchForm");
  const input = document.getElementById("headerSearchInput");
  if (!form || !input) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    // Redirige al catálogo de productos con el término de búsqueda
    window.location.href = `productos.html?q=${encodeURIComponent(query)}`;
  });
}

