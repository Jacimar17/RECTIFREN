const test = require("node:test");
const assert = require("node:assert/strict");
const buscarAimar = require("../src/proveedores/aimar");

test("keeps unavailable Aimar stock distinct from an explicitly reported zero", () => {
  const withoutStock = buscarAimar.mapear({ data: { stock: null } });
  const invalidStock = buscarAimar.mapear({ data: { stock: false } });
  const zeroStock = buscarAimar.mapear({ data: { stock: "0" } });
  const availableStock = buscarAimar.mapear({ data: { stock: "4" } });

  assert.equal(withoutStock.stockProveedor, null);
  assert.equal(invalidStock.stockProveedor, null);
  assert.equal(zeroStock.stockProveedor, 0);
  assert.equal(availableStock.stockProveedor, 4);
});
