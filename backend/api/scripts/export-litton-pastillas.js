#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { validarFichas } = require("../src/services/catalogo-pastillas");

const CATEGORY = "PASTILLA DE FRENO";
const SEARCH_BASE = "https://orders-dot-littonbrakes-services.rj.r.appspot.com/public/products/simple-search";
const PRODUCT_BASE = "https://orders-dot-littonbrakes-services.rj.r.appspot.com/public/products";

async function fetchJson(url, timeoutMs = 15000) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`Litton respondió ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 2500 * attempt));
  }
  throw lastError;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

async function extraerCatalogo({ consultar = fetchJson, pausa = () => new Promise(r => setTimeout(r, 1200)) } = {}) {
  const urlPagina = (page) => `${SEARCH_BASE}?lang=arg&category=${encodeURIComponent(CATEGORY)}&page=${page}`;
  const first = await consultar(urlPagina(1));
  const total = first?.pagination?.total;
  const perPage = first?.pagination?.perPage;
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(perPage) || perPage <= 0) {
    throw new Error("Paginación Litton inválida");
  }
  const pages = Math.ceil(total / perPage);
  const products = [];
  const codes = new Set();
  for (let page = 1; page <= pages; page++) {
    const data = page === 1 ? first : await consultar(urlPagina(page));
    const pagination = data?.pagination;
    if (!pagination || pagination.total !== total || pagination.perPage !== perPage ||
        (pagination.page != null && Number(pagination.page) !== page) ||
        !Array.isArray(data.results) ||
        data.results.length !== Math.min(perPage, total - (page - 1) * perPage)) {
      throw new Error(`Página ${page} incompleta o paginación inconsistente`);
    }
    for (const item of data.results) {
      if (typeof item?.code !== "string" || !item.code.trim() || item.category !== CATEGORY) {
        throw new Error(`Producto inválido en página ${page}`);
      }
      const key = item.code.trim().toUpperCase();
      if (codes.has(key)) throw new Error(`Código repetido en páginas: ${item.code}`);
      codes.add(key);
      products.push(item);
    }
    if (page < pages) await pausa();
  }
  const rows = await mapWithConcurrency(products, 3, async (item) => {
    const detail = await consultar(`${PRODUCT_BASE}/${encodeURIComponent(item.code.trim())}`);
    if (!detail || detail.code !== item.code || detail.category !== CATEGORY || !Array.isArray(detail.substitutes)) {
      throw new Error(`Ficha incompleta o distinta: ${item.code}`);
    }
    return {
      code: detail.code,
      name: detail.name,
      brand: detail.subcategory,
      category: detail.category,
      supplierCode: typeof detail.supplier_code === "number" ? String(detail.supplier_code) : detail.supplier_code,
      substitutes: detail.substitutes,
    };
  });
  return validarFichas(rows);
}

function csvValue(value) {
  return `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
}

function guardarResultados(rows) {
  const outputDir = path.resolve(__dirname, "../../../");
  const jsonPath = path.join(outputDir, "litton-pastillas.json");
  const csvPath = path.join(outputDir, "litton-pastillas.csv");
  const csvRows = [["codigo", "nombre", "marca", "categoria", "codigo_proveedor", "equivalencias", "error"]];
  for (const row of rows) {
    csvRows.push([row.code, row.name, row.brand, row.category, row.supplierCode,
      row.substitutes.map(item => `${item.code}:${item.value}`).join(" | "), ""]);
  }
  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), "utf8");
  fs.writeFileSync(csvPath, "\ufeff" + csvRows.map(row => row.map(csvValue).join(",")).join("\r\n") + "\r\n", "utf8");
  console.log(`Productos únicos: ${rows.length}\nJSON: ${jsonPath}\nCSV: ${csvPath}`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === "--retry-errors")) {
    console.error("Uso: export-litton-pastillas.js [--retry-errors]");
    process.exitCode = 1;
  } else {
    const ejecutar = async () => {
      if (!args.length) return extraerCatalogo();
      const jsonPath = path.resolve(__dirname, "../../../litton-pastillas.json");
      const rows = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      if (!Array.isArray(rows)) throw new Error("El archivo JSON debe contener una lista de productos");
      for (let i = 0; i < rows.length; i++) {
        if (!rows[i].error) continue;
        const detail = await fetchJson(`${PRODUCT_BASE}/${encodeURIComponent(rows[i].code)}`);
        if (!detail || detail.code !== rows[i].code || detail.category !== CATEGORY || !Array.isArray(detail.substitutes)) {
          throw new Error(`Ficha incompleta o distinta: ${rows[i].code}`);
        }
        rows[i] = { code: detail.code, name: detail.name, brand: detail.subcategory,
          category: detail.category, supplierCode: typeof detail.supplier_code === "number"
            ? String(detail.supplier_code) : detail.supplier_code, substitutes: detail.substitutes };
      }
      return validarFichas(rows);
    };
    ejecutar().then(guardarResultados).catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = { extraerCatalogo, guardarResultados };
