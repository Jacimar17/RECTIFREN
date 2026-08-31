const mongoose = require("mongoose");

const movimientoSchema = new mongoose.Schema(
  {
    accion:         { type: String, required: true, enum: ["ENTRADA", "SALIDA", "AJUSTE", "ALTA", "BAJA"] },
    productoId:     { type: mongoose.Schema.Types.ObjectId, ref: "Producto" },
    codigo:         { type: String, required: true },
    marca:          { type: String, required: true },
    cantidad:       { type: Number, default: 0 },
    stock_anterior: { type: Number, required: true },
    stock_nuevo:    { type: Number, required: true },
    nota:           { type: String, default: "" },
  },
  {
    timestamps: true,
    collection: "movimientos"
  }
);

module.exports = mongoose.model("Movimiento", movimientoSchema);
