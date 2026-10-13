const test = require("node:test");
const assert = require("node:assert/strict");
const {
  coincideCodigoEspecial,
  resolverFamiliasLittonEnVivo,
} = require("../src/proveedores/familia-litton-en-vivo");

function detail(code) {
  return {
    code,
    subcategory: "LITTON",
    substitutes: [
      { value: "PD/528", code: "FRASLE" },
      { value: "05P1379", code: "LPR" },
      { value: "3176", code: "LPR" },
      { value: "RCPT09460", code: "TRW - BRASIL" },
    ],
  };
}

const inventory = [
  { _id: "rf-litton", codigo: "RF-528", marca: "LITTON", stock: 17, ubicacion: "NEGOCIO" },
  { _id: "rf-lpr", codigo: "RF528", marca: "LPR", stock: 14, ubicacion: "NEGOCIO" },
  { _id: "trw", codigo: "TRW09460", marca: "TRW VARGA", stock: 9, ubicacion: "DEPOSITO_GALPON" },
  { _id: "partial-code", codigo: "13176", marca: "LPR", stock: 99, ubicacion: "NEGOCIO" },
  { _id: "other-brand", codigo: "TRW09460", marca: "GENERICA", stock: 70, ubicacion: "NEGOCIO" },
  { _id: "manual-link", codigo: "OTRO-CODIGO", marca: "GENERICA", stock: 0, equivalencias: "PD/528", ubicacion: "NEGOCIO" },
];

test("expands query 528 through Litton and totals RF and verified TRW stock by location", async () => {
  const before = inventory.map(({ _id, codigo, stock, ubicacion }) => ({ _id, codigo, stock, ubicacion }));
  const lookedUp = [];
  const result = await resolverFamiliasLittonEnVivo("528", inventory, {
    buscarLitton: async (query) => {
      assert.equal(query, "528");
      return [{ codigo: "44980ULT", busquedaUsada: "PD/528" }];
    },
    obtenerDetalle: async (code) => {
      lookedUp.push(code);
      return detail(code);
    },
  });

  assert.deepEqual(lookedUp, ["44980ULT"]);
  assert.equal(result.error, "");
  assert.deepEqual(result.matchedIds.sort(), ["manual-link", "rf-litton", "rf-lpr", "trw"]);
  assert.equal(result.familias.length, 1);
  assert.deepEqual(result.familias[0].totales, {
    NEGOCIO: 31,
    DEPOSITO_GALPON: 9,
    total: 40,
  });
  assert.deepEqual(
    result.familias[0].filas.map((row) => [row.codigo, row.ubicacion, row.stock]),
    [
      ["OTRO-CODIGO", "NEGOCIO", 0],
      ["RF-528", "NEGOCIO", 17],
      ["RF528", "NEGOCIO", 14],
      ["TRW09460", "DEPOSITO_GALPON", 9],
    ]
  );
  assert.deepEqual(
    inventory.map(({ _id, codigo, stock, ubicacion }) => ({ _id, codigo, stock, ubicacion })),
    before
  );
});

test("accepts TRW/RCPT only for an exact suffix and TRW-confirmed supplier brand", () => {
  const officialAlias = { codigo: "RCPT09460", marca: "TRW - BRASIL" };
  assert.equal(coincideCodigoEspecial(
    { codigo: "TRW09460", marca: "TRW VARGA" }, officialAlias
  ), true);
  assert.equal(coincideCodigoEspecial(
    { codigo: "TRW109460", marca: "TRW VARGA" }, officialAlias
  ), false);
  assert.equal(coincideCodigoEspecial(
    { codigo: "TRW09460", marca: "GENERICA" }, officialAlias
  ), false);
  assert.equal(coincideCodigoEspecial(
    { codigo: "TRW09460", marca: "TRW VARGA" },
    { codigo: "RCPT09460", marca: "LPR" }
  ), false);
});

test("returns local-search fallback information when Litton is unavailable", async () => {
  const result = await resolverFamiliasLittonEnVivo("528", inventory, {
    buscarLitton: async () => {
      throw new Error("Litton no disponible");
    },
    obtenerDetalle: async () => {
      throw new Error("No debe consultar detalles");
    },
  });

  assert.equal(result.familias.length, 0);
  assert.deepEqual(result.matchedIds, []);
  assert.equal(result.error, "Litton no disponible");
});

test("keeps verified stock families when another Litton detail fails or is unverified", async () => {
  const result = await resolverFamiliasLittonEnVivo("528", inventory, {
    buscarLitton: async () => [
      { codigo: "44980ULT", busquedaUsada: "PD/528" },
      { codigo: "44980NA", busquedaUsada: "PD/528" },
      { codigo: "098800", busquedaUsada: "PD/528" },
    ],
    obtenerDetalle: async (code) => {
      if (code === "44980NA") throw new Error("Ficha no disponible");
      if (code === "44980ULT") return detail(code);
      return {
        code,
        subcategory: "LITTON",
        substitutes: [{ value: "13176", code: "LPR" }],
      };
    },
  });

  assert.equal(result.familias.length, 1);
  assert.deepEqual(result.familias[0].totales, { NEGOCIO: 31, DEPOSITO_GALPON: 9, total: 40 });
  assert.match(result.error, /098800: La ficha Litton.*no confirma/);
  assert.match(result.error, /44980NA: Ficha no disponible/);
});
