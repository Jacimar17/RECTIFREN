import { $ } from "./ui.js";
import { refrescarSelectsCategorias } from "./categories.js";

const OPCION_NUEVA = "__nueva__";

export function createProductAddModal() {
  let locationTouched = false;

  function defaultLocationForCode(codigo) {
    return /^RF-/i.test(String(codigo || "").trim()) ? "NEGOCIO" : "DEPOSITO_GALPON";
  }

  /** Muestra el campo de nombre solo cuando se elige "Nueva categoría". */
  function syncNuevaCategoriaField() {
    const select = $("addCategoria");
    const label = $("addNuevaCategoriaLabel");
    const input = $("addNuevaCategoria");
    if (!select || !input) return;
    const esNueva = select.value === OPCION_NUEVA;
    if (label) label.style.display = esNueva ? "" : "none";
    input.style.display = esNueva ? "" : "none";
    if (esNueva) input.focus();
    else input.value = "";
  }

  function openAddModal() {
    refrescarSelectsCategorias();
    ["addCodigo", "addMarca"].forEach(id => {
      const input = $(id);
      if (input) input.value = "";
    });
    const stock = $("addStock");
    if (stock) stock.value = "0";
    const categoria = $("addCategoria");
    if (categoria) categoria.value = "";
    syncNuevaCategoriaField();
    locationTouched = false;
    const location = $("addUbicacion");
    if (location) location.value = "DEPOSITO_GALPON";
    const status = $("addStatus");
    if (status) status.textContent = "";
    const overlay = $("addOverlay");
    if (!overlay) return;
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
    setTimeout(() => $("addCodigo")?.focus(), 80);
  }

  function closeAddModal() {
    const overlay = $("addOverlay");
    if (!overlay) return;
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  }

  return {
    defaultLocationForCode,
    openAddModal,
    closeAddModal,
    syncNuevaCategoriaField,
    isLocationTouched: () => locationTouched,
    setLocationTouched: value => { locationTouched = value; }
  };
}
