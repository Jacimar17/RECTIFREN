import test from "node:test";
import assert from "node:assert/strict";
import { isZeroStockRow, renderFamilySummaries } from "../../../js/ui/family-summary.js";

test("family UI hides only explicit zero-stock rows by default", () => {
  assert.equal(isZeroStockRow({ stock: 0 }), true);
  assert.equal(isZeroStockRow({ stock: "0" }), true);
  assert.equal(isZeroStockRow({ stock: 1 }), false);
  assert.equal(isZeroStockRow({ stock: null }), false);
  assert.equal(isZeroStockRow({}), false);
  assert.equal(isZeroStockRow({ stock: "not-a-number" }), false);
});

test("family summary toggle reveals then hides zero-stock rows without changing direct rows", () => {
  const originalDocument = globalThis.document;
  let click;
  const container = {
    innerHTML: "",
    addEventListener(type, handler) {
      assert.equal(type, "click");
      click = handler;
    },
  };
  globalThis.document = { getElementById: (id) => id === "familySummary" ? container : null };
  const families = [{
    id: "synthetic",
    filas: [
      { codigo: "PD/528", marca: "FRASLE", stock: 3, ubicacion: "NEGOCIO" },
      { codigo: "05P1379", marca: "LPR", stock: 0, ubicacion: "DEPOSITO_GALPON" },
    ],
    totales: { NEGOCIO: 3, DEPOSITO_GALPON: 0, total: 3 },
    fichaLitton: { code: "44980NA", name: "Synthetic family" },
    equivalenciasCatalogo: [],
  }];
  const clickToggle = () => click({
    target: { closest: (selector) => selector === "[data-family-zero-toggle]" ? {} : null },
  });

  try {
    renderFamilySummaries(families);
    assert.match(container.innerHTML, /PD\/528/);
    assert.doesNotMatch(container.innerHTML, /05P1379/);
    assert.match(container.innerHTML, /Mostrar resultados ocultos \(1\)/);

    clickToggle();
    assert.match(container.innerHTML, /05P1379/);
    assert.match(container.innerHTML, /Ocultar resultados sin stock/);

    clickToggle();
    assert.doesNotMatch(container.innerHTML, /05P1379/);
    assert.match(container.innerHTML, /PD\/528/);
  } finally {
    globalThis.document = originalDocument;
  }
});

test("family summary keeps long equivalence lists compact and stock details expandable", () => {
  const originalDocument = globalThis.document;
  const container = { innerHTML: "", addEventListener() {} };
  globalThis.document = { getElementById: (id) => id === "familySummary" ? container : null };
  const equivalenciasCatalogo = Array.from({ length: 20 }, (_, index) => ({
    codigo: `COD-${index + 1}`,
    marca: "LPR",
  }));
  const familias = [{
    id: "44980NA",
    filas: [{ codigo: "PD/528", marca: "FRASLE", stock: 3, ubicacion: "NEGOCIO" }],
    totales: { NEGOCIO: 3, DEPOSITO_GALPON: 0, total: 3 },
    fichaLitton: { code: "44980NA", name: "Pastilla delantera" },
    equivalenciasCatalogo,
  }];

  try {
    renderFamilySummaries(familias);
    assert.match(container.innerHTML, /Códigos equivalentes · 20/);
    assert.match(container.innerHTML, /Ver 12 códigos más/);
    assert.match(container.innerHTML, /COD-1/);
    assert.match(container.innerHTML, /COD-20/);
    assert.match(container.innerHTML, /<details class="family-summary-stock-details">/);
    assert.match(container.innerHTML, /Ver detalle de stock por código \(1\)/);
    assert.doesNotMatch(container.innerHTML, /<details class="family-summary-stock-details" open/);
  } finally {
    globalThis.document = originalDocument;
  }
});
