const test = require("node:test");
const assert = require("node:assert/strict");
const { crearInforme } = require("../src/migrations/pastillas-preview");

const catalogo = [{
  code: "44980NA", brand: "LITTON", substitutes: [
    { code: "FRASLE", value: "PD/528" },
    { code: "LPR", value: "05P1379" },
  ],
}, {
  code: "44980ULT", brand: "LITTON", substitutes: [
    { code: "FRASLE", value: "PD/528" },
    { code: "LPR", value: "05P 1379" },
  ],
}];

test("propone código oficial y detecta duplicado exacto sin cambiar ubicaciones ni datos", () => {
  const productos = [
    { _id: "1", codigo: "PD/528", marca: "LPR", stock: 5, ubicacion: "NEGOCIO" },
    { _id: "2", codigo: "05P 1379", marca: "LPR", stock: 5, ubicacion: "DEPOSITO_GALPON" },
    { _id: "3", codigo: "105P1379", marca: "LPR", stock: 99, ubicacion: "NEGOCIO" },
  ];
  const antes = structuredClone(productos);
  const informe = crearInforme(productos, catalogo);
  assert.equal(informe.propuestas.length, 1);
  assert.equal(informe.propuestas[0].codigoOficial, "05P1379");
  assert.deepEqual(informe.propuestas[0].documentos.map((p) => p.id), ["1", "2"]);
  assert.deepEqual(informe.propuestas[0].stockPorUbicacionAntes, { NEGOCIO: 5, DEPOSITO_GALPON: 5 });
  assert.equal(informe.propuestas[0].stockTotalAntes, 10);
  assert.deepEqual(productos, antes);
});

test("conserva marcas sin código, ambigüedades y ubicaciones no comprobadas", () => {
  const inventario = [
    { _id: "1", codigo: "PD/528", marca: "SHUNKO", stock: 2, ubicacion: "NEGOCIO" },
    { _id: "2", codigo: "PD/528", marca: "LPR", stock: 4 },
    { _id: "3", codigo: "PD/528", marca: "LPR", stock: 1, ubicacion: "NEGOCIO" },
  ];
  const conflictivo = [...catalogo, { code: "OTRA", brand: "LITTON", substitutes: [
    { code: "FRASLE", value: "PD/528" }, { code: "LPR", value: "OTRO" },
  ] }];
  const resultado = crearInforme(inventario, conflictivo);
  assert.equal(resultado.propuestas.length, 0);
  assert.match(resultado.pendientes[0].motivo, /Sin código oficial/);
  assert.match(resultado.pendientes[1].motivo, /ubicación/);
  assert.match(resultado.pendientes[2].motivo, /Más de un código/);
});

test("advierte diferencias y posibles duplicados en variantes", () => {
  const productos = [
    { _id: "1", codigo: "PD/528", marca: "LPR", stock: 1, ubicacion: "NEGOCIO", precio: 10 },
    { _id: "2", codigo: "05P1379", marca: "LPR", stock: 2, ubicacion: "DEPOSITO_GALPON", precio: 20 },
    { _id: "3", schemaVersion: 2, codigo: "44980NA", variantes: [{ marca: "LPR", cantidad: 4, ubicacion: "NEGOCIO" }],
      equivalenciasCatalogo: [{ marca: "LPR", codigo: "05P1379" }] },
  ];
  const propuesta = crearInforme(productos, catalogo).propuestas[0];
  assert.ok(propuesta.requiereRevision.some((motivo) => motivo.includes("precio")));
  assert.ok(propuesta.requiereRevision.some((motivo) => motivo.includes("variantes")));
});

test("rechaza catálogos incompletos", () => {
  assert.throws(() => crearInforme([], [{ code: "1", error: "falló", substitutes: [] }]), /inválidas/);
  assert.throws(() => crearInforme([], []), /inválidas/);
});

test("no oculta un destino con códigos contradictorios o stock incoherente", () => {
  const productos = [
    { _id: "1", codigo: "PD/528", marca: "LPR", stock: 5, ubicacion: "NEGOCIO" },
    { _id: "2", codigo: "OTRO", CODIGO: "05P1379", marca: "LPR", stock: 4, STOCK: 8, ubicacion: "DEPOSITO_GALPON" },
  ];
  const propuesta = crearInforme(productos, catalogo).propuestas[0];
  assert.equal(propuesta.documentos.length, 2);
  assert.equal(propuesta.stockIncompleto, true);
  assert.ok(propuesta.requiereRevision.some((motivo) => motivo.includes("contradictorios")));
  assert.ok(propuesta.requiereRevision.some((motivo) => motivo.includes("stock")));
});

test("identifica documentos exportados en formato JSON de MongoDB", () => {
  const informe = crearInforme([
    { _id: { $oid: "123456789012345678901234" }, codigo: "PD/528", marca: "LPR", stock: 5, ubicacion: "NEGOCIO" },
  ], catalogo);
  assert.equal(informe.propuestas[0].documentos[0].id, "123456789012345678901234");
});
