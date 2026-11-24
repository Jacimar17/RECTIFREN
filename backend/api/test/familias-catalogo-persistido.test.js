const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  crearIndiceCatalogo,
  resolverGrupoCatalogo,
  resolverFamiliasCatalogo,
} = require("../src/proveedores/familias-catalogo-persistido");

const ficha = (code) => ({
  code,
  name: "Pastilla Toyota Hilux",
  brand: "LITTON",
  category: "PASTILLA DE FRENO",
  substitutes: [
    { code: "FRASLE", value: "PD/528" },
    { code: "LPR", value: "05P1379" },
  ],
});

const catalogo = [ficha("44980NA"), ficha("44980ULT")];

test("resolves exact catalog codes, previous-code aliases, manual links and v2 variants", () => {
  const productos = [
    {
      _id: "legacy",
      codigo: "RF-528",
      marca: "FRASLE",
      codigosAnteriores: ["RF528-OLD"],
      equivalenciasCatalogo: [{ codigo: "PD/528", marca: "FRASLE", productoLitton: "44980NA" }],
      stock: 4,
      equivalentesVinculados: ["linked"],
    },
    {
      _id: "linked",
      codigo: "SH-1",
      marca: "SHUNKO",
      equivalencias: "05P1379",
      stock: 1,
      ubicacion: "NEGOCIO",
    },
    {
      _id: "canonical",
      schemaVersion: 2,
      codigo: "44980ULT",
      marca: "LITTON",
      fichaLitton: { code: "44980ULT" },
      equivalenciasCatalogo: [{ codigo: "05P1379", marca: "LPR", productoLitton: "44980ULT" }],
      variantes: [
        { marca: "LPR", ubicacion: "DEPOSITO_GALPON", cantidad: 2 },
        { marca: "FRASLE", ubicacion: "NEGOCIO", cantidad: 0 },
      ],
    },
    { _id: "partial", codigo: "105P1379", marca: "LPR", stock: 99 },
    { _id: "unconfirmed", codigo: "OTHER", marca: "OTRA", equivalencias: "PD/528", stock: 55 },
  ];

  for (const query of ["RF528-OLD", "PD/528", "05P1379"]) {
    const [family] = resolverFamiliasCatalogo(query, productos, catalogo);
    assert.ok(family, `expected a family for ${query}`);
    assert.deepEqual(new Set(family.filas.map((row) => row._id)), new Set(["legacy", "linked", "canonical"]));
    assert.equal(family.filas.find((row) => row._id === "legacy").ubicacion, undefined);
    assert.deepEqual(
      family.filas.filter((row) => row._id === "canonical").map(({ marca, stock, ubicacion }) => [marca, stock, ubicacion]),
      [["FRASLE", 0, "NEGOCIO"], ["LPR", 2, "DEPOSITO_GALPON"]]
    );
    assert.equal(family.filas.some((row) => row._id === "partial" || row._id === "unconfirmed"), false);
    assert.equal(family.totales.SIN_UBICACION, 4);
    assert.equal(family.totales.NEGOCIO, 1);
    assert.equal(family.totales.DEPOSITO_GALPON, 2);
    assert.equal(family.totales.total, 7);
  }
});

test("does not resolve partial or ambiguous catalog codes into a mixed family", () => {
  const ambiguous = [
    ficha("44980NA"),
    {
      ...ficha("OTHER"),
      name: "Pastilla distinta",
      substitutes: [
        { code: "FRASLE", value: "PD/528" },
        { code: "CORVEN", value: "3PF9999" },
      ],
    },
  ];
  assert.deepEqual(resolverFamiliasCatalogo("PD/528", [], ambiguous), []);
  assert.deepEqual(resolverFamiliasCatalogo("05P137", [], catalogo), []);
});

test("vincula el código oficial TRW sin unir productos de otra marca", () => {
  const fichas = [{ ...ficha("44980NA"), substitutes: [
    { code: "FRASLE", value: "PD/528" },
    { code: "TRW - BRASIL", value: "RCPT09460" },
  ] }];
  const inventario = [
    { _id: "trw", codigo: "RCPT09460", marca: "TRW", stock: 3, ubicacion: "NEGOCIO" },
    { _id: "otra", codigo: "RCPT09460", marca: "OTRA", stock: 5, ubicacion: "DEPOSITO_GALPON" },
  ];
  const [familia] = resolverFamiliasCatalogo("PD/528", inventario, fichas);
  assert.deepEqual(familia.filas.map((fila) => fila._id), ["trw"]);
  assert.equal(familia.totales.NEGOCIO, 3);
  assert.equal(familia.totales.DEPOSITO_GALPON, 0);
});

test("reconoce códigos ULT de Ultraliton y códigos NA de Liton sin intercambiarlos", () => {
  const productos = [
    { _id: "ultra", codigo: "44980ULT", marca: "Ultra Litton", stock: 3, ubicacion: "NEGOCIO" },
    { _id: "liton", codigo: "44980NA", marca: "Liton", stock: 4, ubicacion: "DEPOSITO_GALPON" },
    { _id: "incorrecto", codigo: "44980NA", marca: "Ultraliton", stock: 8, ubicacion: "NEGOCIO" },
  ];
  const [familia] = resolverFamiliasCatalogo("PD/528", productos, catalogo);
  assert.deepEqual(new Set(familia.filas.map((fila) => fila._id)), new Set(["ultra", "liton"]));
  assert.equal(familia.totales.NEGOCIO, 3);
  assert.equal(familia.totales.DEPOSITO_GALPON, 4);
});

test("does not invent locations for invalid or pending legacy records", () => {
  const productos = [
    { _id: "invalid", codigo: "PD/528", marca: "OTHER", stock: 2, ubicacion: "RECEPCION" },
    {
      _id: "pending",
      codigo: "PD/528",
      marca: "LPR",
      stock: 3,
      ubicacion: "NEGOCIO",
      ubicacionPendiente: true,
    },
  ];
  const [family] = resolverFamiliasCatalogo("PD/528", productos, catalogo);
  assert.ok(family);
  assert.deepEqual(family.filas.map((row) => row.ubicacion), [undefined, undefined]);
  assert.equal(family.totales.SIN_UBICACION, 5);
  assert.equal(family.totales.NEGOCIO, 0);
  assert.equal(family.totales.DEPOSITO_GALPON, 0);
});

test("the checked-in catalog's dash placeholders are never indexed as aliases", () => {
  const actual = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../litton-pastillas.json"), "utf8"));
  const dashPlaceholders = actual.flatMap((item) => item.substitutes || [])
    .filter((item) => item.value === "-");
  const blankPlaceholders = actual.flatMap((item) => item.substitutes || [])
    .filter((item) => typeof item.value === "string" && item.value.trim() === "");
  assert.ok(dashPlaceholders.length > 0);

  const indice = crearIndiceCatalogo(actual);
  const grupo528 = resolverGrupoCatalogo("PD/528", actual);
  assert.ok(grupo528);
  assert.deepEqual(new Set(grupo528.fichas.map((item) => item.code)), new Set(["098800", "44980NA", "44980ULT"]));
  assert.equal(indice.porCodigo.has(""), false);
  assert.equal(indice.porCodigo.has("-"), false);
  assert.deepEqual(resolverFamiliasCatalogo("-", [], actual), []);
  assert.deepEqual(resolverFamiliasCatalogo("\r", [], actual), []);
  const inventario528 = [
    {
      _id: "frasle-negocio",
      codigo: "PD/528",
      marca: "FRASLE",
      stock: 3,
      ubicacion: "NEGOCIO",
    },
    {
      _id: "lpr-deposito",
      codigo: "05P1379",
      marca: "LPR",
      stock: 2,
      ubicacion: "DEPOSITO_GALPON",
    },
    {
      _id: "lpr-legacy-pd",
      codigo: "PD/528",
      marca: "LPR",
      stock: 1,
      ubicacion: "DEPOSITO_GALPON",
    },
  ];
  for (const codigo of ["528", "PD/528", "05P1379"]) {
    const familias = resolverFamiliasCatalogo(codigo, inventario528, actual);
    assert.equal(familias.length, 1, `expected one unambiguous family for ${codigo}`);
    const [familia] = familias;
    assert.deepEqual(familia.filas.map(({ codigo, marca, ubicacion }) => `${codigo}|${marca}|${ubicacion}`).sort(), [
      "05P1379|LPR|DEPOSITO_GALPON",
      "PD/528|FRASLE|NEGOCIO",
      "PD/528|LPR|DEPOSITO_GALPON",
    ]);
    assert.equal(new Set(familia.filas.map((row) => row._id)).size, 3);
    assert.deepEqual(familia.totales, { NEGOCIO: 3, DEPOSITO_GALPON: 3, total: 6 });
    assert.ok(familia.equivalenciasCatalogo.some((item) => item.codigo === "05P1379"));
  }
  assert.deepEqual(resolverFamiliasCatalogo("LPR05P1379", inventario528, actual), []);
  assert.deepEqual(resolverFamiliasCatalogo("24466 24467", [], actual), []);

  assert.ok(blankPlaceholders.length > 0);
  const soloMarcador = [{ ...ficha("x"), substitutes: [
    { code: "TRW", value: "-" },
    { code: "ECOPADS", value: "\r" },
  ] }];
  assert.equal(crearIndiceCatalogo(soloMarcador).porCodigo.has(""), false);
  assert.deepEqual(resolverFamiliasCatalogo("-", [], soloMarcador), []);
  assert.deepEqual(resolverFamiliasCatalogo("\r", [], soloMarcador), []);
});

test("reconoce prefijos de marca y abreviaturas TRW exactas sin mezclar otras marcas", () => {
  const fichas = [
    { ...ficha("LIT1"), substitutes: [
      { code: "FRASLE", value: "PD/528" },
      { code: "LPR", value: "05P1379" },
      { code: "TRW - BRASIL", value: "RCPT02130" },
    ] },
  ];
  const inventario = [
    { _id: "lpr", codigo: "LPR05P1379", marca: "LPR", stock: 10, ubicacion: "DEPOSITO_GALPON" },
    { _id: "trw", codigo: "TRW02130", marca: "TRW", stock: 6, ubicacion: "DEPOSITO_GALPON" },
    { _id: "otra-marca", codigo: "LPR05P1379", marca: "TRW", stock: 99, ubicacion: "NEGOCIO" },
    { _id: "parcial", codigo: "LPR05P137", marca: "LPR", stock: 99, ubicacion: "NEGOCIO" },
    { _id: "trw-parcial", codigo: "TRW0213", marca: "TRW", stock: 99, ubicacion: "NEGOCIO" },
  ];
  for (const codigo of ["PD/528", "LPR05P1379", "TRW02130"]) {
    const [familia] = resolverFamiliasCatalogo(codigo, inventario, fichas);
    assert.ok(familia);
    assert.deepEqual(new Set(familia.filas.map(f => f._id)), new Set(["lpr", "trw"]));
    assert.deepEqual(familia.totales, { NEGOCIO: 0, DEPOSITO_GALPON: 16, total: 16 });
  }
});
