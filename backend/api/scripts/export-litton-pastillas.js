#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const LANG = "arg";
const CATEGORY = "PASTILLA DE FRENO";
const SEARCH_BASE = "https://orders-dot-littonbrakes-services.rj.r.appspot.com/public/products/simple-search";
const PRODUCT_BASE = "https://orders-dot-littonbrakes-services.rj.r.appspot.com/public/products";
const PER_PAGE = 20;
const CONCURRENT_DETAIL_REQUESTS = 3;

function csvValue(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function fetchJson(url, timeoutMs = 15000) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.status === 429) {
        lastError = new Error(`Litton respondió 429 al consultar ${url}`);
      } else if (!res.ok) {
        throw new Error(`Litton respondió ${res.status} al consultar ${url}`);
      } else {
        return await res.json();
      }
    } catch (error) {
      if (error.name === "AbortError") {
        lastError = new Error(`Litton tardó demasiado al consultar ${url}`);
      } else {
        lastError = error;
      }
    } finally {
      clearTimeout(timer);
    }
    if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 2500 * attempt));
  }
  throw lastError;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--retry-errors") {
    const jsonPath = path.resolve(__dirname, "../../../litton-pastillas.json");
    const rows = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (!Array.isArray(rows)) throw new Error("El archivo JSON debe contener una lista de productos.");
    const indices = rows.map((row, index) => row.error ? index : -1).filter((index) => index >= 0);
    for (let index = 0; index < indices.length; index++) {
      const position = indices[index];
      const row = rows[position];
      try {
        const detail = await fetchJson(`${PRODUCT_BASE}/${encodeURIComponent(row.code)}`);
        if (detail?.code !== row.code || detail.category !== CATEGORY || !Array.isArray(detail.substitutes)) {
          throw new Error(`Litton devolvió una ficha inválida para ${row.code}`);
        }
        rows[position] = {
          code: row.code,
          name: String(detail.name || row.name || "").trim(),
          brand: String(detail.subcategory || row.brand || "").trim(),
          category: detail.category,
          supplierCode: String(detail.supplier_code || row.supplierCode || "").trim(),
          substitutes: detail.substitutes,
        };
      } catch (error) {
        rows[position] = { ...row, error: error.message };
      }
      process.stdout.write(`Reintentando fichas: ${index + 1} de ${indices.length}\r`);
      if (index + 1 < indices.length) await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    process.stdout.write("\n");
    guardarResultados(rows);
    return;
  }
  if (args.length) throw new Error(`Argumentos desconocidos: ${args.join(" ")}`);

  const firstUrl = `${SEARCH_BASE}?lang=${LANG}&category=${encodeURIComponent(CATEGORY)}&page=1`;
  const first = await fetchJson(firstUrl);
  const total = Number(first?.pagination?.total || 0);
  const perPage = Number(first?.pagination?.perPage || PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const products = [];
  for (let page = 1; page <= totalPages; page++) {
    const url = `${SEARCH_BASE}?lang=${LANG}&category=${encodeURIComponent(CATEGORY)}&page=${page}`;
    const data = page === 1 ? first : await fetchJson(url);
    for (const item of Array.isArray(data?.results) ? data.results : []) {
      if (String(item.category || "").trim().toUpperCase() === CATEGORY) {
        products.push(item);
      }
    }
    process.stdout.write(`Leyendo catálogo: ${Math.min(page * perPage, total)} de ${total}\r`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  process.stdout.write("\n");

  const unique = new Map();
  for (const item of products) {
    const code = String(item.code || "").trim();
    if (code) unique.set(code, item);
  }

  const detailRows = await mapWithConcurrency(
    [...unique.values()],
    CONCURRENT_DETAIL_REQUESTS,
    async (item, index) => {
      const code = String(item.code || "").trim();
      try {
        const detail = await fetchJson(`${PRODUCT_BASE}/${encodeURIComponent(code)}`);
        return {
          code,
          name: String(detail.name || item.name || "").trim(),
          brand: String(detail.subcategory || item.subcategory || "").trim(),
          category: String(detail.category || item.category || "").trim(),
          supplierCode: String(detail.supplier_code || item.supplier_code || "").trim(),
          substitutes: Array.isArray(detail.substitutes) ? detail.substitutes : [],
        };
      } catch (error) {
        return {
          code,
          name: String(item.name || "").trim(),
          brand: String(item.subcategory || "").trim(),
          category: String(item.category || "").trim(),
          supplierCode: String(item.supplier_code || "").trim(),
          substitutes: [],
          error: error.message,
        };
      } finally {
        process.stdout.write(`Consultando fichas: ${index + 1} de ${unique.size}\r`);
      }
    }
  );
  process.stdout.write("\n");

  guardarResultados(detailRows);
}

function guardarResultados(detailRows) {
  const outputDir = path.resolve(__dirname, "../../../");
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "litton-pastillas.json");
  const csvPath = path.join(outputDir, "litton-pastillas.csv");

  fs.writeFileSync(jsonPath, JSON.stringify(detailRows, null, 2), "utf8");

  const csvRows = [
    [
      "codigo",
      "nombre",
      "marca",
      "categoria",
      "codigo_proveedor",
      "equivalencias",
      "error",
    ],
  ];
  for (const row of detailRows) {
    const equivalencias = row.substitutes
      .map((item) => `${String(item.code || "").trim()}:${String(item.value || "").trim()}`)
      .filter((item) => item !== ":")
      .join(" | ");
    csvRows.push([
      row.code,
      row.name,
      row.brand,
      row.category,
      row.supplierCode,
      equivalencias,
      row.error || "",
    ]);
  }
  fs.writeFileSync(
    csvPath,
    "\ufeff" + csvRows.map((row) => row.map(csvValue).join(",")).join("\r\n") + "\r\n",
    "utf8"
  );

  const errors = detailRows.filter((row) => row.error);
  console.log(`Productos únicos: ${detailRows.length}`);
  console.log(`Con equivalencias: ${detailRows.filter((row) => row.substitutes.length).length}`);
  console.log(`Fichas con error: ${errors.length}`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`CSV: ${csvPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
