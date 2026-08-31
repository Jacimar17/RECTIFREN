const express    = require("express");
const Producto   = require("../models/Producto");
const Movimiento = require("../models/Movimiento");
const auth       = require("../middleware/auth");
const router     = express.Router();

async function aplicarMovimiento(tipo, req, res) {
  try {
    const { codigo, marca, cantidad = 1, nota = "" } = req.body;
    if (!codigo || !marca) return res.status(400).json({ ok: false, error: "Faltan campos: codigo, marca." });

    const cant = Number(cantidad);
    if (!cant || cant <= 0) return res.status(400).json({ ok: false, error: "La cantidad debe ser un número positivo." });

    const producto = await Producto.findOne({ codigo: codigo.trim(), marca: marca.trim() });
    if (!producto) return res.status(404).json({ ok: false, error: `Producto no encontrado: ${codigo} — ${marca}` });

    const antes = producto.stock;
    let despues  = antes;

    if (tipo === "ENTRADA") despues = antes + cant;
    if (tipo === "SALIDA") {
      if (antes < cant) return res.status(400).json({ ok: false, error: `Stock insuficiente. Disponible: ${antes}, solicitado: ${cant}` });
      despues = antes - cant;
    }

    producto.stock = despues;
    await producto.save();

    await Movimiento.create({ accion: tipo, productoId: producto._id, codigo: producto.codigo, marca: producto.marca, cantidad: cant, stock_anterior: antes, stock_nuevo: despues, nota });

    res.json({ ok: true, codigo: producto.codigo, marca: producto.marca, stock_anterior: antes, stock_nuevo: despues });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// POST /api/stock/in
router.post("/in",  auth, (req, res) => aplicarMovimiento("ENTRADA", req, res));

// POST /api/stock/out
router.post("/out", auth, (req, res) => aplicarMovimiento("SALIDA",  req, res));

module.exports = router;
