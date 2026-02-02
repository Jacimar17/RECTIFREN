const API_URL = "https://script.google.com/macros/s/AKfycbzFSQtb-uD43OWt6VVmrzgGuq-deTeViiPsYVdOa7HQz17hqiuDQyxgDVLYbnmQ166EPQ/exec";

const el = (id) => document.getElementById(id);
let cache = [];

function render(list) {
  const q = (el("search").value || "").trim().toLowerCase();
  const tbody = el("tbody");
  tbody.innerHTML = "";

  const filtered = list.filter(x => {
    if (!q) return true;
    return (x.codigo || "").toLowerCase().includes(q) || (x.marca || "").toLowerCase().includes(q);
  });

  for (const item of filtered) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.codigo || ""}</td>
      <td>${item.marca || ""}</td>
      <td class="right">${Number(item.stock || 0)}</td>
    `;
    tbody.appendChild(tr);
  }

  el("status").textContent = `Mostrando ${filtered.length} de ${list.length} registros.`;
}

async function loadStock() {
  el("status").textContent = "Cargando...";
  try {
    const url = new URL(API_URL);
    url.searchParams.set("action", "list");

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!data.ok) {
      el("status").textContent = `Error: ${data.error || "No se pudo cargar."}`;
      return;
    }

    cache = data.data || [];
    render(cache);
  } catch (err) {
    el("status").textContent = `Error: ${String(err)}`;
  }
}

el("refresh").addEventListener("click", loadStock);
el("search").addEventListener("input", () => render(cache));

loadStock();
