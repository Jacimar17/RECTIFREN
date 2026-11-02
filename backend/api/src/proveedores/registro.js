const buscarLitton = require("./litton");
const littonVehiculos = require("./litton-vehiculos");
const buscarAimar = require("./aimar");
const buscarAtonor = require("./atonor");

const pastillasFreno = Object.freeze({
  id: "pastillas_freno",
  catalogo: Object.freeze({
    id: "litton",
    nombre: "Litton",
    buscar: buscarLitton,
    obtenerDetalle: buscarLitton.obtenerDetalle,
    obtenerVehiculos: littonVehiculos.obtenerMarcasModelos,
    buscarPorVehiculo: littonVehiculos.buscarPorVehiculo,
  }),
  proveedores: Object.freeze([
    Object.freeze({ id: "aimar", nombre: "Aimar", buscar: buscarAimar }),
    Object.freeze({ id: "atonor", nombre: "ATONOR", buscar: buscarAtonor }),
  ]),
});

const categorias = Object.freeze({
  [pastillasFreno.id]: pastillasFreno,
});

module.exports = Object.freeze({ categorias });
