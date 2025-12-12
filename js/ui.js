/* =========================================================
   UI.JS — Funciones comunes de interfaz
   ========================================================= */

/* Mostrar mensaje */
export function showStatus(element, msg, time = 3000) {
  element.textContent = msg;
  element.hidden = false;

  setTimeout(() => {
    element.hidden = true;
  }, time);
}

/* Limpiar tabla */
export function clearTable(tbody) {
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
}

/* Crear elemento */
export function el(tag, cls = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
