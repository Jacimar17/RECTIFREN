import { $ } from "./ui.js";

export function createProductAddModal() {
  let locationTouched = false;

  function defaultLocationForCode(codigo) {
    return /^RF-/i.test(String(codigo || "").trim()) ? "NEGOCIO" : "DEPOSITO_GALPON";
  }

  function openAddModal() {
    ["addCodigo", "addMarca"].forEach(id => {
      const input = $(id);
      if (input) input.value = "";
    });
    const stock = $("addStock");
    if (stock) stock.value = "0";
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
    isLocationTouched: () => locationTouched,
    setLocationTouched: value => { locationTouched = value; }
  };
}
