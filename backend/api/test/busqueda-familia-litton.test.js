const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buscarFamiliaLitton,
  coincideEquivalencia,
} = require("../src/proveedores/busqueda-familia-litton");
const buscarAimar = require("../src/proveedores/aimar");
const buscarAtonor = require("../src/proveedores/atonor");
const normalizarCodigo = require("../src/proveedores/normalizar-codigo");

const detail = {
  code: "44980NA",
  name: "Pastilla Toyota Hilux",
  subcategory: "LITTON",
  category: "Pastillas de freno",
  substitutes: [
    { value: "PD/528", code: "FRASLE" },
    { value: "05P1379", code: "LPR" },
    { value: "3176", code: "LPR" },
    { value: "RCPT09460", code: "TRW - BRASIL" },
  ],
};

test("queries Aimar and ATONOR for each unique Litton family code and unifies exact matches", async () => {
  const queried = { Aimar: [], ATONOR: [] };
  const result = await buscarFamiliaLitton("44980NA", {
    obtenerDetalleLitton: async (code) => {
      assert.equal(code, "44980NA");
      return detail;
    },
    buscarAimar: async (code) => {
      queried.Aimar.push(code);
      if (code === "05P1379") {
        return [
          { codigo: "LPR528", marca: "LPR", equivalencias: ["05P1379"] },
          { codigo: "13176", marca: "LPR" },
        ];
      }
      return [];
    },
    buscarAtonor: async (code) => {
      queried.ATONOR.push(code);
      if (code === "PD/528") {
        return [{ codigo: "PD-528", marca: "ATONOR" }];
      }
      return [];
    },
    concurrency: 2,
  });

  assert.deepEqual(queried.Aimar.sort(), ["05P1379", "3176", "44980NA", "PD/528", "RCPT09460"].sort());
  assert.deepEqual(queried.ATONOR.sort(), ["05P1379", "3176", "44980NA", "PD/528", "RCPT09460"].sort());
  assert.deepEqual(result.equivalencias.map((item) => item.codigo), [
    "44980NA", "PD/528", "05P1379", "3176", "RCPT09460",
  ]);
  assert.equal(result.familia.nombre, "Pastilla Toyota Hilux");
  assert.deepEqual(result.data.aimar, [
    { codigo: "LPR528", marca: "LPR", equivalencias: ["05P1379"], codigoConsultado: "05P1379" },
  ]);
  assert.deepEqual(result.data.atonor, [
    { codigo: "PD-528", marca: "ATONOR", codigoConsultado: "PD/528" },
  ]);
  assert.deepEqual(result.errores, []);
});

test("keeps partial supplier results and reports provider errors per equivalence", async () => {
  const result = await buscarFamiliaLitton("44980NA", {
    obtenerDetalleLitton: async () => ({
      code: "44980NA",
      substitutes: [{ value: "PD/528", code: "FRASLE" }],
    }),
    buscarAimar: async (code) => {
      if (code === "PD/528") throw new Error("Aimar no disponible");
      return [];
    },
    buscarAtonor: async () => [{ codigo: "PD528", marca: "ATONOR" }],
  });

  assert.deepEqual(result.data.aimar, []);
  assert.deepEqual(result.data.atonor.map((item) => item.codigo), ["PD528"]);
  assert.deepEqual(result.errores, [{
    proveedor: "Aimar",
    error: "PD/528: Aimar no disponible",
  }]);
});

test("rejects an invalid Litton detail before searching other providers", async () => {
  let supplierQueries = 0;
  await assert.rejects(
    buscarFamiliaLitton("44980NA", {
      obtenerDetalleLitton: async () => ({ code: "OTHER" }),
      buscarAimar: async () => { supplierQueries++; return []; },
      buscarAtonor: async () => { supplierQueries++; return []; },
    }),
    /devolvió otro código/
  );
  assert.equal(supplierQueries, 0);
});

test("Aimar continues past a numeric-prefix page until it finds the exact family code", async () => {
  const searches = [];
  const results = await buscarAimar.buscarCoincidencia("05P1379", async (term) => {
    searches.push(term);
    if (term === "05") return [{ codigo: "105999", marca: "LPR" }];
    if (term === "05P1379") return [{ codigo: "LPR-1379", equivalencias: ["05P1379"] }];
    return [];
  });

  assert.deepEqual(searches, ["05", "05P1379"]);
  assert.deepEqual(results, [{
    codigo: "LPR-1379",
    equivalencias: ["05P1379"],
  }]);
});

test("normalizes punctuation and separators while requiring complete code equality", () => {
  assert.equal(normalizarCodigo(" 0988 00 "), "098800");
  assert.equal(normalizarCodigo("HQ-2227A"), "HQ2227A");
  assert.equal(normalizarCodigo("N. 1375"), "N1375");
  assert.equal(normalizarCodigo("PD/528"), normalizarCodigo("PD-528"));
  assert.equal(buscarAtonor.coincide("0988 00", "098800"), true);
  assert.equal(buscarAtonor.coincide("HQ2227A", "HQ-2227A"), true);
  assert.equal(buscarAtonor.coincide("PD528", "PD/528"), true);
  assert.equal(buscarAtonor.coincide("13176", "3176"), false);
  assert.equal(buscarAtonor.coincide("HQ-2227A1", "HQ2227A"), false);
  assert.equal(coincideEquivalencia({ codigo: "HQ.2227A" }, "HQ-2227A"), true);
  assert.equal(coincideEquivalencia({ codigo: "13176" }, "3176"), false);
  assert.equal(coincideEquivalencia({ codigo: "OTHER", equivalencias: ["0988.00"] }, "0988 00"), true);
});

test("searches compact and original ATONOR terms until the exact normalized code matches", async () => {
  const terms = [];
  const result = await buscarAtonor.buscarCoincidencia("0988 00", async (term) => {
    terms.push(term);
    if (term === "098800") return [{ codigo: "1098800", marca: "Otro repuesto" }];
    if (term === "0988 00") return [
      { codigo: "0988-00", marca: "Correcto" },
      { codigo: "0988 007", marca: "Código parcial" },
    ];
    return [];
  });

  assert.deepEqual(terms, ["098800", "0988 00"]);
  assert.deepEqual(result, [{ codigo: "0988-00", marca: "Correcto" }]);
});

test("generates compact and source-form ATONOR search terms without numeric-prefix guesses", () => {
  assert.deepEqual(buscarAtonor.terminos("0988 00"), ["098800", "0988 00"]);
  assert.deepEqual(buscarAtonor.terminos("HQ-2227A"), ["HQ2227A", "HQ-2227A"]);
  assert.deepEqual(buscarAtonor.terminos("PD/528"), ["PD528", "PD/528"]);
});
