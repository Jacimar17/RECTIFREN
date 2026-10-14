import { API_URL } from "./config.js";
import { authJsonHeaders } from "./api.js";
import { $, escapeHtml } from "./ui.js";

export function createEquivalencesController({ getAdminToken }) {
  let productoId = null;
  let searchTimer = null;

  async function openEquivModal(id, codigo, marca) {
    productoId = id;
    $("equivCodigo").textContent = codigo;
    $("equivMarca").textContent = marca;
    $("equivSearch").value = "";
    $("equivStatus").textContent = "";
    $("equivSuggestions").style.display = "none";
    $("equivList").innerHTML = '<div class="muted" style="font-size:13px">Cargando...</div>';

    const overlay = $("equivOverlay");
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
    setTimeout(() => $("equivSearch")?.focus(), 80);
    await loadEquivList();
  }

  function closeEquivModal() {
    const overlay = $("equivOverlay");
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
    productoId = null;
  }

  async function loadEquivList() {
    if (!productoId) return;
    try {
      const response = await fetch(`${API_URL}/api/equivalencias/${productoId}`);
      const data = await response.json();
      const list = $("equivList");
      list.innerHTML = "";
      if (!data.ok) { list.innerHTML = `<div class="muted">Error cargando equivalencias.</div>`; return; }

      const { vinculados, textoLibre, equivalenciasCatalogo = [] } = data;
      if (!vinculados.length && !textoLibre.length && !equivalenciasCatalogo.length) {
        list.innerHTML = `<div class="muted" style="font-size:13px">Sin equivalencias cargadas aún.</div>`;
        return;
      }

      if (equivalenciasCatalogo.length) {
        const catalog = document.createElement("section");
        catalog.className = "equiv-catalog";
        catalog.innerHTML = `
          <strong>Catálogo Litton · solo lectura</strong>
          <div class="equiv-catalog-items">${equivalenciasCatalogo.map(item =>
            `<span><b>${escapeHtml(item.codigo || "")}</b>${item.marca ? ` · ${escapeHtml(item.marca)}` : ""}</span>`
          ).join("")}</div>
        `;
        list.appendChild(catalog);
      }

      for (const item of vinculados) {
        const stock = Number(item.stock || 0);
        const stockClass = stock === 0 ? "out" : stock <= 2 ? "low" : "ok";
        const row = document.createElement("div");
        row.className = "equiv-item";
        row.innerHTML = `
          <div class="equiv-item-info">
            <div class="equiv-item-code">${escapeHtml(item.codigo)}</div>
            <div class="equiv-item-meta">${escapeHtml(item.marca)} · En stock</div>
          </div>
          <div class="equiv-item-stock ${stockClass}">${stock}</div>
          <button class="equiv-item-del" data-vid="${item._id}" title="Quitar vínculo">✕</button>
        `;
        row.querySelector(".equiv-item-del").addEventListener("click", () => desvincularEquiv(item._id, null));
        list.appendChild(row);
      }

      for (const text of textoLibre) {
        const row = document.createElement("div");
        row.className = "equiv-item";
        row.innerHTML = `
          <div class="equiv-item-info">
            <div class="equiv-item-code">${escapeHtml(text)}</div>
            <div class="equiv-item-meta" style="color:var(--warn)">Texto libre (no está en stock)</div>
          </div>
          <button class="equiv-item-del" title="Quitar">✕</button>
        `;
        row.querySelector(".equiv-item-del").addEventListener("click", () => desvincularEquiv(null, text));
        list.appendChild(row);
      }
    } catch (error) {
      $("equivList").innerHTML = `<div class="muted">Error: ${error.message}</div>`;
    }
  }

  async function buscarEquivSuggestions(query) {
    const box = $("equivSuggestions");
    if (!query) { box.style.display = "none"; return; }
    try {
      const response = await fetch(`${API_URL}/api/equivalencias/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      box.innerHTML = "";
      const items = (data.data || []).filter(item => item._id !== productoId);

      for (const item of items) {
        const stock = Number(item.stock || 0);
        const stockClass = stock === 0 ? "out" : stock <= 2 ? "low" : "ok";
        const row = document.createElement("div");
        row.className = "equiv-suggestion-item";
        row.innerHTML = `
          <div>
            <span class="sug-code">${escapeHtml(item.codigo)}</span>
            <span class="sug-marca"> · ${escapeHtml(item.marca)}</span>
          </div>
          <span class="sug-stock ${stockClass}">${stock}</span>
        `;
        row.addEventListener("click", () => vincularEquiv(item._id, null));
        box.appendChild(row);
      }

      const free = document.createElement("div");
      free.className = "equiv-suggestion-free";
      free.textContent = `Guardar "${query}" como texto (no está en stock)`;
      free.addEventListener("click", () => vincularEquiv(null, query));
      box.appendChild(free);
      box.style.display = items.length > 0 || query ? "block" : "none";
    } catch {
      box.style.display = "none";
    }
  }

  async function vincularEquiv(equivalenteId, equivalenteTexto) {
    if (!productoId) return;
    $("equivSuggestions").style.display = "none";
    $("equivSearch").value = "";
    $("equivStatus").textContent = "Guardando...";
    try {
      const response = await fetch(`${API_URL}/api/equivalencias/${productoId}/vincular`, {
        method: "POST",
        headers: authJsonHeaders(getAdminToken()),
        body: JSON.stringify({ equivalenteId, equivalenteTexto })
      });
      const data = await response.json();
      if (data.ok) {
        document.dispatchEvent(new Event("rectifren:inventory-updated"));
        $("equivStatus").textContent = "✅ Equivalencia agregada.";
        await loadEquivList();
      } else {
        $("equivStatus").textContent = `Error: ${data.error}`;
      }
    } catch (error) {
      $("equivStatus").textContent = `Error: ${error.message}`;
    }
  }

  async function desvincularEquiv(equivalenteId, equivalenteTexto) {
    if (!productoId) return;
    try {
      const response = await fetch(`${API_URL}/api/equivalencias/${productoId}/desvincular`, {
        method: "DELETE",
        headers: authJsonHeaders(getAdminToken()),
        body: JSON.stringify({ equivalenteId, equivalenteTexto })
      });
      const data = await response.json();
      if (data.ok) {
        document.dispatchEvent(new Event("rectifren:inventory-updated"));
        await loadEquivList();
      }
      else $("equivStatus").textContent = `Error: ${data.error}`;
    } catch (error) {
      $("equivStatus").textContent = `Error: ${error.message}`;
    }
  }

  function bind() {
    $("btnCloseEquiv")?.addEventListener("click", closeEquivModal);
    $("btnCloseEquiv2")?.addEventListener("click", closeEquivModal);
    $("equivOverlay")?.addEventListener("click", event => {
      if (event.target === $("equivOverlay")) closeEquivModal();
    });
    $("equivSearch")?.addEventListener("input", event => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => buscarEquivSuggestions(event.target.value.trim()), 250);
    });
    document.addEventListener("click", event => {
      if (!$("equivOverlay")?.contains(event.target)) $("equivSuggestions").style.display = "none";
    });
  }

  return { openEquivModal, closeEquivModal, bind };
}
