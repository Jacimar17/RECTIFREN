const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buscarOfertasPorVehiculo,
  normalizarOferta,
} = require("../src/proveedores/busqueda-vehiculo-litton");

test("enriches each Litton vehicle candidate with supplier offers and preserves variants", async () => {
  const products = [
    { codigo: "44980NA", nombre: "Pastilla normal" },
    { codigo: "44980ULT", nombre: "Pastilla ultra" },
  ];
  const concurrencyCalls = [];
  const result = await buscarOfertasPorVehiculo({
    ok: true,
    query: { marca: "Toyota", modelo: "Hilux" },
    data: products,
    pagination: { page: 1, pages: 1 },
  }, async (code, options) => {
    concurrencyCalls.push(options.concurrency);
    return {
      equivalencias: [{ codigo: code, marca: "LITTON" }],
      data: { aimar: [{ codigo: `A-${code}`, precio: 1200 }], atonor: [] },
      errores: [],
    };
  });

  assert.equal(result.total, 2);
  assert.deepEqual(result.data.map((item) => item.codigo), ["44980NA", "44980ULT"]);
  assert.deepEqual(result.data[0].ofertas.aimar, [{
    proveedor: "Aimar",
    codigoProveedor: "A-44980NA",
    marca: "",
    descripcion: "",
    precio: { importe: 1200, moneda: "ARS" },
    stock: { estado: "desconocido", cantidad: null },
    url: null,
    imagen: null,
    codigoCoincidente: "",
  }]);
  assert.deepEqual(result.data[1].equivalencias, [{ codigo: "44980ULT", marca: "LITTON" }]);
  assert.deepEqual(concurrencyCalls, [2, 2]);
});

test("retains vehicle candidates and reports family lookup failures per product", async () => {
  const result = await buscarOfertasPorVehiculo({
    ok: true,
    query: { marca: "Toyota", modelo: "Hilux" },
    data: [{ codigo: "44980NA" }, { codigo: "44980ULT" }],
  }, async (code) => {
    if (code === "44980NA") throw new Error("Ficha Litton no disponible");
    return { data: { aimar: [], atonor: [{ codigo: "AT-1" }] }, equivalencias: [], errores: [] };
  });

  assert.equal(result.data.length, 2);
  assert.deepEqual(result.data[0].errores, [{
    proveedor: "Litton",
    error: "Ficha Litton no disponible",
  }]);
  assert.equal(result.data[1].ofertas.atonor[0].codigoProveedor, "AT-1");
});

test("normalizes provider prices and never treats unknown stock as zero", () => {
  const offer = normalizarOferta({
    codigo: "A-528",
    precio: 1234.5,
    stockProveedor: null,
    codigoConsultado: "PD/528",
  }, "Aimar");

  assert.deepEqual(offer.precio, { importe: 1234.5, moneda: "ARS" });
  assert.deepEqual(offer.stock, { estado: "desconocido", cantidad: null });
  assert.equal(offer.codigoCoincidente, "PD/528");
});
