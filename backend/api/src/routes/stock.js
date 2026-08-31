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
    if (!cant || cant <= 0) return res.status(400).json({ ok: false, error: "La cantidad debe ser positiva." });

    // Busca con ambas convenciones
    const producto = await Producto.findOne({
      $or: [
        { codigo: codigo.trim(), marca: marca.trim() },
        { CODIGO: codigo.trim(), MARCA: marca.trim() }
      ]
    });
    if (!producto) return res.status(404).json({ ok: false, error: `Producto no encontrado: ${codigo} — ${marca}` });

    const antes = producto.stock !== undefined && producto.stock !== null
      ? producto.stock
      : (producto.STOCK || 0);

    let despues = antes;
    if (tipo === "ENTRADA") despues = antes + cant;
    if (tipo === "SALIDA") {
      if (antes < cant) return res.status(400).json({ ok: false, error: `Stock insuficiente. Disponible: ${antes}, solicitado: ${cant}` });
      despues = antes - cant;
    }

    // Actualiza ambos campos
    producto.stock = despues;
    producto.STOCK = despues;
    await producto.save();

    const cod  = producto.codigo || producto.CODIGO || codigo;
    const marc = producto.marca  || producto.MARCA  || marca;

    await Movimiento.create({ accion: tipo, productoId: producto._id, codigo: cod, marca: marc, cantidad: cant, stock_anterior: antes, stock_nuevo: despues, nota });

    res.json({ ok: true, codigo: cod, marca: marc, stock_anterior: antes, stock_nuevo: despues });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

router.post("/in",  auth, (req, res) => aplicarMovimiento("ENTRADA", req, res));
router.post("/out", auth, (req, res) => aplicarMovimiento("SALIDA",  req, res));

module.exports = router;
