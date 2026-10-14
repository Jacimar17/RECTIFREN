import { apiPostForm, authJsonHeaders } from "./api.js";
import { API_URL } from "./config.js";
import { createProductActionEvents } from "./product-action-events.js";
import { createProductAddModal } from "./product-add-modal.js";
import {
  $, showToast, closeEditModal, getEditModalData
} from "./ui.js";

export function createProductActions({
  getAdminToken,
  adminLogout,
  isBusy,
  setBusyState,
  loadStock,
  loadMovs,
  setLastUpdatedNow,
  setHighlightKey,
  openHistModal,
  openEquivModal
}) {
  let pendingAction = null;
  let pendingDelete = null;
  let minimoProductoId = null;
  const {
    defaultLocationForCode,
    openAddModal,
    closeAddModal,
    isLocationTouched,
    setLocationTouched
  } = createProductAddModal();

  function openNoteModal(act, codigo, marca, stock) {
    pendingAction = { act, codigo, marca, stock };
    const overlay = $("noteOverlay");
    if (!overlay) return;
    $("noteTitle").textContent = act === "in" ? "Agregar una unidad" : "Retirar una unidad";
    $("noteCodigo").textContent = codigo;
    $("noteAccion").textContent = act === "in" ? "+ Entrada" : "− Salida";
    $("noteStock").textContent = String(stock);
    $("noteInput").value = "";
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
    setTimeout(() => $("noteInput")?.focus(), 80);
  }

  function closeNoteModal() {
    const overlay = $("noteOverlay");
    if (!overlay) return;
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
    pendingAction = null;
  }

  async function confirmNote() {
    if (!pendingAction) return;
    const { act, codigo, marca } = pendingAction;
    const nota = $("noteInput")?.value.trim() || "";
    closeNoteModal();
    const token = getAdminToken();
    if (!token) {
      adminLogout();
      showToast("La sesión venció. Ingresá nuevamente.", "error");
      return;
    }
    setBusyState(true, "Aplicando cambio…");
    try {
      const response = await apiPostForm({ action: act, token, codigo, marca, cantidad: 1, nota });
      if (!response.ok) {
        showToast(`Error: ${response.error || "No se pudo operar."}`, "error");
        return;
      }
      document.dispatchEvent(new Event("rectifren:inventory-updated"));
      setHighlightKey({ codigo, marca });
      showToast(`Stock ${act === "in" ? "aumentado" : "reducido"} para ${codigo}.`, "success");
      await loadStock();
      await loadMovs();
      setLastUpdatedNow();
    } finally {
      setBusyState(false);
    }
  }

  async function confirmAdd() {
    const token = getAdminToken();
    if (!token) {
      adminLogout();
      showToast("La sesión venció. Ingresá nuevamente.", "error");
      return;
    }
    const codigo = $("addCodigo")?.value.trim();
    const marca = $("addMarca")?.value.trim();
    const stock = Number($("addStock")?.value || 0);
    const ubicacion = $("addUbicacion")?.value || defaultLocationForCode(codigo);
    const status = $("addStatus");
    if (!codigo) { if (status) status.textContent = "El código es obligatorio."; return; }
    if (!marca) { if (status) status.textContent = "La marca es obligatoria."; return; }
    if (!Number.isFinite(stock) || stock < 0) {
      if (status) status.textContent = "Stock inválido.";
      return;
    }
    try {
      setBusyState(true, "Agregando producto…");
      const response = await apiPostForm({ action: "add", token, codigo, marca, stock, ubicacion });
      if (!response.ok) {
        if (status) status.textContent = `Error: ${response.error || "No se pudo agregar."}`;
        return;
      }
      document.dispatchEvent(new Event("rectifren:inventory-updated"));
      closeAddModal();
      showToast(`Producto ${codigo} agregado.`, "success");
      await loadStock();
      await loadMovs();
      setLastUpdatedNow();
    } finally {
      setBusyState(false);
    }
  }

  function openDelModal(codigo, marca) {
    pendingDelete = { codigo, marca };
    const overlay = $("delOverlay");
    if (!overlay) return;
    $("delCodigo").textContent = codigo;
    $("delMarca").textContent = marca;
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
  }

  function closeDelModal() {
    const overlay = $("delOverlay");
    if (!overlay) return;
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
    pendingDelete = null;
  }

  async function confirmDel() {
    if (!pendingDelete) return;
    const { codigo, marca } = pendingDelete;
    closeDelModal();
    const token = getAdminToken();
    if (!token) {
      adminLogout();
      showToast("La sesión venció. Ingresá nuevamente.", "error");
      return;
    }
    try {
      setBusyState(true, "Eliminando producto…");
      const response = await apiPostForm({ action: "delete", token, codigo, marca });
      if (!response.ok) {
        showToast(`Error: ${response.error || "No se pudo eliminar."}`, "error");
        return;
      }
      document.dispatchEvent(new Event("rectifren:inventory-updated"));
      showToast(`Producto ${codigo} eliminado.`, "success");
      await loadStock();
      await loadMovs();
      setLastUpdatedNow();
    } finally {
      setBusyState(false);
    }
  }

  function openMinimoModal(id, codigo, marca, actual) {
    minimoProductoId = id;
    $("minimoCodigo").textContent = codigo;
    $("minimoMarca").textContent = marca;
    $("minimoInput").value = actual;
    $("minimoStatus").textContent = "";
    const overlay = $("minimoOverlay");
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
    setTimeout(() => {
      const input = $("minimoInput");
      input.focus();
      input.select();
    }, 80);
  }

  function closeMinimoModal() {
    const overlay = $("minimoOverlay");
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
    minimoProductoId = null;
  }

  async function saveMinimoModal() {
    if (!minimoProductoId) return;
    const value = Number($("minimoInput").value);
    if (isNaN(value) || value < 0) {
      $("minimoStatus").textContent = "Valor inválido.";
      return;
    }
    const token = getAdminToken();
    if (!token) {
      adminLogout();
      showToast("La sesión venció. Ingresá nuevamente.", "error");
      return;
    }
    try {
      setBusyState(true, "Guardando...");
      const response = await fetch(`${API_URL}/api/productos/${minimoProductoId}/minimo`, {
        method: "PATCH",
        headers: authJsonHeaders(token),
        body: JSON.stringify({ stockMinimo: value })
      });
      const data = await response.json();
      if (!data.ok) {
        $("minimoStatus").textContent = `Error: ${data.error}`;
        return;
      }
      closeMinimoModal();
      showToast(`Stock mínimo actualizado a ${value}.`, "success");
      await loadStock();
    } finally {
      setBusyState(false);
    }
  }

  async function saveEdit() {
    const token = getAdminToken();
    if (!token) {
      adminLogout();
      showToast("La sesión venció. Ingresá nuevamente.", "error");
      return;
    }
    const data = getEditModalData();
    if (!data.codigoOrig || !data.marcaOrig) { $("editStatus").textContent = "Error: datos incompletos."; return; }
    if (!data.nuevoCodigo) { $("editStatus").textContent = "El código no puede estar vacío."; return; }
    if (!data.nuevaMarca) { $("editStatus").textContent = "La marca no puede estar vacía."; return; }
    if (!Number.isFinite(data.nuevoStock) || data.nuevoStock < 0) {
      $("editStatus").textContent = "Nuevo stock inválido.";
      return;
    }
    try {
      setBusyState(true, "Guardando cambios…");
      const response = await apiPostForm({
        action: "set",
        token,
        codigo: data.codigoOrig,
        marca: data.marcaOrig,
        nuevoCodigo: data.nuevoCodigo,
        nuevaMarca: data.nuevaMarca,
        nuevoStock: data.nuevoStock,
        ubicacion: data.ubicacion
      });
      if (!response.ok) {
        $("editStatus").textContent = `Error: ${response.error || "No se pudo guardar."}`;
        return;
      }
      document.dispatchEvent(new Event("rectifren:inventory-updated"));
      closeEditModal();
      setHighlightKey({ codigo: data.nuevoCodigo, marca: data.nuevaMarca });
      showToast("Producto actualizado correctamente.", "success");
      await loadStock();
      await loadMovs();
      setLastUpdatedNow();
    } finally {
      setBusyState(false);
    }
  }

  return createProductActionEvents({
    isBusy,
    openHistModal,
    openEquivModal,
    openNoteModal,
    closeNoteModal,
    confirmNote,
    openDelModal,
    closeDelModal,
    confirmDel,
    openMinimoModal,
    closeMinimoModal,
    saveMinimoModal,
    saveEdit,
    openAddModal,
    closeAddModal,
    confirmAdd,
    defaultLocationForCode,
    isAddLocationTouched: isLocationTouched,
    setAddLocationTouched: setLocationTouched
  });
}
