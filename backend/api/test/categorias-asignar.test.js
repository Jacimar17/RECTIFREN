const test = require("node:test");
const assert = require("node:assert/strict");
const { construirFiltroAsignacion } = require("../src/services/categorias");

test("filtra por marca (producto y variantes) y por categoría vacía", () => {
  const filtro = construirFiltroAsignacion({ marca: "Litton", soloSinCategoria: true });

  assert.deepEqual(filtro.$and[0], { archivado: { $ne: true } });

  const marcaOr = filtro.$and[1].$or;
  assert.equal(marcaOr.length, 3);
  assert.equal(marcaOr[0].marca.source, "Litton");
  assert.equal(marcaOr[0].marca.flags, "i");
  assert.equal(marcaOr[1].MARCA.source, "Litton");
  assert.equal(marcaOr[2]["variantes.marca"].source, "Litton");

  const vacias = filtro.$and[2].$or;
  assert.deepEqual(vacias[0], { categoria: { $exists: false } });
  assert.deepEqual(vacias[1], { categoria: null });
  assert.deepEqual(vacias[2], { categoria: "" });
});

test("escapa los caracteres especiales de la marca para no romper la búsqueda", () => {
  const filtro = construirFiltroAsignacion({ marca: "a.b(c)", soloSinCategoria: false });
  const rx = filtro.$and[1].$or[0].marca;

  assert.equal(rx.test("A.B(C)"), true);
  assert.equal(rx.test("axbpc"), false);
});

test("sin 'solo sin categoría' no agrega el filtro de categorías vacías", () => {
  const filtro = construirFiltroAsignacion({ marca: "LPR", soloSinCategoria: false });

  assert.equal(filtro.$and.length, 2);
  assert.equal(filtro.$and.some((condicion) => condicion.$or?.some((c) => "categoria" in c)), false);
});

test("permite filtrar solo por texto (descripción, título o código)", () => {
  const filtro = construirFiltroAsignacion({ texto: "cable", soloSinCategoria: true });

  assert.equal(filtro.$and.length, 3);
  assert.equal(filtro.$and[1].$or.length, 4);
  assert.equal(filtro.$and[1].$or[0].descripcion.source, "cable");
  assert.equal(filtro.$and[1].$or[3].CODIGO.source, "cable");
});
