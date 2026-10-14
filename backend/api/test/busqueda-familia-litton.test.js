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

test("queries the live-style ATONOR catalog and rejects partial or unsupported products", async () => {
  const terms = [];
  const producto = (id, name, sku, proveedor = "REMSA") => ({
    id,
    name,
    sku,
    attributes: [{ taxonomy: "pa_proveedor", terms: [{ name: proveedor }] }],
    prices: { price: "8734602", currency_minor_unit: 2 },
    is_in_stock: true,
  });
  const result = await buscarAtonor.buscarCoincidencia("0988 00", "REMSA", async (term) => {
    terms.push(term);
    if (term === "REMSA0988-00") return [
      producto(1, "REMSA0988-00", "REMSA0988", "LITTON"),
      producto(2, "REMSA0988-007", "REMSA0988-007"),
      producto(3, "REMSA0988-00", "REMSA0988", "MAZFREN"),
    ];
    return [];
  });

  assert.deepEqual(terms, ["REMSA0988-00"]);
  assert.equal(result.length, 1);
  assert.equal(result[0].codigo, "REMSA0988-00");
  assert.equal(result[0].marca, "REMSA");
  assert.equal(result[0].precio, 87346.02);
  assert.equal(result[0].stockDisponible, true);
});

test("builds the four exact ATONOR brand notations from Litton aliases", () => {
  assert.deepEqual(buscarAtonor.terminos("44980NA", "LITTON"), [
    "L4498-0-NA", "L4498-0-ULTRA", "44980NA",
  ]);
  assert.deepEqual(buscarAtonor.terminos("PD/528", "FRASLE"), [
    "PD-528", "PD/528", "PD528",
  ]);
  assert.deepEqual(buscarAtonor.terminos("05P1379", "LPR"), ["LPR05P1379", "05P1379"]);
  assert.deepEqual(buscarAtonor.terminos("0988 00", "REMSA"), [
    "REMSA0988-00", "0988 00", "098800",
  ]);
});

test("matches ATONOR suffixes and brand prefixes exactly, rejecting partial and unrelated products", () => {
  assert.equal(buscarAtonor.coincide("PD-528 S/A", "PD/528", "FRASLE"), true);
  assert.equal(buscarAtonor.coincide("L4498-0-NA", "44980NA", "LITTON"), true);
  assert.equal(buscarAtonor.coincide("L4498-0-ULTRA", "44980NA", "LITTON"), true);
  assert.equal(buscarAtonor.coincide("LPR05P1379", "05P1379", "LPR"), true);
  assert.equal(buscarAtonor.coincide("REMSA0988-00", "0988 00", "REMSA"), true);
  assert.equal(buscarAtonor.coincide("LPR105P1379", "05P1379", "LPR"), false);
  assert.equal(buscarAtonor.coincide("PD-528 S/A1", "PD/528", "FRASLE"), false);
});

test("maps live ATONOR catalog details including images, current price, description and measurements", () => {
  const item = buscarAtonor.mapear({
    name: "L4498-0-NA",
    sku: "L4498-0-NA",
    description: "<p>Past Toyota Hilux</p>",
    short_description: "<ul><li>LARGO: 134,5 MM</li><li>ALTURA: 77,1 MM</li><li>ESPESOR: 17 MM</li></ul>",
    prices: { price: "3828309", currency_minor_unit: 2 },
    images: [{ src: "https://atonor.com.ar/foto.jpg" }],
    permalink: "https://atonor.com.ar/producto/l4498-0-na/",
    is_in_stock: true,
    attributes: [{ taxonomy: "pa_proveedor", terms: [{ name: "LITTON" }] }],
  }, "44980NA");

  assert.equal(item.nombre, "Past Toyota Hilux");
  assert.equal(item.medidas, "Largo: 134,5 MM · Alto: 77,1 MM · Espesor: 17 MM");
  assert.equal(item.precio, 38283.09);
  assert.equal(item.stockDisponible, true);
  assert.equal(item.imagen, "https://atonor.com.ar/foto.jpg");
  assert.equal(item.link, "https://atonor.com.ar/producto/l4498-0-na/");
});
