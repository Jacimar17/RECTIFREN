const mongoose = require("mongoose");

const productoSchema = new mongoose.Schema(
  {
    codigo:        { type: String, trim: true },
    marca:         { type: String, trim: true },
    stock:         { type: Number, default: 0, min: 0 },
    equivalencias: { type: String, default: "", trim: true },

    // Referencias a otros productos del inventario
    equivalentesVinculados: [{ type: mongoose.Schema.Types.ObjectId, ref: "Producto" }],

    // Aliases CSV
    CODIGO: { type: String, trim: true },
    MARCA:  { type: String, trim: true },
    STOCK:  { type: Number },
  },
  { timestamps: true, collection: "productos", strict: false }
);

productoSchema.index({ codigo: 1, marca: 1 });
productoSchema.index({ CODIGO: 1, MARCA: 1 });

module.exports = mongoose.model("Producto", productoSchema);
