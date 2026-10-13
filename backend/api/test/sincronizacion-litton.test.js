const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sincronizarFamiliasLitton,
} = require("../src/proveedores/sincronizacion-litton");
const {
  resolverFamiliaInventario,
} = require("../src/proveedores/familia-inventario");

const products = [
  { _id: "rf-litton", codigo: "RF-528", marca: "LITTON", stock: 17, ubicacion: "NEGOCIO" },
  { _id: "rf-lpr", codigo: "RF-528", marca: "LPR", stock: 14, ubicacion: "NEGOCIO" },
  {
    _id: "trw-linked",
    codigo: "TRW09460",
    marca: "TRW",
    stock: 9,
    ubicacion: "DEPOSITO_GALPON",
    equivalencias: "PD/528",
  },
  { _id: "false-positive", codigo: "13176", marca: "LPR", stock: 99, ubicacion: "NEGOCIO" },
];

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

test("imports official Litton aliases and totals only verified/manual family links", async () => {
  const searches = [];
  const result = await sincronizarFamiliasLitton(products, {
    buscarLitton: async (code) => {
      searches.push(code);
      return [{ codigo: "44980ULT" }, { codigo: "44980NA" }];
    },
    obtenerDetalle: async (code) => detail(code),
  });

  assert.deepEqual(searches, ["PD/528"]);
  assert.equal(result.summary.familiasLitton, 1);
  assert.equal(result.summary.codigosRFEncontrados, 1);
  assert.equal(result.equivalenciasPorId.get("rf-litton").some((item) => item.codigo === "05P1379"), true);
  assert.equal(result.equivalenciasPorId.has("trw-linked"), false);
  assert.equal(result.equivalenciasPorId.has("false-positive"), false);

  const inventory = products.map((product) => ({
    ...product,
    equivalenciasCatalogo: result.equivalenciasPorId.get(String(product._id)) || [],
  }));
  const family = resolverFamiliaInventario(inventory, ["44980NA"]);
  assert.deepEqual(family.filas.map((item) => item._id).sort(), ["rf-litton", "rf-lpr", "trw-linked"]);
  assert.deepEqual(family.totales, { NEGOCIO: 31, DEPOSITO_GALPON: 9, total: 40 });
});

test("does not assign aliases when any Litton detail needed for the family fails", async () => {
  const result = await sincronizarFamiliasLitton(products, {
    buscarLitton: async () => [{ codigo: "44980ULT" }, { codigo: "44980NA" }],
    obtenerDetalle: async (code) => {
      if (code === "44980NA") throw new Error("Litton no disponible");
      return detail(code);
    },
  });

  assert.equal(result.summary.errores, 1);
  assert.equal(result.summary.codigosRFEncontrados, 0);
  assert.equal(result.equivalenciasPorId.has("rf-litton"), false);
});

test("does not guess an inventory alias from a matching numeric suffix", async () => {
  const product = { _id: "trw", codigo: "TRW09460", marca: "TRW", stock: 2 };
  const result = await sincronizarFamiliasLitton([...products, product], {
    buscarLitton: async () => [{ codigo: "44980ULT" }],
    obtenerDetalle: async () => detail("44980ULT"),
  });

  assert.equal(result.equivalenciasPorId.has("trw"), false);
});
