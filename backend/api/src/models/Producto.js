const mongoose = require("mongoose");

const productoSchema = new mongoose.Schema(
  {
    // Soporte para mayúsculas (CSV importado) y minúsculas
    codigo:        { type: String, trim: true },
    marca:         { type: String, trim: true },
    stock:         { type: Number, default: 0, min: 0 },
    equivalencias: { type: String, default: "", trim: true },

    // Aliases en mayúscula (como los importó el CSV)
    CODIGO: { type: String, trim: true },
    MARCA:  { type: String, trim: true },
    STOCK:  { type: Number },
  },
  {
    timestamps: true,
    collection: "productos",
    strict: false // acepta campos extra del CSV
  }
);

// Virtual para normalizar — devuelve siempre minúscula sin importar cómo esté guardado
productoSchema.methods.normalizado = function() {
  return {
    _id:          this._id,
    codigo:       this.codigo || this.CODIGO || "",
    marca:        this.marca  || this.MARCA  || "",
    stock:        this.stock  !== undefined ? this.stock : (this.STOCK || 0),
    equivalencias: this.equivalencias || ""
  };
};

productoSchema.index({ codigo: 1, marca: 1 });
productoSchema.index({ CODIGO: 1, MARCA: 1 });

module.exports = mongoose.model("Producto", productoSchema);
