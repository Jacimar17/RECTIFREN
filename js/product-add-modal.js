import { $, escapeHtml, normalizarCodigo, ubicacionLabel } from "./ui.js";
import { refrescarSelectsCategorias, getCamposExtraCategoria } from "./categories.js";

const OPCION_NUEVA = "__nueva__";

export function createProductAddModal() {
  let locationTouched = false;

  function defaultLocationForCode(codigo) {
    return /^RF-/i.test(String(codigo || "").trim()) ? "NEGOCIO" : "DEPOSITO_GALPON";
  }

  /** Muestra el campo de nombre solo cuando se elige "Nueva categoría". */
  function syncNuevaCategoriaField() {
    const select = $("addCategoria");
    const wrapper = $("addNuevaCategoriaField");
    const input = $("addNuevaCategoria");
    if (!select || !input) return;
    const esNueva = select.value === OPCION_NUEVA;
    if (wrapper) wrapper.style.display = esNueva ? "" : "none";
    else {
      const label = $("addNuevaCategoriaLabel");
      if (label) label.style.display = esNueva ? "" : "none";
      input.style.display = esNueva ? "" : "none";
    }
    if (esNueva) input.focus();
    else input.value = "";
  }

  /** Dibuja los campos extra que declara la categoría elegida. */
  function renderCamposExtra() {
    const contenedor = $("addCamposExtra");
    if (!contenedor) return;
    const select = $("addCategoria");
    const esNueva = select?.value === OPCION_NUEVA;
    const nombre = esNueva ? "" : (select?.value || "");
    const campos = getCamposExtraCategoria(nombre);
    if (!campos.length) {
      contenedor.innerHTML = "";
      contenedor.hidden = true;
      return;
    }
    contenedor.hidden = false;
    contenedor.innerHTML = campos.map(campo => {
      const clave = String(campo.nombre || "").trim();
      if (!clave) return "";
      const etiqueta = escapeHtml(campo.etiqueta || clave);
      const opciones = Array.isArray(campo.opciones) ? campo.opciones : [];
      const opcionesHtml = [`<option value="">Sin especificar</option>`]
        .concat(opciones.map(opcion => `<option value="${escapeHtml(opcion)}">${escapeHtml(opcion)}</option>`))
        .join("");
      return `<div class="formField">
        <label class="muted">${etiqueta}</label>
        <select class="select" data-campo-extra="${escapeHtml(clave)}">${opcionesHtml}</select>
      </div>`;
    }).join("");
  }

  /** Junta los valores de los campos extra en un objeto { nombre: valor }. */
  function collectCamposExtra() {
    const contenedor = $("addCamposExtra");
    const salida = {};
    if (!contenedor) return salida;
    contenedor.querySelectorAll("select[data-campo-extra]").forEach(select => {
      const valor = String(select.value || "").trim();
      if (valor) salida[select.dataset.campoExtra] = valor;
    });
    return salida;
  }

  function hideDupBox() {
    const box = $("addDupBox");
    if (box) box.hidden = true;
  }

  function showDupBox(codigo, marca, ubicacion, cantidad) {
    const box = $("addDupBox");
    const msg = $("addDupMsg");
    if (!box) return;
    if (msg) {
      msg.innerHTML = `Ya existe <strong>${escapeHtml(codigo)}</strong> — <strong>${escapeHtml(marca)}</strong> en ${escapeHtml(ubicacionLabel(ubicacion))}.`;
    }
    const sumar = $("btnAddSumar");
    if (sumar) sumar.textContent = `Sumar ${cantidad} al stock`;
    box.hidden = false;
    setTimeout(() => sumar?.focus(), 60);
  }

  /** Limpia el formulario. Con `conservarCategoria` mantiene categoría y ubicación. */
  function limpiarFormulario({ conservarCategoria = false } = {}) {
    const camposSimples = ["addCodigo", "addMarca", "addDescripcion", "addNuevaCategoria"];
    camposSimples.forEach(id => { const el = $(id); if (el) el.value = ""; });
    const stock = $("addStock");
    if (stock) stock.value = "0";
    if (!conservarCategoria) {
      const categoria = $("addCategoria");
      if (categoria) categoria.value = "";
    }
    const status = $("addStatus");
    if (status) status.textContent = "";
    hideDupBox();
    syncNuevaCategoriaField();
    renderCamposExtra();
  }

  function openAddModal() {
    refrescarSelectsCategorias();
    limpiarFormulario();
    locationTouched = false;
    const location = $("addUbicacion");
    if (location) location.value = "DEPOSITO_GALPON";
    const overlay = $("addOverlay");
    if (!overlay) return;
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
    setTimeout(() => $("addCodigo")?.focus(), 80);
  }

  /** Deja el formulario listo para cargar el próximo producto. */
  function prepararSiguienteAlta(categoria) {
    limpiarFormulario({ conservarCategoria: true });
    const select = $("addCategoria");
    if (select && categoria) select.value = categoria;
    syncNuevaCategoriaField();
    renderCamposExtra();
    setTimeout(() => $("addCodigo")?.focus(), 40);
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
    prepararSiguienteAlta,
    limpiarFormulario,
    syncNuevaCategoriaField,
    renderCamposExtra,
    collectCamposExtra,
    hideDupBox,
    showDupBox,
    normalizarCodigo,
    isLocationTouched: () => locationTouched,
    setLocationTouched: value => { locationTouched = value; }
  };
}
