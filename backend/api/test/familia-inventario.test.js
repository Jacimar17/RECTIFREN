const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizarCodigo,
  resolverFamiliaInventario,
  ubicacionEfectiva,
} = require("../src/proveedores/familia-inventario");

test("normalizes separators and case without matching partial codes", () => {
  assert.equal(normalizarCodigo("PD/528"), normalizarCodigo("pd-528"));
  assert.equal(normalizarCodigo("PD528"), normalizarCodigo("PD/528"));
  assert.notEqual(normalizarCodigo("3176"), normalizarCodigo("13176"));
});

test("resolves provider aliases and linked inventory rows once", () => {
  const inventory = [
    {
      _id: "litton",
      codigo: "RF-528",
      marca: "LITTON",
      stock: 17,
      equivalencias: "44980NA",
      equivalentesVinculados: ["lpr"],
    },
    {
      _id: "lpr",
      codigo: "RF-528",
      marca: "LPR",
      stock: 3,
      equivalencias: "05P1379",
      equivalentesVinculados: ["litton", "galpon"],
    },
    {
      _id: "galpon",
      codigo: "05P1379",
      marca: "LPR",
      stock: 1,
      equivalentesVinculados: ["lpr"],
    },
    { _id: "false-positive", codigo: "13176", marca: "LPR", stock: 9 },
  ];

  const result = resolverFamiliaInventario(inventory, ["44980NA", "PD/528", "05P1379"]);
  assert.deepEqual(result.filas.map((item) => item._id).sort(), ["galpon", "litton", "lpr"]);
  assert.deepEqual(result.totales, { NEGOCIO: 20, DEPOSITO_GALPON: 1, total: 21 });
});

test("explicit location overrides the legacy code-based default", () => {
  assert.equal(ubicacionEfectiva({ codigo: "RF-528" }), "NEGOCIO");
  assert.equal(ubicacionEfectiva({ codigo: "05P1379" }), "DEPOSITO_GALPON");
  assert.equal(ubicacionEfectiva({ codigo: "RF-528", ubicacion: "DEPOSITO_GALPON" }), "DEPOSITO_GALPON");
});
