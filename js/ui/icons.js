/* ============================================================
   ÍCONOS SVG EN LÍNEA
   Reemplazan a los emojis para lograr un look coherente con la
   marca. Todos heredan el color con `currentColor`.
   ============================================================ */

const ICONS = {
  sun:   '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:  '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.4 2.6 3.7 5.6 3.7 9S14.4 18.4 12 21M12 3C9.6 5.6 8.3 8.6 8.3 12S9.6 18.4 12 21"/>',
  flask: '<path d="M9 3h6M10 3v6l-4.5 8A2 2 0 0 0 7.3 20h9.4a2 2 0 0 0 1.8-3L14 9V3"/><path d="M7.5 15h9"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4-4"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  list:  '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  zap:   '<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/>',
  plus:  '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  edit:  '<path d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17z"/><path d="m14 6.5 3 3"/>',
  link:  '<path d="M10.5 13.5a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5"/><path d="M13.5 10.5a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5"/>',
  alert: '<path d="M10.3 3.9 2.2 18a2 2 0 0 0 1.8 3h16a2 2 0 0 0 1.8-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l.8 12a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1l.8-12"/>',
  box:   '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  hash:  '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  ban:   '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
  check: '<path d="m5 13 4 4 10-10"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  'x-circle': '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  info:  '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4.5h1"/>',
  camera:'<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  sliders: '<path d="M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-4M20 13V3M1.5 15h5M9.5 8h5M17.5 17h5"/>',
  tag:   '<path d="m3 12 9-9h7v7l-9 9z"/><circle cx="15" cy="9" r="1.4"/>',
  sort:  '<path d="M8 4v16M8 4 5 7M8 4l3 3M16 20V4M16 20l3-3M16 20l-3-3"/>',
  lock:  '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

/**
 * Devuelve el markup de un ícono SVG listo para insertar.
 * @param {string} name  clave del ícono
 * @param {string} [className] clases extra
 */
export function icon(name, className = "") {
  const body = ICONS[name] || ICONS.info;
  const classes = className ? `icon ${className}` : "icon";
  return `<svg class="${classes}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/**
 * Reemplaza los <span data-icon="..."> del HTML por su SVG.
 * Se ejecuta una vez al iniciar la app.
 */
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach(el => {
    const name = el.getAttribute("data-icon");
    if (!name) return;
    el.innerHTML = icon(name, el.getAttribute("data-icon-class") || "");
    el.removeAttribute("data-icon");
  });
}
