const test = require("node:test");
const assert = require("node:assert/strict");
const Producto = require("../src/models/Producto");
const migrarUbicaciones = require("../src/migrations/ubicaciones");
const { normalizarProducto } = require("../src/services/producto-view");

test("la migración no asigna ubicación a productos pendientes", async (t) => {
  let filtro;
  t.mock.method(Producto, "find", (query) => {
    filtro = query;
    return { select: () => ({ lean: async () => [] }) };
  });
  assert.equal(await migrarUbicaciones(), 0);
  assert.deepEqual(filtro.ubicacionPendiente, { $ne: true });
});

test("el inventario no inventa ubicación para un producto pendiente", () => {
  const result = normalizarProducto({
    codigo: "FLEX-1", marca: "FLEXIBLES", stock: 5, ubicacionPendiente: true,
  });
  assert.equal(result.ubicacion, undefined);
  assert.equal(result.stock, 5);
});
