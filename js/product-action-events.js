import { $, normalizarCodigo, openEditModal, closeEditModal } from "./ui.js";
import { refrescarSelectsCategorias } from "./categories.js";

export function createProductActionEvents({
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
  confirmAddSumar,
  hideAddDupBox,
  syncNuevaCategoriaField,
  renderAddCamposExtra,
  defaultLocationForCode,
  isAddLocationTouched,
  setAddLocationTouched
}) {
  function handleStockAction(event) {
    if (isBusy()) return;
    const button = event.target.closest("button[data-act]");
    if (button && !button.disabled) {
      const action = button.getAttribute("data-act");
      const codigo = button.getAttribute("data-c");
      const marca = button.getAttribute("data-m");
      const stock = Number(button.getAttribute("data-s") || 0);
      const ubicacion = button.getAttribute("data-u") || "DEPOSITO_GALPON";
      if (action === "in" || action === "out") { openNoteModal(action, codigo, marca, stock, ubicacion); return; }
      if (action === "set") {
        refrescarSelectsCategorias();
        openEditModal({
          codigo, marca, actual: stock, ubicacion,
          categoria: button.dataset.cat || "",
          codigoLitton: button.dataset.v2 === "1"
        });
        return;
      }
      if (action === "del") { openDelModal(codigo, marca, ubicacion, button.dataset.id); return; }
      if (action === "equiv") {
        void openEquivModal(button.getAttribute("data-id"), codigo, marca);
        return;
      }
      if (action === "minimo") {
        const minimo = Number(button.getAttribute("data-min") || 2);
        openMinimoModal(button.getAttribute("data-id"), codigo, marca, minimo, ubicacion);
      }
      return;
    }
    if (!event.target.closest("button")) {
      const row = event.target.closest("[data-c]");
      if (row) {
        const { c: codigo, m: marca, u: ubicacion } = row.dataset;
        if (codigo && marca) void openHistModal(codigo, marca, ubicacion);
      }
    }
  }

  function bind() {
    $("tbody").addEventListener("click", handleStockAction);
    $("cardGrid")?.addEventListener("click", handleStockAction);

    $("btnCloseEdit").addEventListener("click", () => { if (!isBusy()) closeEditModal(); });
    $("btnCancelEdit").addEventListener("click", () => { if (!isBusy()) closeEditModal(); });
    $("btnSaveEdit").addEventListener("click", () => { if (!isBusy()) void saveEdit(); });
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
      $("btnConfirmAdd")?.addEventListener("click", () => { if (!isBusy()) void confirmAdd({ modo: "cerrar" }); });
      $("btnSaveAddMore")?.addEventListener("click", () => { if (!isBusy()) void confirmAdd({ modo: "otro" }); });
      $("btnAddSumar")?.addEventListener("click", () => { if (!isBusy()) void confirmAddSumar(); });
      $("btnAddCancelDup")?.addEventListener("click", () => { if (!isBusy()) hideAddDupBox(); });
      $("addCodigo")?.addEventListener("input", event => {
        if (!isAddLocationTouched()) $("addUbicacion").value = defaultLocationForCode(event.target.value);
      });
      // El código se guarda en mayúsculas; se acomoda también al salir del campo.
      $("addCodigo")?.addEventListener("blur", event => {
        const input = event.target;
        const limpio = normalizarCodigo(input.value);
        if (limpio !== input.value) input.value = limpio;
      });
      $("addCategoria")?.addEventListener("change", () => {
        syncNuevaCategoriaField();
        renderAddCamposExtra();
      });
      $("addUbicacion")?.addEventListener("change", () => setAddLocationTouched(true));
      $("addStock")?.addEventListener("keydown", event => {
        if (event.key === "Enter" && !isBusy()) void confirmAdd({ modo: "cerrar" });
      });
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
