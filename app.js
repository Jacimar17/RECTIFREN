const apiURL = "https://script.google.com/macros/s/AKfycbwScwPM18S-BMW1yaS7jqGsPHFSlce_smlO0FSpafiuFaWxYFgKyUABIeuf5XW3ojYYfw/exec";

async function cargarDatos() {
    const response = await fetch(apiURL);
    const data = await response.json();

    const tbody = document.querySelector("#tablaStock tbody");
    tbody.innerHTML = "";

    data.forEach(item => {
        const tr = document.createElement("tr");

        // Colores según stock
        if (item.stock > 5) tr.classList.add("stock-verde");
        else if (item.stock == 2) tr.classList.add("stock-naranja");
        else if (item.stock <= 1) tr.classList.add("stock-rojo");

        tr.innerHTML = `
            <td>${item.codigo}</td>
            <td>${item.marca}</td>
            <td>
                <input type="number" value="${item.stock}" min="0" id="stock-${item.row}">
            </td>
            <td><button onclick="actualizarStock(${item.row})">Actualizar</button></td>
        `;

        tbody.appendChild(tr);
    });
}

async function actualizarStock(row) {
    const nuevoValor = document.querySelector(`#stock-${row}`).value;

    await fetch(apiURL, {
        method: "POST",
        body: JSON.stringify({ row: row, stock: nuevoValor })
    });

    cargarDatos(); // Refresca la tabla
}

// Buscador
document.getElementById("searchInput").addEventListener("input", () => {
    let filtro = document.getElementById("searchInput").value.toLowerCase();
    let filas = document.querySelectorAll("#tablaStock tbody tr");

    filas.forEach(fila => {
        let texto = fila.innerText.toLowerCase();
        fila.style.display = texto.includes(filtro) ? "" : "none";
    });
});

// Cargar datos al iniciar
cargarDatos();
