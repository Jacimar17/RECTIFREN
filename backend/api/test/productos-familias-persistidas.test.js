const test = require("node:test");
const assert = require("node:assert/strict");
const productosService = require("../src/services/productos");
const productosRepository = require("../src/repositories/productos");
const catalogoPastillas = require("../src/services/catalogo-pastillas");
const proveedoresService = require("../src/services/proveedores");

const ficha = {
  code: "44980NA",
  name: "Pastilla Toyota",
  brand: "LITTON",
  category: "PASTILLA DE FRENO",
  substitutes: [
    { code: "FRASLE", value: "PD/528" },
    { code: "LPR", value: "05P1379" },
  ],
};

test("busca la familia 528 con el archivo local sin catálogo MongoDB ni Litton", async () => {
  const direct = productosRepository.buscarDirectos;
  const inventory = productosRepository.listarInventarioParaFamilias;
  const fetchOriginal = global.fetch;
  const flag = process.env.FAMILIAS_HABILITADAS;
  const catalogFlag = process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS;
  const productos = [
    { _id: "frasle", codigo: "PD/528", marca: "FRASLE", stock: 3, ubicacion: "NEGOCIO" },
    { _id: "lpr", codigo: "05P1379", marca: "LPR", stock: 2, ubicacion: "DEPOSITO_GALPON" },
    { _id: "lpr-prefijo", codigo: "LPR05P1379", marca: "LPR", stock: 10, ubicacion: "DEPOSITO_GALPON" },
  ];
  process.env.FAMILIAS_HABILITADAS = "false";
  process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS = "true";
  productosRepository.buscarDirectos = async (regex) => productos.filter(p => regex.test(p.codigo));
  productosRepository.listarInventarioParaFamilias = async () => productos;
  global.fetch = async () => { throw new Error("No debe consultar Litton"); };
  try {
    for (const codigo of ["528", "PD/528", "05P1379", "LPR05P1379"]) {
      const resultado = await productosService.buscar(codigo);
      assert.match(resultado.catalogoVersion, /^local-[a-f0-9]{64}$/);
      assert.equal(resultado.familiasError, undefined);
      assert.equal(resultado.familias.length, 1);
      assert.deepEqual(resultado.familias[0].totales, { NEGOCIO: 3, DEPOSITO_GALPON: 12, total: 15 });
      assert.deepEqual(new Set(resultado.familias[0].filas.map(f => f._id)), new Set(["frasle", "lpr", "lpr-prefijo"]));
    }
  } finally {
    productosRepository.buscarDirectos = direct;
    productosRepository.listarInventarioParaFamilias = inventory;
    global.fetch = fetchOriginal;
    if (flag === undefined) delete process.env.FAMILIAS_HABILITADAS;
    else process.env.FAMILIAS_HABILITADAS = flag;
    if (catalogFlag === undefined) delete process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS;
    else process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS = catalogFlag;
  }
});

test("family searches use the active persisted catalog without live web calls or changing direct data", async () => {
  const originals = {
    direct: productosRepository.buscarDirectos,
    inventory: productosRepository.listarInventarioParaFamilias,
    catalog: catalogoPastillas.obtenerCatalogoLocal,
    fetch: global.fetch,
    flag: process.env.FAMILIAS_HABILITADAS,
  };
  let webCalls = 0;
  process.env.FAMILIAS_HABILITADAS = "false";
  global.fetch = async () => { webCalls++; throw new Error("unexpected web request"); };
  productosRepository.buscarDirectos = async (_regex, _limit, options) => {
    assert.deepEqual(options, { incluirFamilias: true });
    return [{
      _id: "direct", codigo: "PD/528", marca: "FRASLE", stock: 3, ubicacion: "NEGOCIO",
      equivalentesVinculados: ["linked"],
    }];
  };
  productosRepository.listarInventarioParaFamilias = async () => [
    {
      _id: "direct", codigo: "PD/528", marca: "FRASLE", stock: 3, ubicacion: "NEGOCIO",
      equivalentesVinculados: ["linked"],
    },
    { _id: "linked", codigo: "RF-528", marca: "LPR", stock: 2, equivalentesVinculados: ["direct"] },
  ];
  catalogoPastillas.obtenerCatalogoLocal = async () => ({ version: "v1", fichas: [ficha] });

  try {
    const result = await productosService.buscar("PD/528");
    assert.equal(result.catalogoVersion, "v1");
    assert.deepEqual(result.data.map((item) => item._id), ["direct", "linked"]);
    assert.deepEqual(new Set(result.matchedIds), new Set(["direct", "linked"]));
    assert.deepEqual(result.familias[0].filas.map((item) => item._id), ["linked", "direct"].sort());
    assert.equal(webCalls, 0);
  } finally {
    productosRepository.buscarDirectos = originals.direct;
    productosRepository.listarInventarioParaFamilias = originals.inventory;
    catalogoPastillas.obtenerCatalogoLocal = originals.catalog;
    global.fetch = originals.fetch;
    if (originals.flag === undefined) delete process.env.FAMILIAS_HABILITADAS;
    else process.env.FAMILIAS_HABILITADAS = originals.flag;
  }
});

test("family lookup failures return a safe message and log only sanitized error metadata", async () => {
  const originalDirect = productosRepository.buscarDirectos;
  const originalCatalog = catalogoPastillas.obtenerCatalogoLocal;
  const originalLog = console.error;
  const logged = [];
  productosRepository.buscarDirectos = async () => [
    { _id: "direct", codigo: "PD/528", marca: "FRASLE", stock: 3 },
  ];
  catalogoPastillas.obtenerCatalogoLocal = async () => {
    throw new Error("mongodb+srv://operator:secret@host.example/db");
  };
  console.error = (...args) => logged.push(args);

  try {
    const result = await productosService.buscar("PD/528");
    assert.equal(result.data[0].codigo, "PD/528");
    assert.match(result.familiasError, /no se pudo cargar la familia/i);
    assert.doesNotMatch(result.familiasError, /secret|mongodb\+srv/i);
    assert.equal(logged.length, 1);
    assert.equal(JSON.stringify(logged).includes("secret"), false);
    assert.deepEqual(logged[0][1], { name: "Error" });
  } finally {
    productosRepository.buscarDirectos = originalDirect;
    catalogoPastillas.obtenerCatalogoLocal = originalCatalog;
    console.error = originalLog;
  }
});

test("legacy non-pad families remain available only under the original flag without joining pad or unknown categories", async () => {
  const flag = process.env.FAMILIAS_HABILITADAS;
  const persisted = process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS;
  const originalDirect = productosRepository.buscarDirectos;
  const originalInventory = productosRepository.listarInventarioParaFamilias;
  const originalCatalog = catalogoPastillas.obtenerCatalogoLocal;
  const originalFetch = global.fetch;
  const inventory = [
    { _id: "hose", codigo: "FLEX1", marca: "A", categoria: "Flexibles", stock: 2, ubicacion: "NEGOCIO", equivalencias: "FLEX2", equivalentesVinculados: ["pad", "unknown"] },
    { _id: "hose2", codigo: "FLEX2", marca: "B", categoria: "Flexibles", stock: 1, ubicacion: "DEPOSITO_GALPON" },
    { _id: "pad", codigo: "FLEX2", marca: "C", categoria: "Pastillas de freno", stock: 9 },
    { _id: "unknown", codigo: "FLEX2", marca: "D", stock: 4 },
  ];
  process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS = "true";
  productosRepository.buscarDirectos = async () => [inventory[0]];
  productosRepository.listarInventarioParaFamilias = async () => inventory;
  catalogoPastillas.obtenerCatalogoLocal = async () => ({ version: "v1", fichas: [ficha] });
  global.fetch = async () => { throw new Error("unexpected web request"); };
  try {
    process.env.FAMILIAS_HABILITADAS = "true";
    const enabled = await productosService.buscar("FLEX1");
    assert.deepEqual(enabled.familias[0].filas.map((row) => row._id), ["hose", "hose2"]);
    assert.deepEqual(enabled.data.map((row) => row._id), ["hose", "hose2"]);
    process.env.FAMILIAS_HABILITADAS = "false";
    const disabled = await productosService.buscar("FLEX1");
    assert.deepEqual(disabled.familias, []);
    assert.deepEqual(disabled.data.map((row) => row._id), ["hose"]);
    process.env.FAMILIAS_HABILITADAS = "true";
    process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS = "false";
    const noCatalog = await productosService.buscar("FLEX1");
    assert.deepEqual(noCatalog.familias[0].filas.map((row) => row._id), ["hose", "hose2"]);
  } finally {
    productosRepository.buscarDirectos = originalDirect;
    productosRepository.listarInventarioParaFamilias = originalInventory;
    catalogoPastillas.obtenerCatalogoLocal = originalCatalog;
    global.fetch = originalFetch;
    if (flag === undefined) delete process.env.FAMILIAS_HABILITADAS;
    else process.env.FAMILIAS_HABILITADAS = flag;
    if (persisted === undefined) delete process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS;
    else process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS = persisted;
  }
});

test("family detail uses persisted fiche data while preserving the supplier-offer response contract", async () => {
  const originalCatalog = catalogoPastillas.obtenerCatalogoLocal;
  const originalFetch = global.fetch;
  const originalFamiliesFlag = process.env.FAMILIAS_HABILITADAS;
  const calls = [];
  process.env.FAMILIAS_HABILITADAS = "true";
  global.fetch = async () => { throw new Error("Litton must not be queried for family details"); };
  catalogoPastillas.obtenerCatalogoLocal = async () => ({
    version: "v2",
    fichas: [ficha],
  });

  try {
    const result = await proveedoresService.buscarDetalleFamilia("PD/528", {
      proveedores: [{
        id: "stub",
        nombre: "Stub",
        buscar: async (codigo, marca) => {
          calls.push([codigo, marca]);
          return [];
        },
      }],
    });
    assert.equal(result.codigo, "44980NA");
    assert.equal(result.familia.nombre, ficha.name);
    assert.ok(result.equivalencias.some((item) => item.codigo === "PD/528"));
    assert.deepEqual(result.proveedores, [{ id: "stub", nombre: "Stub" }]);
    assert.deepEqual(result.data.stub, []);
    assert.deepEqual(calls.map(([codigo]) => codigo).sort(), ["05P1379", "44980NA", "PD/528"]);
  } finally {
    catalogoPastillas.obtenerCatalogoLocal = originalCatalog;
    global.fetch = originalFetch;
    if (originalFamiliesFlag === undefined) delete process.env.FAMILIAS_HABILITADAS;
    else process.env.FAMILIAS_HABILITADAS = originalFamiliesFlag;
  }
});
