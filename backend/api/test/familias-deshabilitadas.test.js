const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const crearApp = require("../src/app");
const Producto = require("../src/models/Producto");
const productosService = require("../src/services/productos");
const productosRepository = require("../src/repositories/productos");
const proveedoresService = require("../src/services/proveedores");
const catalogoPastillas = require("../src/services/catalogo-pastillas");

test("la búsqueda directa conserva resultados si falta el catálogo local y no consulta Litton", async () => {
  const previous = process.env.FAMILIAS_HABILITADAS;
  delete process.env.FAMILIAS_HABILITADAS;
  const original = productosRepository.buscarDirectos;
  const catalogoOriginal = catalogoPastillas.obtenerCatalogoLocal;
  catalogoPastillas.obtenerCatalogoLocal = async () => { throw new Error("Archivo no disponible"); };
  productosRepository.buscarDirectos = async (regex, limit, options) => {
    assert.equal(regex.test("PD/528"), true);
    assert.deepEqual(options, { incluirFamilias: true });
    return [{ _id: "1", codigo: "PD/528", marca: "FRASLE", stock: 3, ubicacion: "NEGOCIO" }];
  };
  try {
    const result = await productosService.buscar("PD/528");
    assert.deepEqual(result.familias, []);
    assert.match(result.familiasError, /catálogo|MongoDB/i);
    assert.equal(result.data[0].codigo, "PD/528");
    assert.equal(result.data[0].stock, 3);
    assert.deepEqual(result.matchedIds, ["1"]);
  } finally {
    productosRepository.buscarDirectos = original;
    catalogoPastillas.obtenerCatalogoLocal = catalogoOriginal;
    if (previous === undefined) delete process.env.FAMILIAS_HABILITADAS;
    else process.env.FAMILIAS_HABILITADAS = previous;
  }
});

test("el filtro directo no busca en campos de equivalencias cuando están deshabilitadas", () => {
  const query = productosRepository.buscarDirectos(/528/i, 100, { incluirFamilias: false });
  const fields = query.getFilter().$or.flatMap((condition) => Object.keys(condition));
  assert.ok(fields.includes("codigo"));
  assert.ok(fields.includes("codigosAnteriores"));
  assert.ok(!fields.includes("equivalencias"));
  assert.ok(!fields.includes("equivalenciasCatalogo.codigo"));
  assert.ok(!fields.includes("fichaLitton.substitutes.value"));
});

test("los códigos anteriores se buscan para evitar altas duplicadas solo con la marca y ubicación indicadas", () => {
  const filtro = productosRepository.buscarPorCodigoMarca("PD/528", "LPR", "NEGOCIO").getFilter();
  assert.deepEqual(filtro.archivado, { $ne: true });
  assert.ok(filtro.$and[0].$or.some((opcion) =>
    opcion.codigosAnteriores === "PD/528" && opcion.marca === "LPR"));
  assert.ok(filtro.$and[0].$or.some((opcion) =>
    opcion.codigosAnteriores === "PD/528" && opcion.MARCA === "LPR"));
  assert.ok(filtro.$and[0].$or.some((opcion) =>
    opcion.schemaVersion === 2 && opcion.codigosAnteriores === "PD/528"));
  assert.deepEqual(filtro.$and[1].$or.find((opcion) => opcion.schemaVersion === 2).variantes.$elemMatch,
    { marca: "LPR", ubicacion: "NEGOCIO" });
  assert.ok(filtro.$and[1].$or.some((opcion) => opcion.ubicacion === "NEGOCIO"));
});

test("la búsqueda de candidatos también encuentra códigos anteriores", () => {
  const filtro = productosRepository.buscarCandidatos(/PD\/528/i).getFilter();
  const alias = filtro.$or.find((opcion) => opcion.codigosAnteriores);
  assert.ok(alias.codigosAnteriores.test("PD/528"));
  assert.deepEqual(filtro.archivado, { $ne: true });
});

test("el catálogo público puede encontrar un producto por su código anterior", async () => {
  const contar = Producto.countDocuments;
  const buscar = Producto.find;
  let filtro;
  Producto.countDocuments = async (value) => { filtro = value; return 0; };
  Producto.find = () => ({
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    async lean() { return []; },
  });
  try {
    await productosRepository.buscarCatalogoPublico({ query: "PD/528" });
    const alias = filtro.$and[1].$or.find((opcion) => opcion.codigosAnteriores);
    assert.ok(alias.codigosAnteriores.test("PD/528"));
    assert.ok(!alias.codigosAnteriores.test("PD/529"));
  } finally {
    Producto.countDocuments = contar;
    Producto.find = buscar;
  }
});

test("las rutas de equivalencias rechazan acceso sin borrar los vínculos", async () => {
  const previousFlag = process.env.FAMILIAS_HABILITADAS;
  const previousPersistedFamilies = process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS;
  const previousSecret = process.env.JWT_SECRET;
  const previousBeta = process.env.BETA_PROVEEDORES;
  const originalDetail = proveedoresService.buscarDetalleFamilia;
  let detailCalls = 0;
  proveedoresService.buscarDetalleFamilia = async () => { detailCalls++; throw new Error("unexpected call"); };
  delete process.env.FAMILIAS_HABILITADAS;
  process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS = "false";
  process.env.JWT_SECRET = "test-secret";
  process.env.BETA_PROVEEDORES = "true";
  const server = crearApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const token = jwt.sign({ admin: true }, process.env.JWT_SECRET);
    const base = `http://127.0.0.1:${server.address().port}/api/equivalencias`;
    for (const [path, method] of [["/search?q=PD", "GET"], ["/123/vincular", "POST"], ["/123/desvincular", "DELETE"]]) {
      const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /deshabilitadas temporalmente/);
    }
    const detail = await fetch(`http://127.0.0.1:${server.address().port}/api/proveedores/detalle`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: "PD/528" }),
    });
    assert.equal(detail.status, 503);
    assert.match((await detail.json()).error, /catálogo persistido.*deshabilitada/i);
    process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS = "true";
    const disabledOffers = await fetch(`http://127.0.0.1:${server.address().port}/api/proveedores/detalle`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: "PD/528" }),
    });
    assert.equal(disabledOffers.status, 503);
    assert.match((await disabledOffers.json()).error, /proveedores.*deshabilitada/i);
    assert.equal(detailCalls, 0);
  } finally {
    proveedoresService.buscarDetalleFamilia = originalDetail;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousFlag === undefined) delete process.env.FAMILIAS_HABILITADAS;
    else process.env.FAMILIAS_HABILITADAS = previousFlag;
    if (previousPersistedFamilies === undefined) delete process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS;
    else process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS = previousPersistedFamilies;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousBeta === undefined) delete process.env.BETA_PROVEEDORES;
    else process.env.BETA_PROVEEDORES = previousBeta;
  }
});

test("el servicio no consulta catálogo ni proveedores cuando las ofertas están deshabilitadas", async () => {
  const flag = process.env.FAMILIAS_HABILITADAS;
  const persisted = process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS;
  const catalogo = require("../src/services/catalogo-pastillas");
  const original = catalogo.obtenerCatalogoLocal;
  let calls = 0;
  process.env.FAMILIAS_HABILITADAS = "false";
  process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS = "true";
  catalogo.obtenerCatalogoLocal = async () => { calls++; throw new Error("unexpected"); };
  try {
    await assert.rejects(proveedoresService.buscarDetalleFamilia("PD/528", {
      proveedores: [{ id: "stub", nombre: "Stub", buscar: async () => { calls++; return []; } }],
    }), /proveedores.*deshabilitada/i);
    assert.equal(calls, 0);
  } finally {
    catalogo.obtenerCatalogoLocal = original;
    if (flag === undefined) delete process.env.FAMILIAS_HABILITADAS;
    else process.env.FAMILIAS_HABILITADAS = flag;
    if (persisted === undefined) delete process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS;
    else process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS = persisted;
  }
});

test("detalle de familia informa si el archivo local no está disponible", async () => {
  const controller = require("../src/controllers/proveedores");
  const flag = process.env.FAMILIAS_HABILITADAS;
  const persisted = process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS;
  const beta = process.env.BETA_PROVEEDORES;
  const original = catalogoPastillas.obtenerCatalogoLocal;
  const log = console.error;
  const logged = [];
  process.env.FAMILIAS_HABILITADAS = "true";
  process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS = "true";
  process.env.BETA_PROVEEDORES = "true";
  catalogoPastillas.obtenerCatalogoLocal = async () => {
    throw new catalogoPastillas.CatalogoLocalError(new Error("detalle privado"));
  };
  console.error = (...args) => logged.push(args);
  try {
    await assert.rejects(controller.buscarDetalle({ body: { codigo: "PD/528" } }, {}), error =>
      error.status === 503 && /catálogo local/.test(error.message));
    assert.equal(JSON.stringify(logged).includes("detalle privado"), false);
  } finally {
    catalogoPastillas.obtenerCatalogoLocal = original;
    console.error = log;
    if (flag === undefined) delete process.env.FAMILIAS_HABILITADAS;
    else process.env.FAMILIAS_HABILITADAS = flag;
    if (persisted === undefined) delete process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS;
    else process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS = persisted;
    if (beta === undefined) delete process.env.BETA_PROVEEDORES;
    else process.env.BETA_PROVEEDORES = beta;
  }
});

test("la búsqueda por vehículo conserva Litton sin consultar familias ni proveedores", async () => {
  const previous = process.env.FAMILIAS_HABILITADAS;
  const originalFetch = global.fetch;
  delete process.env.FAMILIAS_HABILITADAS;
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    const search = new URL(url);
    assert.equal(search.searchParams.get("compatibilityBrand"), "TOYOTA");
    assert.equal(search.searchParams.get("compatibilityModel"), "COROLLA");
    return { ok: true, json: async () => ({
      results: [{ code: "50830ULT", name: "Pastilla", subcategory: "LITTON" }],
      pagination: { page: 1, total: 1 },
    }) };
  };
  try {
    const result = await proveedoresService.buscarPorVehiculoLitton({ marca: "TOYOTA", modelo: "COROLLA", page: 1 });
    assert.equal(calls, 1);
    assert.equal(result.familiasDeshabilitadas, true);
    assert.equal(result.data[0].codigo, "50830ULT");
    assert.equal(result.data[0].ofertas, undefined);
  } finally {
    global.fetch = originalFetch;
    if (previous === undefined) delete process.env.FAMILIAS_HABILITADAS;
    else process.env.FAMILIAS_HABILITADAS = previous;
  }
});
