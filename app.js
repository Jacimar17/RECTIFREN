/* app.js - integración Google Sheets (via Apps Script) */
const apiURL = "https://script.google.com/macros/s/AKfycbx2nkwjTykAYoQ3k4hGQLchwgQI_YKyuil-v2rHW7TIW5H-TRASMHUsnngcAyBMEtHc8w/exec";

const tbody = document.querySelector("#tabla tbody");
const statusEl = document.getElementById("status");
const searchInput = document.getElementById("search");
const saveAllBtn = document.getElementById("saveAll");
const downloadBtn = document.getElementById("downloadExcel");
const refreshBtn = document.getElementById("refresh");

let ITEMS = [];      // datos originales traídos de la API
let VISIBLE = [];    // items actualmente renderizados (post-filtrado)

// mostrar estado
function showStatus(msg, persist=false){
  statusEl.style.display = "block";
  statusEl.textContent = msg;
  if(!persist){
    setTimeout(()=> { statusEl.style.display = "none"; }, 2500);
  }
}

// detectar clase de color para la celda stock
function colorClass(stock){
  if (stock === "" || stock === null || stock === undefined) return "stock-cell-red";
  const n = Number(stock);
  if (isNaN(n)) return "stock-cell-red";
  if (n > 5) return "stock-cell-green";
  if (n >= 2 && n <= 4) return "stock-cell-orange";
  return "stock-cell-red";
}

/* --- limpiar y normalizar la respuesta de la API --- */
function normalize(raw){
  // raw es array de objetos {codigo, marca, stock, row}
  const out = [];
  for (const it of raw){
    const codigo = (it.codigo || "").toString().trim();
    if (!codigo) continue; // ignorar sin código

    let marca = (it.marca || "").toString().trim();
    // normalizar stock: null/"" -> ""
    let stock = it.stock;
    if (stock === null || stock === undefined) stock = "";
    else {
      const n = Number(stock);
      stock = isNaN(n) ? "" : n;
    }

    out.push({
      codigo: codigo,
      marca: marca,
      stock: stock,
      row: it.row || null
    });
  }
  return out;
}

/* --- fetch ALL from API --- */
async function fetchAll(){
  showStatus("Cargando stock...");
  try {
    const res = await fetch(apiURL, { cache: "no-store" });
    if(!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    ITEMS = normalize(json);
    VISIBLE = ITEMS.slice(); // copia
    render(VISIBLE);
    showStatus(`Items recibidos: ${ITEMS.length}`);
    console.log("Items recibidos:", ITEMS.length);
  } catch (err){
    console.error("fetchAll error:", err);
    showStatus("Error cargando datos (ver consola)", true);
  }
}

/* --- render de tabla --- */
function render(items){
  tbody.innerHTML = "";
  items.forEach((it, idx) => {
    const tr = document.createElement("tr");

    // td codigo
    const tdCodigo = document.createElement("td");
    tdCodigo.textContent = it.codigo;
    // td marca
    const tdMarca = document.createElement("td");
    tdMarca.textContent = it.marca;

    // td stock (solo la celda tendrá clase)
    const tdStock = document.createElement("td");
    tdStock.className = colorClass(it.stock);
    const input = document.createElement("input");
    input.type = "number";
    input.className = "stock-input";
    input.value = (it.stock === "" ? "" : it.stock);
    input.min = 0;
    input.dataset.row = it.row;      // fila real en Google Sheets
    input.dataset.index = idx;      // índice en VISIBLE
    // detectar cambio localmente
    input.addEventListener("input", (e)=>{
      const i = Number(e.target.dataset.index);
      VISIBLE[i].stock = e.target.value === "" ? "" : Number(e.target.value);
      tdStock.className = colorClass(VISIBLE[i].stock);
    });

    tdStock.appendChild(input);

    // td ajustar (+ / -)
    const tdAdj = document.createElement("td");
    const btnPlus = document.createElement("button");
    btnPlus.className = "btn-small";
    btnPlus.textContent = "+";
    btnPlus.onclick = ()=> {
      const i = Number(input.dataset.index);
      const cur = VISIBLE[i].stock === "" ? 0 : Number(VISIBLE[i].stock);
      VISIBLE[i].stock = cur + 1;
      renderRowUpdate(i, VISIBLE[i], tr);
    };
    const btnMinus = document.createElement("button");
    btnMinus.className = "btn-small";
    btnMinus.textContent = "−";
    btnMinus.onclick = ()=> {
      const i = Number(input.dataset.index);
      const cur = VISIBLE[i].stock === "" ? 0 : Number(VISIBLE[i].stock);
      VISIBLE[i].stock = Math.max(0, cur - 1);
      renderRowUpdate(i, VISIBLE[i], tr);
    };
    tdAdj.appendChild(btnPlus);
    tdAdj.appendChild(btnMinus);

    tr.appendChild(tdCodigo);
    tr.appendChild(tdMarca);
    tr.appendChild(tdStock);
    tr.appendChild(tdAdj);

    tbody.appendChild(tr);
  });
}

// actualizar visual de fila sin volver a renderizar todo
function renderRowUpdate(index, item, tr){
  const input = tr.querySelector(".stock-input");
  input.value = (item.stock === "" ? "" : item.stock);
  input.dataset.index = index;
  tr.querySelector("td:nth-child(3)").className = colorClass(item.stock);
}

/* --- Guardar TODOS: iterar y enviar POST por fila --- */
async function saveAll(){
  // determinar cambios: comparo ITEMS (original) con VISIBLE (puede estar filtrado)
  // mejor: tomar valores actuales del DOM y enviarlos por fila si tienen row
  const rows = Array.from(document.querySelectorAll(".stock-input")).map(inp=>{
    return {
      row: inp.dataset.row ? Number(inp.dataset.row) : null,
      stock: inp.value === "" ? "" : Number(inp.value)
    };
  });

  // filtrar solo los que tengan row (para que se actualicen en Sheets)
  const toSend = rows.filter(r => r.row !== null);
  if (toSend.length === 0){
    alert("No hay filas con 'row' (no se puede guardar).");
    return;
  }

  saveAllBtn.disabled = true;
  showStatus(`Guardando ${toSend.length} filas...`, true);

  let success = 0;
  for (let i = 0; i < toSend.length; i++){
    const p = toSend[i];
    try {
      const res = await fetch(apiURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row: p.row, stock: p.stock })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      if (j && j.status && j.status.toUpperCase() === "OK") success++;
      else console.warn("Fila no OK", p, j);
    } catch (err){
      console.error("Error guardando fila", p, err);
    }
    showStatus(`Guardadas ${i+1}/${toSend.length}`, true);
  }

  saveAllBtn.disabled = false;
  showStatus(`Guardado finalizado: ${success}/${toSend.length}`, true);
  // refrescar para asegurar consistencia con la hoja
  await fetchAll();
}

/* --- Descargar Excel (current visible state) --- */
function downloadExcel(){
  const rows = [["Código","Marca","Stock"]];
  const trs = Array.from(document.querySelectorAll("#tabla tbody tr"));
  trs.forEach(tr => {
    const codigo = tr.children[0].innerText.trim();
    const marca = tr.children[1].innerText.trim();
    const stockInput = tr.querySelector("input.stock-input");
    const stockVal = stockInput ? stockInput.value : "";
    rows.push([codigo, marca, stockVal]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Stock");
  XLSX.writeFile(wb, "stock_rectifren.xlsx");
}

/* --- Buscador (filtra ITEMS y actualiza VISIBLE) --- */
function applyFilter(q){
  const t = (q||"").trim().toLowerCase();
  if (!t){ VISIBLE = ITEMS.slice(); render(VISIBLE); return; }
  VISIBLE = ITEMS.filter(it => (it.codigo||"").toLowerCase().includes(t) || (it.marca||"").toLowerCase().includes(t));
  render(VISIBLE);
}

/* --- Eventos UI --- */
saveAllBtn.addEventListener("click", saveAll);
downloadBtn.addEventListener("click", downloadExcel);
refreshBtn.addEventListener("click", ()=> { searchInput.value = ""; fetchAll(); });
searchInput.addEventListener("input", (e)=> applyFilter(e.target.value) );

/* Inicial */
fetchAll();
