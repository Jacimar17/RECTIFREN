const buscarLitton = require("../proveedores/litton");
const buscarAimar = require("../proveedores/aimar");
const buscarAtonor = require("../proveedores/atonor");
const { buscarFamiliaLitton } = require("../proveedores/busqueda-familia-litton");
const { obtenerMarcasModelos, buscarPorVehiculo } = require("../proveedores/litton-vehiculos");

const PROVEEDORES = [{ nombre: "Litton", buscar: buscarLitton }];

async function buscarDetalleFamilia(codigo) {
  return buscarFamiliaLitton(codigo, {
    obtenerDetalleLitton: buscarLitton.obtenerDetalle,
    buscarAimar,
    buscarAtonor,
  });
}

async function buscarProductos(query) {
  const respuestas = await Promise.allSettled(PROVEEDORES.map((proveedor) => proveedor.buscar(query)));
  const data = [];
  const errores = [];
  for (let index = 0; index < respuestas.length; index++) {
    const nombre = PROVEEDORES[index].nombre;
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
  return obtenerMarcasModelos();
}

async function buscarPorVehiculoLitton({ marca, modelo, page }) {
  return buscarPorVehiculo({ marca, modelo, page });
}

module.exports = { buscarDetalleFamilia, buscarProductos, obtenerVehiculosLitton, buscarPorVehiculoLitton };
