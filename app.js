// URL de la Web App (tu Apps Script)
const apiURL = "https://script.google.com/macros/s/AKfycbx2nkwjTykAYoQ3k4hGQLchwgQI_YKyuil-v2rHW7TIW5H-TRASMHUsnngcAyBMEtHc8w/exec";

const $ = sel => document.querySelector(sel);
const $all = sel => Array.from(document.querySelectorAll(sel));
const statusEl = $("#status");
const tbody = document.querySelector("#stockTable tbody");
const tpl = document.getElementById("row-template");
const searchInput = $("#searchInput");
const refreshBtn = $("#refreshBtn");

let ITEMS = []; // cache local de la respuesta

function showStatus(text, autoHide = false) {
  statusEl.textContent = text;
  statusEl.classList.remove("hidden");
  if (autoHide) setTimeout(()=> statusEl.classList.add("hidden"), 2500);
}

function hideStatus(){ statusEl.classList.add("hidden"); }

function colorClassForStock(s){
  if (s === null || s === undefined || s === "") return "stock-rojo";
  const n = Number(s);
  if (isNaN(n)) return "stock-rojo";
  if (n > 5) return "stock-verde";
  if (n === 2) return "stock-naranja";
  if (n <= 1) return "stock-rojo";
  return "";
}

async function fetchAll(){
  showStatus("Cargando stock...");
  try {
    const res = await fetch(apiURL, {cache: "no-store"});
    if(!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    if(!Array.isArray(json)) throw new Error("Respuesta inesperada");
    ITEMS = json;
    renderTable(ITEMS);
    showStatus(`Items recibidos: ${ITEMS.length}`, true);
  } catch (err) {
    console.error(err);
    showStatus("Error cargando datos. Revise consola.", false);
  }
}

function renderTable(items){
  tbody.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (let item of items){
    // proteger campos
    const codigo = item.codigo ?? "";
    const marca  = item.marca ?? "";
    const stock  = (item.stock === null || item.stock === undefined) ? "" : item.stock;
    const rowNum = item.row; // número de fila en la hoja

    const tr = tpl.content.firstElementChild.cloneNode(true);
    tr.className = colorClassForStock(item.stock);

    tr.querySelector(".td-codigo").textContent = codigo;
    tr.querySelector(".td-marca").textContent = marca;

    const input = tr.querySelector(".input-stock");
    input.value = stock;
    input.setAttribute("data-row", rowNum);
    input.setAttribute("aria-label", `Stock ${codigo}`);

    const btn = tr.querySelector(".btn-save");
    btn.addEventListener("click", () => updateStock(rowNum, input.value, btn));

    frag.appendChild(tr);
  }

  tbody.appendChild(frag);
}

// evita múltiples requests al tipear
function debounce(fn, wait=250){
  let t;
  return (...args)=> { clearTimeout(t); t = setTimeout(()=>fn(...args), wait); };
}

function applyFilter(text){
  const q = (text || "").trim().toLowerCase();
  if (!q) {
    $all("#stockTable tbody tr").forEach(r => r.style.display = "");
    return;
  }
  $all("#stockTable tbody tr").forEach(tr=>{
    const txt = tr.innerText.toLowerCase();
    tr.style.display = txt.includes(q) ? "" : "none";
  });
}

const debouncedFilter = debounce((e)=> applyFilter(e.target.value), 200);

searchInput.addEventListener("input", debouncedFilter);
refreshBtn.addEventListener("click", ()=> fetchAll());

// actualización individual
async function updateStock(row, value, btn){
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = "Guardando...";

  try {
    const payload = { row: row, stock: value === "" ? "" : value };
    const res = await fetch(apiURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    if (j && j.status && j.status === "OK") {
      showStatus("Actualizado correctamente", true);
      await fetchAll();
    } else {
      console.warn("Respuesta update:", j);
      showStatus("Error en la actualización (ver consola)", false);
    }
  } catch (err) {
    console.error("updateStock error:", err);
    showStatus("No se pudo actualizar. Revise la consola.", false);
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

// escape HTML (para seguridad adicional, aunque no usamos innerHTML)
function escapeHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// inicio
fetchAll();
