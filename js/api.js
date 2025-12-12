// ===========================================================
//                RECTIFREN – API CLIENT JS (ES MODULE)
// ===========================================================

export const API_URL = "https://script.google.com/macros/s/AKfycbx2vkMRiGtQ0s9OIjq6ICYbb3qQlL8vFtD5BIbyRk9BT7N9c8hQdxrT1cy2H-bawtk5IQ/exec";


// ===========================================================
//                      GET STOCK  (getStock)
// ===========================================================
export async function getStock() {
    try {
        const response = await fetch(API_URL);
        return await response.json();
    } catch (err) {
        console.error("ERROR en getStock():", err);
        return [];
    }
}


// ===========================================================
//               GUARDAR STOCK (bulkUpdateStock)
// ===========================================================
export async function bulkUpdateStock(updatesArray) {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ updates: updatesArray })
        });

        return await response.json();
    } catch (err) {
        console.error("ERROR en bulkUpdateStock():", err);
        return { status: "ERROR" };
    }
}


// ===========================================================
//                  GET AUTOS  (getAutos)
// ===========================================================
export async function getAutos() {
    try {
        const response = await fetch(API_URL + "?sheet=autos");
        return await response.json();
    } catch (err) {
        console.error("ERROR en getAutos():", err);
        return [];
    }
}


// ===========================================================
//                 AGREGAR AUTO (addAuto)
// ===========================================================
export async function addAuto(autoData) {
    try {
        const response = await fetch(API_URL + "?addAuto=1", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(autoData)
        });

        return await response.json();
    } catch (err) {
        console.error("ERROR en addAuto():", err);
        return { status: "ERROR" };
    }
}
