const mongoose = require("mongoose");

const productoSchema = new mongoose.Schema(
  {
    codigo:        { type: String, required: true, trim: true },
    marca:         { type: String, required: true, trim: true },
    stock:         { type: Number, required: true, default: 0, min: 0 },
    equivalencias: { type: String, default: "", trim: true },
  },
  {
    timestamps: true, // agrega createdAt y updatedAt
    collection: "productos"
  }
);

// Índice compuesto: codigo + marca es único
productoSchema.index({ codigo: 1, marca: 1 }, { unique: true });

// Índice de texto para búsqueda
productoSchema.index({ codigo: "text", marca: "text", equivalencias: "text" });

module.exports = mongoose.model("Producto", productoSchema);
