import { apiPostForm, authJsonHeaders } from "./api.js";
import { API_URL } from "./config.js";
import {
  $, showToast, openEditModal, closeEditModal, getEditModalData
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
      setHighlightKey({ codigo, marca });
      showToast(`Stock ${act === "in" ? "aumentado" : "reducido"} para ${codigo}.`, "success");
      await loadStock();
      await loadMovs();
      setLastUpdatedNow();
    } finally {
      setBusyState(false);
    }
  }

  function openAddModal() {
    ["addCodigo", "addMarca"].forEach(id => {
      const input = $(id);
      if (input) input.value = "";
    });
    const stock = $("addStock");
    if (stock) stock.value = "0";
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
    const status = $("addStatus");
    if (!codigo) { if (status) status.textContent = "El código es obligatorio."; return; }
    if (!marca) { if (status) status.textContent = "La marca es obligatoria."; return; }
    if (!Number.isFinite(stock) || stock < 0) {
      if (status) status.textContent = "Stock inválido.";
      return;
    }
    try {
      setBusyState(true, "Agregando producto…");
      const response = await apiPostForm({ action: "add", token, codigo, marca, stock });
      if (!response.ok) {
        if (status) status.textContent = `Error: ${response.error || "No se pudo agregar."}`;
        return;
      }
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
        nuevoStock: data.nuevoStock
      });
      if (!response.ok) {
        $("editStatus").textContent = `Error: ${response.error || "No se pudo guardar."}`;
        return;
      }
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

  function handleStockAction(event) {
    if (isBusy()) return;
    const button = event.target.closest("button[data-act]");
    if (button && !button.disabled) {
      const action = button.getAttribute("data-act");
      const codigo = button.getAttribute("data-c");
      const marca = button.getAttribute("data-m");
      const stock = Number(button.getAttribute("data-s") || 0);
      if (action === "in" || action === "out") { openNoteModal(action, codigo, marca, stock); return; }
      if (action === "set") { openEditModal({ codigo, marca, actual: stock }); return; }
      if (action === "del") { openDelModal(codigo, marca); return; }
      if (action === "equiv") {
        void openEquivModal(button.getAttribute("data-id"), codigo, marca);
        return;
      }
      if (action === "minimo") {
        const minimo = Number(button.getAttribute("data-min") || 2);
        openMinimoModal(button.getAttribute("data-id"), codigo, marca, minimo);
      }
      return;
    }
    if (!event.target.closest("button")) {
      const row = event.target.closest("[data-c]");
      if (row) {
        const { c: codigo, m: marca } = row.dataset;
        if (codigo && marca) void openHistModal(codigo, marca);
      }
    }
  }

  function bind() {
    $("tbody").addEventListener("click", handleStockAction);
    $("cardGrid")?.addEventListener("click", handleStockAction);

    $("btnCloseEdit").addEventListener("click", () => { if (!isBusy()) closeEditModal(); });
    $("btnCancelEdit").addEventListener("click", () => { if (!isBusy()) closeEditModal(); });
    $("btnSaveEdit").addEventListener("click", () => { if (!isBusy()) saveEdit(); });
    $("editNuevo").addEventListener("keydown", event => {
      if (event.key === "Enter" && !isBusy()) void saveEdit();
    });
    $("editOverlay").addEventListener("click", event => {
      if (event.target === $("editOverlay") && !isBusy()) closeEditModal();
    });

    const noteOverlay = $("noteOverlay");
    if (noteOverlay) {
      $("btnCloseNote")?.addEventListener("click", () => { if (!isBusy()) closeNoteModal(); });
      $("btnCancelNote")?.addEventListener("click", () => { if (!isBusy()) closeNoteModal(); });
      $("btnConfirmNote")?.addEventListener("click", () => { if (!isBusy()) void confirmNote(); });
      $("noteInput")?.addEventListener("keydown", event => {
        if (event.key === "Enter" && !isBusy()) void confirmNote();
      });
      noteOverlay.addEventListener("click", event => {
        if (event.target === noteOverlay && !isBusy()) closeNoteModal();
      });
    }

    const addOverlay = $("addOverlay");
    if (addOverlay) {
      $("btnAddProduct")?.addEventListener("click", () => { if (!isBusy()) openAddModal(); });
      $("btnCloseAdd")?.addEventListener("click", () => { if (!isBusy()) closeAddModal(); });
      $("btnCancelAdd")?.addEventListener("click", () => { if (!isBusy()) closeAddModal(); });
      $("btnConfirmAdd")?.addEventListener("click", () => { if (!isBusy()) void confirmAdd(); });
      addOverlay.addEventListener("click", event => {
        if (event.target === addOverlay && !isBusy()) closeAddModal();
      });
    }

    const delOverlay = $("delOverlay");
    if (delOverlay) {
      $("btnCloseDel")?.addEventListener("click", () => { if (!isBusy()) closeDelModal(); });
      $("btnCancelDel")?.addEventListener("click", () => { if (!isBusy()) closeDelModal(); });
      $("btnConfirmDel")?.addEventListener("click", () => { if (!isBusy()) void confirmDel(); });
      delOverlay.addEventListener("click", event => {
        if (event.target === delOverlay && !isBusy()) closeDelModal();
      });
    }

    $("btnCloseMinimo")?.addEventListener("click", closeMinimoModal);
    $("btnCancelMinimo")?.addEventListener("click", closeMinimoModal);
    $("btnSaveMinimo")?.addEventListener("click", () => { void saveMinimoModal(); });
    $("minimoInput")?.addEventListener("keydown", event => {
      if (event.key === "Enter") void saveMinimoModal();
    });
    $("minimoOverlay")?.addEventListener("click", event => {
      if (event.target === $("minimoOverlay")) closeMinimoModal();
    });
  }

  function closeOpenModals() {
    if ($("editOverlay")?.style.display === "flex") closeEditModal();
    if ($("noteOverlay")?.style.display === "flex") closeNoteModal();
    if ($("addOverlay")?.style.display === "flex") closeAddModal();
    if ($("minimoOverlay")?.style.display === "flex") closeMinimoModal();
    if ($("delOverlay")?.style.display === "flex") closeDelModal();
  }

  return { bind, closeOpenModals };
}
