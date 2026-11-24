const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const crearApp = require("../src/app");
const productosService = require("../src/services/productos");
const productosRepository = require("../src/repositories/productos");
const proveedoresService = require("../src/services/proveedores");

test("la búsqueda directa no expande familias ni consulta Litton", async () => {
  const previous = process.env.FAMILIAS_HABILITADAS;
  delete process.env.FAMILIAS_HABILITADAS;
  const original = productosRepository.buscarDirectos;
  productosRepository.buscarDirectos = async (regex, limit, options) => {
    assert.equal(regex.test("PD/528"), true);
    assert.deepEqual(options, { incluirFamilias: false });
    return [{ _id: "1", codigo: "PD/528", marca: "FRASLE", stock: 3, ubicacion: "NEGOCIO" }];
  };
  try {
    const result = await productosService.buscar("PD/528");
    assert.deepEqual(result.familias, []);
    assert.equal(result.familiasDeshabilitadas, true);
    assert.equal(result.data[0].codigo, "PD/528");
    assert.equal(result.data[0].stock, 3);
    assert.deepEqual(result.matchedIds, ["1"]);
  } finally {
    productosRepository.buscarDirectos = original;
    if (previous === undefined) delete process.env.FAMILIAS_HABILITADAS;
    else process.env.FAMILIAS_HABILITADAS = previous;
  }
});

test("el filtro directo no busca en campos de equivalencias cuando están deshabilitadas", () => {
  const query = productosRepository.buscarDirectos(/528/i, 100, { incluirFamilias: false });
  const fields = query.getFilter().$or.flatMap((condition) => Object.keys(condition));
  assert.ok(fields.includes("codigo"));
  assert.ok(!fields.includes("equivalencias"));
  assert.ok(!fields.includes("equivalenciasCatalogo.codigo"));
  assert.ok(!fields.includes("fichaLitton.substitutes.value"));
});

test("las rutas de equivalencias rechazan acceso sin borrar los vínculos", async () => {
  const previousFlag = process.env.FAMILIAS_HABILITADAS;
  const previousSecret = process.env.JWT_SECRET;
  const previousBeta = process.env.BETA_PROVEEDORES;
  delete process.env.FAMILIAS_HABILITADAS;
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
    assert.match((await detail.json()).error, /deshabilitadas temporalmente/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousFlag === undefined) delete process.env.FAMILIAS_HABILITADAS;
    else process.env.FAMILIAS_HABILITADAS = previousFlag;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousBeta === undefined) delete process.env.BETA_PROVEEDORES;
    else process.env.BETA_PROVEEDORES = previousBeta;
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
