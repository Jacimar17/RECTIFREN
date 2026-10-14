import { $ } from "./dom.js";

export function openEditModal({ codigo, marca, actual, ubicacion, codigoLitton = false }) {
  $("editStatus").textContent = "";
  $("editActual").textContent = String(actual);
  $("editProductoOrig").textContent = `${codigo} — ${marca}`;
  const ci = $("editCodigoInput"); if (ci) ci.value = codigo;
  if (ci) ci.disabled = codigoLitton;
  const mi = $("editMarcaInput");  if (mi) mi.value = marca;
  const input = $("editNuevo");
  input.value = String(actual);
  const location = $("editUbicacion");
  if (location) location.value = ubicacion || "DEPOSITO_GALPON";
  const ov = $("editOverlay");
  ov.style.display = "flex";
  ov.setAttribute("aria-hidden","false");
  ov.dataset.codigo = codigo;
  ov.dataset.marca  = marca;
  ov.dataset.actual = String(actual);
  ov.dataset.ubicacion = ubicacion || "DEPOSITO_GALPON";
  ov.dataset.codigoLitton = codigoLitton ? "1" : "0";
  setTimeout(() => { const ci2 = $("editCodigoInput"); if(ci2){ci2.focus();ci2.select();} }, 80);
}

export function closeEditModal() {
  const ov = $("editOverlay");
  ov.style.display = "none";
  ov.setAttribute("aria-hidden","true");
}

export function getEditModalData() {
  const ov = $("editOverlay");
  return {
    codigoOrig:  ov.dataset.codigo || "",
    marcaOrig:   ov.dataset.marca  || "",
    actual:      Number(ov.dataset.actual || 0),
    nuevoCodigo: $("editCodigoInput")?.value.trim() || ov.dataset.codigo || "",
    nuevaMarca:  $("editMarcaInput")?.value.trim()  || ov.dataset.marca  || "",
    nuevoStock:  Number($("editNuevo").value),
    ubicacion: $("editUbicacion")?.value || "DEPOSITO_GALPON",
    ubicacionOrig: ov.dataset.ubicacion || "DEPOSITO_GALPON",
    codigoLitton: ov.dataset.codigoLitton === "1"
  };
}
