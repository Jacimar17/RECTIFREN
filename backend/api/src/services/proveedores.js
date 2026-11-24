const { categorias } = require("../proveedores/registro");
const { buscarFamiliaLitton } = require("../proveedores/busqueda-familia-litton");
const productosRepository = require("../repositories/productos");
const catalogoPastillas = require("./catalogo-pastillas");
const {
  normalizarCodigo,
  resolverGrupoCatalogo,
  resolverFamiliasCatalogo,
} = require("../proveedores/familias-catalogo-persistido");
const { buscarOfertasPorVehiculo } = require("../proveedores/busqueda-vehiculo-litton");
const { familiasHabilitadas } = require("../utils/familias");
const { familiasCatalogoPersistidoHabilitadas } = require("../utils/familias-catalogo-persistido");

const pastillasFreno = categorias.pastillas_freno;

async function buscarDetalleFamilia(codigo, options = {}) {
  if (!familiasCatalogoPersistidoHabilitadas()) {
    throw new Error("La búsqueda de familias con catálogo persistido está deshabilitada.");
  }
  if (!familiasHabilitadas()) {
    throw new Error("La comparación de proveedores está deshabilitada temporalmente.");
  }
  const catalogo = await catalogoPastillas.obtenerCatalogoLocal();
  let grupo = resolverGrupoCatalogo(codigo, catalogo.fichas);
  if (!grupo) {
    const inventario = await productosRepository.listarInventarioParaFamilias();
    const familiasInventario = resolverFamiliasCatalogo(codigo, inventario, catalogo.fichas);
    if (familiasInventario.length === 1 && familiasInventario[0]?.fichaLitton?.code) {
      grupo = resolverGrupoCatalogo(familiasInventario[0].fichaLitton.code, catalogo.fichas);
    }
  }
  if (!grupo) throw new Error(`No se encontró una familia única para el código ${codigo}.`);

  const ficha = grupo.ficha;
  const marcaPrincipal = ficha.brand || ficha.subcategory || "LITTON";
  const codigoPrincipal = normalizarCodigo(ficha.code);
  const detallePersistido = {
    ...ficha,
    subcategory: ficha.subcategory || marcaPrincipal,
    substitutes: grupo.aliases
      .filter((item) =>
        item.key !== codigoPrincipal
        || normalizarCodigo(item.marca) !== normalizarCodigo(marcaPrincipal)
      )
      .map((item) => ({ code: item.marca, value: item.codigo })),
  };
  const { proveedores, ...buscarOptions } = options;
  return buscarFamiliaLitton(detallePersistido.code, {
    ...buscarOptions,
    obtenerDetalleLitton: async () => detallePersistido,
    proveedores: proveedores || pastillasFreno.proveedores,
  });
}

async function buscarProductos(query) {
  const catalogos = [pastillasFreno.catalogo];
  const respuestas = await Promise.allSettled(catalogos.map((catalogo) => catalogo.buscar(query)));
  const data = [];
  const errores = [];
  for (let index = 0; index < respuestas.length; index++) {
    const nombre = catalogos[index].nombre;
    const respuesta = respuestas[index];
    if (respuesta.status === "rejected") {
      errores.push({ proveedor: nombre, error: String(respuesta.reason?.message || respuesta.reason) });
      continue;
    }
    data.push(...respuesta.value.map((item) => ({ proveedor: nombre, ...item })));
  }
  return { ok: true, query, total: data.length, data, errores };
}

async function obtenerVehiculosLitton() {
  return pastillasFreno.catalogo.obtenerVehiculos();
}

async function buscarPorVehiculoLitton({ marca, modelo, page }) {
  const resultado = await pastillasFreno.catalogo.buscarPorVehiculo({ marca, modelo, page });
  if (!familiasHabilitadas()) return { ...resultado, familiasDeshabilitadas: true };
  const proveedores = pastillasFreno.proveedores.map(({ id, nombre }) => ({ id, nombre }));
  return buscarOfertasPorVehiculo(resultado, buscarDetalleFamilia, { proveedores });
}

module.exports = { buscarDetalleFamilia, buscarProductos, obtenerVehiculosLitton, buscarPorVehiculoLitton };
