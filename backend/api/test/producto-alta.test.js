const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validarNuevoProducto,
  normalizarCodigo,
  validarDescripcion,
} = require("../src/validators/productos");

test("normaliza el código a mayúsculas y sin espacios de más", () => {
  assert.equal(normalizarCodigo("  fr-528  "), "FR-528");
  assert.equal(normalizarCodigo("pd/   59"), "PD/ 59");

  const input = validarNuevoProducto({ codigo: "  rf-528 ", marca: " lpr ", stock: "3" });
  assert.equal(input.codigo, "RF-528");
  assert.equal(input.marca, "lpr");
  assert.equal(input.stock, 3);
});

test("exige código y marca con mensajes claros", () => {
  assert.throws(() => validarNuevoProducto({ marca: "LPR" }), /código es obligatorio/);
  assert.throws(() => validarNuevoProducto({ codigo: "RF-1" }), /marca es obligatoria/);
  assert.throws(() => validarNuevoProducto({ codigo: "   ", marca: "LPR" }), /código es obligatorio/);
});

test("rechaza cantidades negativas o no numéricas", () => {
  assert.throws(() => validarNuevoProducto({ codigo: "RF-1", marca: "LPR", stock: -1 }), /cantidad/i);
  assert.throws(() => validarNuevoProducto({ codigo: "RF-1", marca: "LPR", stock: "abc" }), /cantidad/i);
  assert.equal(validarNuevoProducto({ codigo: "RF-1", marca: "LPR" }).stock, 0);
});

test("detecta la intención de sumar stock al existente", () => {
  assert.equal(validarNuevoProducto({ codigo: "RF-1", marca: "LPR", sumarStock: true }).sumarStock, true);
  assert.equal(validarNuevoProducto({ codigo: "RF-1", marca: "LPR", sumarStock: "true" }).sumarStock, true);
  assert.equal(validarNuevoProducto({ codigo: "RF-1", marca: "LPR" }).sumarStock, false);
});

test("valida la descripción y su longitud máxima", () => {
  assert.equal(validarDescripcion("  pastilla delantera "), "pastilla delantera");
  assert.equal(validarDescripcion(undefined), "");
  assert.throws(() => validarDescripcion("x".repeat(501)), /500/);
});

test("usa la ubicación predeterminada según el prefijo del código", () => {
  assert.equal(validarNuevoProducto({ codigo: "RF-528", marca: "LPR" }).ubicacion, "NEGOCIO");
  assert.equal(validarNuevoProducto({ codigo: "PD/59", marca: "LPR" }).ubicacion, "DEPOSITO_GALPON");
  assert.equal(
    validarNuevoProducto({ codigo: "PD/59", marca: "LPR", ubicacion: "NEGOCIO" }).ubicacion,
    "NEGOCIO"
  );
  assert.throws(
    () => validarNuevoProducto({ codigo: "PD/59", marca: "LPR", ubicacion: "OTRO" }),
    /ubicación/i
  );
});
