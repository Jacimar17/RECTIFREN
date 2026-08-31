const express    = require("express");
const Producto   = require("../models/Producto");
const Movimiento = require("../models/Movimiento");
const auth       = require("../middleware/auth");
const router     = express.Router();

// GET /api/productos — listar todos
router.get("/", async (req, res) => {
  try {
    const productos = await Producto.find().sort({ codigo: 1, marca: 1 });
    res.json({ ok: true, data: productos });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/productos/search?q=término — búsqueda
router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ ok: true, data: [] });

    const regex = new RegExp(q, "i");
    const data  = await Producto.find({
      $or: [
        { codigo:        regex },
        { marca:         regex },
        { equivalencias: regex },
      ]
    }).sort({ codigo: 1 });

    res.json({ ok: true, data, total: data.length, query: q });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/productos — agregar producto (admin)
router.post("/", auth, async (req, res) => {
  try {
    const { codigo, marca, stock = 0, equivalencias = "" } = req.body;
    if (!codigo || !marca) return res.status(400).json({ ok: false, error: "Faltan campos: codigo, marca." });

    const existe = await Producto.findOne({ codigo: codigo.trim(), marca: marca.trim() });
    if (existe) return res.status(409).json({ ok: false, error: `El producto ya existe: ${codigo} — ${marca}` });

    const producto = await Producto.create({ codigo: codigo.trim(), marca: marca.trim(), stock: Number(stock), equivalencias });
    await Movimiento.create({ accion: "ALTA", productoId: producto._id, codigo: producto.codigo, marca: producto.marca, cantidad: Number(stock), stock_anterior: 0, stock_nuevo: Number(stock) });

    res.status(201).json({ ok: true, data: producto });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/productos/:id — editar producto (admin)
router.put("/:id", auth, async (req, res) => {
  try {
    const { codigo, marca, stock, equivalencias } = req.body;
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

    const stockAntes = producto.stock;
    if (codigo)        producto.codigo        = codigo.trim();
    if (marca)         producto.marca         = marca.trim();
    if (stock !== undefined) producto.stock   = Number(stock);
    if (equivalencias !== undefined) producto.equivalencias = equivalencias;

    await producto.save();

    if (stock !== undefined && Number(stock) !== stockAntes) {
      await Movimiento.create({ accion: "AJUSTE", productoId: producto._id, codigo: producto.codigo, marca: producto.marca, cantidad: 0, stock_anterior: stockAntes, stock_nuevo: Number(stock) });
    }

    res.json({ ok: true, data: producto });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/productos/:id — eliminar producto (admin)
router.delete("/:id", auth, async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

    await Movimiento.create({ accion: "BAJA", productoId: producto._id, codigo: producto.codigo, marca: producto.marca, cantidad: 0, stock_anterior: producto.stock, stock_nuevo: 0 });
    await producto.deleteOne();

    res.json({ ok: true, mensaje: `Producto ${producto.codigo} eliminado.` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
