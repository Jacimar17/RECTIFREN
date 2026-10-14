const test = require("node:test");
const assert = require("node:assert/strict");
const {
  construirProductoLitton,
  construirVariantes,
  prepararGrupos,
} = require("../src/migrations/litton-variants");
const { normalizarProducto, normalizarProductos } = require("../src/services/producto-view");

const detail = {
  code: "44980NA",
  name: "Pastilla de freno",
  category: "PAST",
  subcategory: "LITTON",
  image: "44980.jpg",
  substitutes: [
    { value: "PD/528", code: "FRAS-LE" },
    { value: "05P1379", code: "LPR" },
  ],
};

test("groups duplicate brand/location rows without losing quantities", () => {
  const variants = construirVariantes([
    { _id: "1", codigo: "RF-528", marca: "LPR", ubicacion: "NEGOCIO", stock: 3, stockMinimo: 4 },
    { _id: "2", codigo: "RF528", marca: "LPR", ubicacion: "NEGOCIO", stock: 2, stockMinimo: 2 },
    { _id: "3", codigo: "RF-528", marca: "LPR", ubicacion: "DEPOSITO_GALPON", stock: 7 },
  ]);

  assert.deepEqual(variants, [
    { marca: "LPR", ubicacion: "DEPOSITO_GALPON", cantidad: 7, stockMinimo: 2 },
    { marca: "LPR", ubicacion: "NEGOCIO", cantidad: 5, stockMinimo: 2 },
  ]);
});

test("builds a Litton-backed product and preserves total stock and catalogue aliases", () => {
  const product = construirProductoLitton(detail, [
    { codigo: "RF-528", marca: "LITTON", ubicacion: "NEGOCIO", stock: 17 },
    { codigo: "RF528", marca: "LPR", ubicacion: "DEPOSITO_GALPON", stock: 14 },
  ]);

  assert.equal(product.schemaVersion, 2);
  assert.equal(product.codigo, "44980NA");
  assert.equal(product.fichaLitton, detail);
  assert.equal(product.imagenLitton, "https://d3h8dra63998td.cloudfront.net/products/jpg/44980.jpg");
  assert.deepEqual(product.equivalenciasCatalogo.map(({ codigo, marca }) => [codigo, marca]), [
    ["44980NA", "LITTON"],
    ["PD/528", "FRAS-LE"],
    ["05P1379", "LPR"],
  ]);
  assert.equal(product.variantes.reduce((total, variant) => total + variant.cantidad, 0), 31);
});

test("requires explicit RF-to-Litton mappings", () => {
  const groups = prepararGrupos([
    { codigo: "RF-528", marca: "LITTON", stock: 17 },
    { codigo: "RF528", marca: "LPR", stock: 14 },
  ], {});

  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "RF528");
  assert.equal(groups[0].codigoLitton, "");
  assert.equal(groups[0].documentos.length, 2);
});

test("exposes each Litton variant as an inventory row with its catalogue data", () => {
  const producto = {
    _id: "canonical",
    schemaVersion: 2,
    codigo: "44980NA",
    fichaLitton: detail,
    imagenLitton: "https://images.example/44980.jpg",
    equivalenciasCatalogo: [{ codigo: "PD/528", marca: "FRAS-LE" }],
    variantes: [
      { marca: "LITTON", ubicacion: "NEGOCIO", cantidad: 17 },
      { marca: "LPR", ubicacion: "DEPOSITO_GALPON", cantidad: 14 },
    ],
  };
  const rows = normalizarProductos(producto);

  assert.deepEqual(rows.map(({ codigo, marca, ubicacion, stock }) =>
    [codigo, marca, ubicacion, stock]), [
    ["44980NA", "LITTON", "NEGOCIO", 17],
    ["44980NA", "LPR", "DEPOSITO_GALPON", 14],
  ]);
  assert.equal(rows[0].fichaLitton, detail);
  assert.deepEqual(rows[0].equivalenciasCatalogo, [{ codigo: "PD/528", marca: "FRAS-LE" }]);
  assert.equal(normalizarProducto(producto).stock, 31);
});

test("rejects invalid stock instead of silently changing it", () => {
  assert.throws(
    () => construirVariantes([{ codigo: "RF-528", marca: "LPR", stock: -1 }]),
    /Stock inválido/
  );
  assert.throws(
    () => construirVariantes([{ codigo: "RF-528", marca: "LPR", stock: 1, stockMinimo: -1 }]),
    /Stock mínimo inválido/
  );
});
