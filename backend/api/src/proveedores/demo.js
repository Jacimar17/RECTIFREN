module.exports = async function buscarDemo(q) {
  return [
    {
      codigo: "DEMO-001",
      nombre: `Producto de prueba para "${q}"`,
      precio: 1000,
      imagen: null,
      stockProveedor: null,
    },
  ];
};
