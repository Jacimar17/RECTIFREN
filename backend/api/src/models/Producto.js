const mongoose = require("mongoose");

const varianteInventarioSchema = new mongoose.Schema(
  {
    marca: { type: String, required: true, trim: true },
    ubicacion: { type: String, required: true, enum: ["NEGOCIO", "DEPOSITO_GALPON"] },
    cantidad: { type: Number, required: true, min: 0, default: 0 },
    stockMinimo: { type: Number, min: 0, default: 2 },
  },
  { _id: true }
);

const productoSchema = new mongoose.Schema(
  {
    schemaVersion: { type: Number, enum: [1, 2], default: 1 },
    archivado: { type: Boolean, default: false, index: true },
    fichaLitton: { type: mongoose.Schema.Types.Mixed },
    imagenLitton: { type: String, trim: true, default: "" },
    variantes: { type: [varianteInventarioSchema], default: undefined },
    codigo:        { type: String, trim: true },
    marca:         { type: String, trim: true },
    categoria:     { type: String, trim: true, default: "" },
    camposExtra:   { type: mongoose.Schema.Types.Mixed, default: {} },
    titulo:        { type: String, trim: true, default: "" },
    descripcion:   { type: String, trim: true, default: "" },
    precio:        { type: Number, default: 0, min: 0 },
    foto:          { type: String, trim: true, default: "" },
    stock:         { type: Number, default: 0, min: 0 },
    ubicacion: { type: String, enum: ["NEGOCIO", "DEPOSITO_GALPON"] },
    equivalencias:   { type: String, default: "", trim: true },
    equivalenciasCatalogo: [{
      codigo: { type: String, trim: true },
      marca: { type: String, trim: true, default: "" },
      productoLitton: { type: String, trim: true, default: "" },
    }],
    stockMinimo:     { type: Number, default: 2, min: 0 },

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
productoSchema.index({ categoria: 1 });

module.exports = mongoose.model("Producto", productoSchema);
