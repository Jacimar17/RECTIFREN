/* =========================================================
   API.JS — Conexión con Google Sheets (Stock + Autos)
   ========================================================= */

const API_URL = "https://script.google.com/macros/s/AKfycbx2nkwjTykAYoQ3k4hGQLchwgQI_YKyuil-v2rHW7TIW5H-TRASMHUsnngcAyBMEtHc8w/exec";

/* -------------------------------
   GET STOCK — devuelve array
   ------------------------------- */
export async function getStock() {
  const res = await fetch(API_URL);
  return await res.json();
}

/* -------------------------------
   BULK POST STOCK
   ------------------------------- */
export async function saveBulkStock(updates) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ updates })
  });

  return await res.json();
}

/* -------------------------------
   GET AUTOS
   ------------------------------- */
export async function getAutos() {
  const res = await fetch(`${API_URL}?sheet=autos`);
  return await res.json();
}

/* -------------------------------
   POST NUEVO AUTO
   ------------------------------- */
export async function addAuto(autoData) {
  const res = await fetch(`${API_URL}?addAuto=1`, {
    method: "POST",
    body: JSON.stringify(autoData)
  });

  return await res.json();
}
