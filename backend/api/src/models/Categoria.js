const mongoose = require("mongoose");

const campoExtraDefinicionSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    tipo: { type: String, enum: ["texto", "select", "numero"], default: "texto" },
    opciones: [{ type: String, trim: true }],
  },
  { _id: false }
);

const categoriaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    descripcion: { type: String, trim: true, default: "" },
    camposExtra: [campoExtraDefinicionSchema],
    activa: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "categorias" }
);

categoriaSchema.index({ nombre: 1 });
categoriaSchema.index({ slug: 1 });

module.exports = mongoose.model("Categoria", categoriaSchema);

