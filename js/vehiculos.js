/* =========================================================
   VEHICULOS.JS — Registro de vehículos
   ========================================================= */

import { getAutos, addAuto } from "./api.js";
import { showStatus, clearTable } from "./ui.js";

let autosData = [];

/* Elementos */
const tableBody = document.querySelector("#vehTable tbody");
const statusBox = document.querySelector("#statusVeh");
const search = document.querySelector("#searchVeh");
const form = document.querySelector("#vehForm");
const btnSave = document.querySelector("#btnSaveVeh");

/* ================================
   CARGA INICIAL
   ================================ */
window.addEventListener("DOMContentLoaded", loadAutos);

async function loadAutos() {
  autosData = await getAutos();
  renderAutos(autosData);
  showStatus(statusBox, "Vehículos cargados.", 1500);
}

/* ================================
   RENDER TABLA
   ================================ */
function renderAutos(data) {
  clearTable(tableBody);

  data.forEach(v => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${v.Patente}</td>
      <td>${v.Marca}</td>
      <td>${v.Vehiculo}</td>
      <td>${v.Kilometraje}</td>
      <td>${v.FechaIngreso}</td>
      <td>${v.Trabajo}</td>
      <td>${v.Observaciones}</td>
      <td>${v.Telefono || ""}</td>
    `;

    tableBody.appendChild(tr);
  });
}

/* ================================
   BUSCADOR
   ================================ */
search.addEventListener("input", () => {
  const q = search.value.toLowerCase();

  const filtered = autosData.filter(v =>
    v.Patente.toLowerCase().includes(q) ||
    v.Marca.toLowerCase().includes(q) ||
    v.Vehiculo.toLowerCase().includes(q)
  );

  renderAutos(filtered);
});

/* ================================
   AGREGAR NUEVO VEHÍCULO
   ================================ */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const obj = {
    Patente: document.querySelector("#patente").value.trim(),
    Marca: document.querySelector("#marca").value.trim(),
    Vehiculo: document.querySelector("#vehiculo").value.trim(),
    Kilometraje: document.querySelector("#km").value,
    FechaIngreso: document.querySelector("#fechaIngreso").value,
    Trabajo: document.querySelector("#trabajo").value.trim(),
    Observaciones: document.querySelector("#observaciones").value.trim(),
    Telefono: document.querySelector("#telefono").value.trim()
  };

  showStatus(statusBox, "Guardando...");

  const result = await addAuto(obj);

  showStatus(statusBox, "Vehículo registrado.", 2000);

  form.reset();
  loadAutos();
});
