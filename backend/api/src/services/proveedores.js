const { categorias } = require("../proveedores/registro");
const { buscarFamiliaLitton } = require("../proveedores/busqueda-familia-litton");
const { buscarOfertasPorVehiculo } = require("../proveedores/busqueda-vehiculo-litton");

const pastillasFreno = categorias.pastillas_freno;

async function buscarDetalleFamilia(codigo, options) {
  return buscarFamiliaLitton(codigo, {
    ...options,
    obtenerDetalleLitton: pastillasFreno.catalogo.obtenerDetalle,
    proveedores: pastillasFreno.proveedores,
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
  const proveedores = pastillasFreno.proveedores.map(({ id, nombre }) => ({ id, nombre }));
  return buscarOfertasPorVehiculo(resultado, buscarDetalleFamilia, { proveedores });
}

module.exports = { buscarDetalleFamilia, buscarProductos, obtenerVehiculosLitton, buscarPorVehiculoLitton };
