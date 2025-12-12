/* =========================================================
   STOCK.JS — Control de Stock
   ========================================================= */

// IMPORTS CORREGIDOS
import { getStock, bulkUpdateStock as saveBulkStock } from "../js/api.js";
import { showStatus, clearTable, el } from "../js/ui.js";

let stockData = [];
let pendingUpdates = [];

/* Elementos */
const tableBody = document.querySelector("#stockTable tbody");
const searchInput = document.querySelector("#search");
const btnRefresh = document.querySelector("#btnRefresh");
const btnSaveAll = document.querySelector("#btnSaveAll");
const btnDownload = document.querySelector("#btnDownload");
const statusBox = document.querySelector("#status");

/* ================================
   CARGA INICIAL
   ================================ */
window.addEventListener("DOMContentLoaded", loadStock);

async function loadStock() {
  showStatus(statusBox, "Cargando stock...");

  stockData = await getStock();
  renderTable(stockData);

  showStatus(statusBox, "Stock cargado.", 1500);
}

/* ================================
   RENDER TABLA
   ================================ */
function renderTable(data) {
  clearTable(tableBody);

  data.forEach(item => {
    const tpl = document.querySelector("#row-template");
    const row = tpl.content.cloneNode(true);
    
    const tdCodigo = row.querySelector(".td-codigo");
    const tdMarca = row.querySelector(".td-marca");
    const inputStock = row.querySelector(".input-stock");
    const btnPlus = row.querySelector(".btn-plus");
    const btnMinus = row.querySelector(".btn-minus");

    tdCodigo.textContent = item.codigo;
    tdMarca.textContent = item.marca;
    inputStock.value = item.stock ?? "";

    /* Colorear celda según stock */
    colorStockCell(inputStock, item.stock);

    /* Eventos para + y - */
    btnPlus.addEventListener("click", () => {
      inputStock.value = Number(inputStock.value || 0) + 1;
      registerUpdate(item.row, inputStock.value);
      colorStockCell(inputStock, inputStock.value);
    });

    btnMinus.addEventListener("click", () => {
      inputStock.value = Math.max(0, Number(inputStock.value || 0) - 1);
      registerUpdate(item.row, inputStock.value);
      colorStockCell(inputStock, inputStock.value);
    });

    /* Cambio manual */
    inputStock.addEventListener("input", () => {
      registerUpdate(item.row, inputStock.value);
      colorStockCell(inputStock, inputStock.value);
    });

    tableBody.appendChild(row);
  });
}

/* ================================
   COLORES DE STOCK
   ================================ */
function colorStockCell(input, value) {
  const cell = input.parentElement;
  cell.classList.remove("stock-high", "stock-mid", "stock-low");

  const v = Number(value);

  if (isNaN(v)) return;
  if (v > 5) cell.classList.add("stock-high");
  else if (v >= 2 && v <= 4) cell.classList.add("stock-mid");
  else cell.classList.add("stock-low");
}

/* ================================
   REGISTRAR CAMBIOS EN MEMORIA
   ================================ */
function registerUpdate(row, newValue) {
  const exists = pendingUpdates.find(u => u.row === row);

  if (exists) {
    exists.stock = Number(newValue);
  } else {
    pendingUpdates.push({ row, stock: Number(newValue) });
  }
}

/* ================================
   GUARDAR TODO (BULK POST)
   ================================ */
btnSaveAll.addEventListener("click", async () => {
  if (pendingUpdates.length === 0) {
    showStatus(statusBox, "No hay cambios para guardar.");
    return;
  }

  showStatus(statusBox, "Guardando cambios...");

  await saveBulkStock(pendingUpdates);
  pendingUpdates = [];

  showStatus(statusBox, "Cambios guardados.");
});

/* ================================
   REFRESCAR
   ================================ */
btnRefresh.addEventListener("click", loadStock);

/* ================================
   BUSCAR
   ================================ */
searchInput.addEventListener("input", () => {
  const q = searchInput.value.toLowerCase();
  const filtered = stockData.filter(x =>
    x.codigo.toLowerCase().includes(q) ||
    x.marca.toLowerCase().includes(q)
  );
  renderTable(filtered);
});

/* ================================
   DESCARGAR EXCEL
   ================================ */
btnDownload.addEventListener("click", () => {
  const ws = XLSX.utils.json_to_sheet(stockData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock");
  XLSX.writeFile(wb, "stock.xlsx");
});
