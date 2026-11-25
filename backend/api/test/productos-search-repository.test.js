const test = require("node:test");
const assert = require("node:assert/strict");
const Producto = require("../src/models/Producto");
const productosRepository = require("../src/repositories/productos");

test("direct inventory search includes catalog aliases and their linked Litton code", async () => {
  const originalFind = Producto.find;
  const filters = [];
  Producto.find = (filter) => {
    filters.push(filter);
    return {
      sort() { return this; },
      limit() { return this; },
      lean: async () => [],
    };
  };

  try {
    for (const [query, expectedField] of [
      ["PD/1494", "equivalenciasCatalogo.codigo"],
      ["49340ULT", "equivalenciasCatalogo.productoLitton"],
    ]) {
      await productosRepository.buscarDirectos(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), 100, {
        incluirFamilias: true,
      });

      const conditions = filters[filters.length - 1].$or;
      assert.ok(conditions.some((condition) =>
        condition[expectedField] instanceof RegExp && condition[expectedField].test(query)));
      if (query === "PD/1494") {
        assert.ok(conditions.some((condition) =>
          condition["fichaLitton.substitutes.value"] instanceof RegExp));
      }
    }
  } finally {
    Producto.find = originalFind;
  }
});

test("public catalog search also finds linked Litton codes", async () => {
  const originalFind = Producto.find;
  const originalCountDocuments = Producto.countDocuments;
  let filter;
  Producto.countDocuments = async (value) => {
    filter = value;
    return 0;
  };
  Producto.find = () => ({
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    lean: async () => [],
  });

  try {
    await productosRepository.buscarCatalogoPublico({ query: "49340ULT" });

    const search = filter.$and.find((condition) => Array.isArray(condition.$or));
    assert.ok(search.$or.some((condition) => condition["equivalenciasCatalogo.productoLitton"] instanceof RegExp));
  } finally {
    Producto.find = originalFind;
    Producto.countDocuments = originalCountDocuments;
  }
});

test("equivalence and exact-code lookups include linked Litton codes", () => {
  const originalFind = Producto.find;
  const filters = [];
  Producto.find = (filter) => {
    filters.push(filter);
    return { limit() { return this; } };
  };

  try {
    productosRepository.buscarCandidatos(/49340ULT/i);
    productosRepository.buscarPorCodigoMarca("49340ULT", "LITTON");
    productosRepository.buscarLittonPorCodigo("49340ULT");

    assert.ok(filters[0].$or.some((condition) =>
      condition["equivalenciasCatalogo.productoLitton"] instanceof RegExp));
    assert.ok(filters[1].$and[0].$or.some((condition) =>
      condition["equivalenciasCatalogo.productoLitton"] === "49340ULT"));
    assert.ok(filters[2].$or.some((condition) =>
      condition["equivalenciasCatalogo.productoLitton"] === "49340ULT"));
  } finally {
    Producto.find = originalFind;
  }
});
