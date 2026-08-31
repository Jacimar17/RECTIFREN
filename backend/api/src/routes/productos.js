const express    = require("express");
const Producto   = require("../models/Producto");
const Movimiento = require("../models/Movimiento");
const auth       = require("../middleware/auth");
const router     = express.Router();

/* Normaliza un documento sin importar si tiene campos en MAYUS o minus */
function norm(p) {
  return {
    _id:          p._id,
    codigo:       p.codigo || p.CODIGO || "",
    marca:        p.marca  || p.MARCA  || "",
    stock:        p.stock  !== undefined && p.stock !== null ? p.stock : (p.STOCK !== undefined ? p.STOCK : 0),
    equivalencias: p.equivalencias || ""
  };
}

/* Busca producto por codigo+marca soportando ambas convenciones */
async function findProducto(codigo, marca) {
  return await Producto.findOne({
    $or: [
      { codigo: codigo, marca: marca },
      { CODIGO: codigo, MARCA: marca }
    ]
  });
}

// GET /api/productos
router.get("/", async (req, res) => {
  try {
    const productos = await Producto.find().sort({ codigo: 1, CODIGO: 1 });
    res.json({ ok: true, data: productos.map(norm) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/productos/search?q=
router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ ok: true, data: [] });
    const regex = new RegExp(q, "i");
    const data = await Producto.find({
      $or: [
        { codigo: regex }, { CODIGO: regex },
        { marca:  regex }, { MARCA:  regex },
        { equivalencias: regex }
      ]
    });
    res.json({ ok: true, data: data.map(norm), total: data.length, query: q });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/productos
router.post("/", auth, async (req, res) => {
  try {
    const { codigo, marca, stock = 0, equivalencias = "" } = req.body;
    if (!codigo || !marca) return res.status(400).json({ ok: false, error: "Faltan campos: codigo, marca." });

    const existe = await findProducto(codigo.trim(), marca.trim());
    if (existe) return res.status(409).json({ ok: false, error: `El producto ya existe: ${codigo} — ${marca}` });

    const producto = await Producto.create({ codigo: codigo.trim(), marca: marca.trim(), stock: Number(stock), equivalencias });
    await Movimiento.create({ accion: "ALTA", productoId: producto._id, codigo: producto.codigo, marca: producto.marca, cantidad: Number(stock), stock_anterior: 0, stock_nuevo: Number(stock) });

    res.status(201).json({ ok: true, data: norm(producto) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/productos/:id
router.put("/:id", auth, async (req, res) => {
  try {
    const { codigo, marca, stock, equivalencias } = req.body;
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

    const stockAntes = producto.stock !== undefined ? producto.stock : (producto.STOCK || 0);

    if (codigo)               { producto.codigo = codigo.trim(); producto.CODIGO = codigo.trim(); }
    if (marca)                { producto.marca  = marca.trim();  producto.MARCA  = marca.trim(); }
    if (stock !== undefined)  { producto.stock  = Number(stock); producto.STOCK  = Number(stock); }
    if (equivalencias !== undefined) producto.equivalencias = equivalencias;

    await producto.save();

    if (stock !== undefined && Number(stock) !== stockAntes) {
      await Movimiento.create({ accion: "AJUSTE", productoId: producto._id, codigo: norm(producto).codigo, marca: norm(producto).marca, cantidad: 0, stock_anterior: stockAntes, stock_nuevo: Number(stock) });
    }

    res.json({ ok: true, data: norm(producto) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/productos/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

    const n = norm(producto);
    await Movimiento.create({ accion: "BAJA", productoId: producto._id, codigo: n.codigo, marca: n.marca, cantidad: 0, stock_anterior: n.stock, stock_nuevo: 0 });
    await producto.deleteOne();

    res.json({ ok: true, mensaje: `Producto ${n.codigo} eliminado.` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
