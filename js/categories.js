/* ============================================================
   Categorías del inventario
   Lista compartida de categorías (comprada con la API), relleno de
   los desplegables y ventana para crear / renombrar categorías.
   ============================================================ */
import { $, escapeHtml, showToast } from "./ui.js";
import {
  apiGetCategorias,
  apiCrearCategoria,
  apiRenombrarCategoria,
  apiGetMarcas,
  apiAsignarCategoriaMasiva
} from "./api.js?v=20261020";

const SELECTS_CATEGORIA = ["addCategoria", "filterCategoria", "editCategoria"];
const OPCION_NUEVA = "__nueva__";

let cache = [];

/* Estado de la asignación masiva por marca */
let marcasCache = [];
let marcasCargadas = false;
let getToken = () => "";
let onInventarioActualizado = () => {};

export function getCategorias() {
  return cache;
}

/** Limpia el nombre de la categoría (sin espacios de más). */
export function normalizarNombreCategoria(valor) {
  return String(valor || "").trim().replace(/\s+/g, " ");
}

export function esOpcionNueva(valor) {
  return valor === OPCION_NUEVA;
}

/** Devuelve los campos extra declarados por una categoría (o lista vacía). */
export function getCamposExtraCategoria(nombre) {
  const objetivo = normalizarNombreCategoria(nombre);
  if (!objetivo) return [];
  const categoria = cache.find(item => normalizarNombreCategoria(item.nombre) === objetivo);
  return Array.isArray(categoria?.camposExtra) ? categoria.camposExtra : [];
}

/** Rellena los desplegables de categorías conservando la selección válida. */
export function refrescarSelectsCategorias() {
  for (const id of SELECTS_CATEGORIA) {
    const select = $(id);
    if (!select) continue;
    const esFiltro = id === "filterCategoria";
    const valorPrevio = select.value;
    const opciones = [`<option value="">${esFiltro ? "Todas las categorías" : "Sin categoría"}</option>`];
    for (const categoria of cache) {
      opciones.push(`<option value="${escapeHtml(categoria.nombre)}">${escapeHtml(categoria.nombre)}</option>`);
    }
    // Solo el formulario de alta puede crear una categoría en el momento.
    if (id === "addCategoria") opciones.push(`<option value="${OPCION_NUEVA}">+ Nueva categoría…</option>`);
    select.innerHTML = opciones.join("");

    if (cache.some(categoria => categoria.nombre === valorPrevio)) select.value = valorPrevio;
    else if (valorPrevio === OPCION_NUEVA && id === "addCategoria") select.value = valorPrevio;
    else select.value = "";
  }
  refrescarSelectAsignar();
}

/** Trae las categorías desde la API y actualiza los desplegables. */
export async function cargarCategorias(token) {
  if (!token) return { ok: false, error: "Sin sesión." };
  const respuesta = await apiGetCategorias(token);
  if (!respuesta.ok) return { ok: false, error: respuesta.error || "No se pudieron cargar las categorías." };
  cache = Array.isArray(respuesta.data) ? respuesta.data : [];
  refrescarSelectsCategorias();
  return { ok: true, data: cache };
}

/* ── Asignación masiva por marca ── */

/** Rellena el desplegable de categorías del bloque de asignación masiva. */
function refrescarSelectAsignar() {
  const select = $("catBulkCategoria");
  if (!select) return;
  const valorPrevio = select.value;
  const opciones = [`<option value="">Elegí una categoría…</option>`];
  for (const categoria of cache) {
    opciones.push(`<option value="${escapeHtml(categoria.nombre)}">${escapeHtml(categoria.nombre)}</option>`);
  }
  select.innerHTML = opciones.join("");
  select.value = cache.some(categoria => categoria.nombre === valorPrevio) ? valorPrevio : "";
}

/** Vuelca en el datalist las marcas ya traídas del inventario. */
function renderListaMarcas() {
  const lista = $("catMarcasLista");
  if (!lista) return;
  lista.innerHTML = marcasCache
    .map(marca => `<option value="${escapeHtml(marca)}"></option>`)
    .join("");
}

/** Trae las marcas del inventario (una sola vez por sesión). */
async function cargarMarcas(token) {
  if (!token || marcasCargadas) return;
  const respuesta = await apiGetMarcas(token);
  if (!respuesta.ok) return;
  marcasCache = Array.isArray(respuesta.data) ? respuesta.data : [];
  marcasCargadas = true;
  renderListaMarcas();
}

/** Deshabilita la confirmación hasta que haya una vista previa vigente. */
function invalidarVistaPrevia() {
  const preview = $("catBulkPreview");
  const apply = $("btnCatBulkApply");
  if (preview) { preview.hidden = true; preview.innerHTML = ""; }
  if (apply) apply.disabled = true;
}

/** Lee el formulario de asignación masiva. */
function leerFormularioMasivo() {
  return {
    marca: $("catBulkMarca")?.value.trim() || "",
    texto: $("catBulkTexto")?.value.trim() || "",
    categoria: normalizarNombreCategoria($("catBulkCategoria")?.value),
    soloSinCategoria: Boolean($("catBulkSoloVacias")?.checked)
  };
}

/** Pinta la muestra de productos que devuelve el backend. */
function renderVistaPrevia(data) {
  const lista = $("catBulkPreview");
  if (!lista) return;
  const muestra = Array.isArray(data.muestra) ? data.muestra : [];
  if (!muestra.length) { lista.hidden = true; lista.innerHTML = ""; return; }

  const filas = muestra.map(item => `
    <li class="cat-row">
      <span class="cat-name">${escapeHtml(item.codigo || "(sin código)")}</span>
      <span class="cat-bulk-desc">${escapeHtml(item.marca)}${item.descripcion ? ` · ${escapeHtml(item.descripcion)}` : ""}</span>
      <span class="cat-bulk-tag${item.categoria ? "" : " none"}">${escapeHtml(item.categoria || "Sin categoría")}</span>
    </li>`);

  if (data.total > muestra.length) {
    filas.push(`<li class="cat-bulk-more muted">…y ${data.total - muestra.length} producto(s) más.</li>`);
  }
  lista.innerHTML = filas.join("");
  lista.hidden = false;
}

/** Pide al backend la cuenta y la muestra del filtro (no escribe nada). */
async function pedirVistaPrevia() {
  const status = $("catBulkStatus");
  const apply = $("btnCatBulkApply");
  const form = leerFormularioMasivo();

  if (!form.marca && !form.texto) { if (status) status.textContent = "Escribí una marca o un texto para filtrar."; return; }
  if (!form.categoria) { if (status) status.textContent = "Elegí la categoría que querés asignar."; return; }
  const token = getToken();
  if (!token) { if (status) status.textContent = "La sesión venció. Ingresá nuevamente."; return; }

  invalidarVistaPrevia();
  if (status) status.textContent = "Buscando productos…";

  const respuesta = await apiAsignarCategoriaMasiva(token, { ...form, aplicar: false });
  if (!respuesta.ok) { if (status) status.textContent = `Error: ${respuesta.error || "No se pudo calcular."}`; return; }

  const data = respuesta.data || {};
  renderVistaPrevia(data);
  if (apply) apply.disabled = !data.total;
  if (status) {
    status.textContent = data.total
      ? `Se van a asignar ${data.total} producto(s) a "${data.categoria}". Revisá la lista y confirmá.`
      : "No hay productos que coincidan con ese filtro.";
  }
}

/** Aplica la asignación masiva al inventario. */
async function aplicarAsignacion() {
  const status = $("catBulkStatus");
  const apply = $("btnCatBulkApply");
  const preview = $("btnCatBulkPreview");
  const form = leerFormularioMasivo();
  const token = getToken();
  if (!token) { if (status) status.textContent = "La sesión venció. Ingresá nuevamente."; return; }
  if (!form.categoria) { if (status) status.textContent = "Elegí la categoría que querés asignar."; return; }

  if (apply) { apply.disabled = true; apply.textContent = "Asignando…"; }
  if (preview) preview.disabled = true;
  try {
    const respuesta = await apiAsignarCategoriaMasiva(token, { ...form, aplicar: true });
    if (!respuesta.ok) { if (status) status.textContent = `Error: ${respuesta.error || "No se pudo asignar."}`; return; }
    const data = respuesta.data || {};
    const asignados = data.aplicado || 0;
    if (status) status.textContent = `Listo: ${asignados} producto(s) quedaron en "${data.categoria}".`;
    showToast(`Se asignó "${data.categoria}" a ${asignados} producto(s).`, "success");
    onInventarioActualizado();
    await pedirVistaPrevia();
  } finally {
    if (apply) apply.textContent = "Asignar";
    if (preview) preview.disabled = false;
  }
}

/* ── Ventana de categorías ── */

function renderListaCategorias() {
  const lista = $("catList");
  if (!lista) return;
  if (!cache.length) {
    lista.innerHTML = `<li class="cat-empty">Todavía no hay categorías.</li>`;
    return;
  }
  lista.innerHTML = cache.map(categoria => `
    <li class="cat-row" data-id="${categoria._id}">
      <span class="cat-name">${escapeHtml(categoria.nombre)}</span>
      <button type="button" class="mini" data-cat-act="renombrar" data-id="${categoria._id}">Renombrar</button>
    </li>`).join("");
}

function activarEdicion(fila, categoria) {
  fila.innerHTML = `
    <input class="cat-edit" value="${escapeHtml(categoria.nombre)}" aria-label="Nuevo nombre de la categoría" />
    <button type="button" class="mini success" data-cat-act="guardar" data-id="${categoria._id}">Guardar</button>
    <button type="button" class="mini" data-cat-act="cancelar">Cancelar</button>`;
  const input = fila.querySelector("input");
  input.focus();
  input.select();
  input.addEventListener("keydown", evento => {
    if (evento.key === "Enter") fila.querySelector('[data-cat-act="guardar"]')?.click();
    if (evento.key === "Escape") renderListaCategorias();
  });
}

async function guardarNombre(fila, categoria, getAdminToken) {
  const nombre = normalizarNombreCategoria(fila.querySelector("input")?.value);
  const status = $("catStatus");
  if (!nombre) { if (status) status.textContent = "El nombre no puede estar vacío."; return; }
  if (nombre === categoria.nombre) { renderListaCategorias(); return; }
  const token = getAdminToken();
  if (!token) { if (status) status.textContent = "La sesión venció. Ingresá nuevamente."; return; }
  const respuesta = await apiRenombrarCategoria(token, categoria._id, nombre);
  if (!respuesta.ok) { if (status) status.textContent = `Error: ${respuesta.error || "No se pudo renombrar."}`; return; }
  if (status) status.textContent = "";
  await cargarCategorias(token);
  renderListaCategorias();
  showToast(`Categoría renombrada a "${nombre}".`, "success");
}

async function crearDesdeModal(getAdminToken) {
  const input = $("catNueva");
  const status = $("catStatus");
  const nombre = normalizarNombreCategoria(input?.value);
  if (!nombre) { if (status) status.textContent = "Escribí un nombre para la categoría."; return; }
  const token = getAdminToken();
  if (!token) { if (status) status.textContent = "La sesión venció. Ingresá nuevamente."; return; }
  const respuesta = await apiCrearCategoria(token, nombre);
  if (!respuesta.ok) { if (status) status.textContent = `Error: ${respuesta.error || "No se pudo crear."}`; return; }
  if (input) input.value = "";
  if (status) status.textContent = "";
  await cargarCategorias(token);
  renderListaCategorias();
  showToast(`Categoría "${nombre}" creada.`, "success");
}

export function openCategoriasModal() {
  const overlay = $("catOverlay");
  if (!overlay) return;
  const status = $("catStatus");
  if (status) status.textContent = "";
  const bulkStatus = $("catBulkStatus");
  if (bulkStatus) bulkStatus.textContent = "";
  renderListaCategorias();
  refrescarSelectAsignar();
  invalidarVistaPrevia();
  void cargarMarcas(getToken());
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");
  setTimeout(() => $("catNueva")?.focus(), 80);
}

export function closeCategoriasModal() {
  const overlay = $("catOverlay");
  if (!overlay) return;
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
}

export function bindCategoriasModal({ getAdminToken, isBusy, onInventarioActualizado: alActualizar }) {
  const overlay = $("catOverlay");
  if (!overlay) return;

  if (typeof getAdminToken === "function") getToken = getAdminToken;
  if (typeof alActualizar === "function") onInventarioActualizado = alActualizar;

  $("btnCloseCat")?.addEventListener("click", closeCategoriasModal);
  overlay.addEventListener("click", evento => {
    if (evento.target === overlay) closeCategoriasModal();
  });
  $("btnCatCrear")?.addEventListener("click", () => { void crearDesdeModal(getAdminToken); });
  $("catNueva")?.addEventListener("keydown", evento => {
    if (evento.key === "Enter") $("btnCatCrear")?.click();
  });

  $("catList")?.addEventListener("click", evento => {
    const boton = evento.target.closest("button[data-cat-act]");
    if (!boton || isBusy()) return;
    const categoria = cache.find(item => item._id === boton.dataset.id);
    if (boton.dataset.catAct === "renombrar" && categoria) {
      activarEdicion(boton.closest(".cat-row"), categoria);
      return;
    }
    if (boton.dataset.catAct === "cancelar") { renderListaCategorias(); return; }
    if (boton.dataset.catAct === "guardar" && categoria) {
      void guardarNombre(boton.closest(".cat-row"), categoria, getAdminToken);
    }
  });

  // Asignación masiva por marca
  $("btnCatBulkPreview")?.addEventListener("click", () => { if (!isBusy()) void pedirVistaPrevia(); });
  $("btnCatBulkApply")?.addEventListener("click", () => { if (!isBusy()) void aplicarAsignacion(); });
  for (const id of ["catBulkMarca", "catBulkTexto", "catBulkCategoria", "catBulkSoloVacias"]) {
    $(id)?.addEventListener("input", invalidarVistaPrevia);
    $(id)?.addEventListener("change", invalidarVistaPrevia);
  }

  document.addEventListener("keydown", evento => {
    if (evento.key === "Escape" && overlay.style.display === "flex") closeCategoriasModal();
  });
}
