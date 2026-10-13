const Producto = require("../models/Producto");
const { ubicacionPredeterminada } = require("../proveedores/familia-inventario");

async function migrarUbicacionesFaltantes() {
  const productos = await Producto.find({
    $or: [
      { ubicacion: { $exists: false } },
      { ubicacion: null },
      { ubicacion: "" },
    ],
  }).select("_id codigo CODIGO").lean();

  if (!productos.length) return 0;

  await Producto.bulkWrite(productos.map((producto) => ({
    updateOne: {
      filter: {
        _id: producto._id,
        $or: [
          { ubicacion: { $exists: false } },
          { ubicacion: null },
          { ubicacion: "" },
        ],
      },
      update: { $set: { ubicacion: ubicacionPredeterminada(producto) } },
    },
  })));

  return productos.length;
}

module.exports = migrarUbicacionesFaltantes;
