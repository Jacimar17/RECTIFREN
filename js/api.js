// ===========================================================
//                RECTIFREN – API CLIENT JS
//   Conexión directa con Google Apps Script (stock + autos)
// ===========================================================

// Tu nueva URL oficial de API:
const API_URL = "https://script.google.com/macros/s/AKfycbx2vkMRiGtQ0s9OIjq6ICYbb3qQlL8vFtD5BIbyRk9BT7N9c8hQdxrT1cy2H-bawtk5IQ/exec";


// ===========================================================
//                      GET STOCK
// ===========================================================
async function apiGetStock() {
    try {
        const response = await fetch(API_URL);
        return await response.json();
    } catch (err) {
        console.error("ERROR en apiGetStock():", err);
        return [];
    }
}


// ===========================================================
//               GUARDAR STOCK (BULK POST)
// ===========================================================
async function apiBulkUpdateStock(updatesArray) {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            contentType: "application/json",
            body: JSON.stringify({ updates: updatesArray })
        });

        return await response.json();
    } catch (err) {
        console.error("ERROR en apiBulkUpdateStock():", err);
        return { status: "ERROR" };
    }
}


// ===========================================================
//                GET AUTOS (Hoja: autos)
// ===========================================================
async function apiGetAutos() {
    try {
        const response = await fetch(API_URL + "?sheet=autos");
        return await response.json();
    } catch (err) {
        console.error("ERROR en apiGetAutos():", err);
        return [];
    }
}


// ===========================================================
//          REGISTRO DE VEHÍCULO NUEVO (addAuto)
// ===========================================================
async function apiAddAuto(autoData) {
    try {
        const response = await fetch(API_URL + "?addAuto=1", {
            method: "POST",
            contentType: "application/json",
            body: JSON.stringify(autoData)
        });

        return await response.json();
    } catch (err) {
        console.error("ERROR en apiAddAuto():", err);
        return { status: "ERROR" };
    }
}
