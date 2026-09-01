const express  = require("express");
const Producto = require("../models/Producto");
const auth     = require("../middleware/auth");
const router   = express.Router();

function norm(p) {
  return {
    _id:   p._id,
    codigo: p.codigo || p.CODIGO || "",
    marca:  p.marca  || p.MARCA  || "",
    stock:  p.stock !== undefined && p.stock !== null ? p.stock : (p.STOCK || 0),
  };
}

// GET /api/equivalencias/search?q= — busca productos para autocompletar
router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (q.length < 1) return res.json({ ok: true, data: [] });
    const regex = new RegExp(q, "i");
    const data  = await Producto.find({
      $or: [{ codigo: regex }, { CODIGO: regex }, { marca: regex }, { MARCA: regex }]
    }).limit(10);
    res.json({ ok: true, data: data.map(norm) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/equivalencias/:id — trae los equivalentes de un producto con su stock actual
router.get("/:id", async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id)
      .populate("equivalentesVinculados");
    if (!producto) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

    const vinculados = (producto.equivalentesVinculados || []).map(norm);
    const textoLibre = (producto.equivalencias || "")
      .split(",").map(s => s.trim()).filter(Boolean);

    res.json({ ok: true, vinculados, textoLibre });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/equivalencias/:id/vincular — vincula dos productos (bidireccional)
router.post("/:id/vincular", auth, async (req, res) => {
  try {
    const { equivalenteId, equivalenteTexto } = req.body;
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

    // Si hay un ID válido, vincular bidireccional
    if (equivalenteId) {
      const equivalente = await Producto.findById(equivalenteId);
      if (!equivalente) return res.status(404).json({ ok: false, error: "Equivalente no encontrado." });

      // Agregar en ambas direcciones si no existe ya
      if (!producto.equivalentesVinculados.includes(equivalenteId)) {
        producto.equivalentesVinculados.push(equivalenteId);
        await producto.save();
      }
      if (!equivalente.equivalentesVinculados.includes(producto._id)) {
        equivalente.equivalentesVinculados.push(producto._id);
        await equivalente.save();
      }

      return res.json({ ok: true, mensaje: "Productos vinculados correctamente." });
    }

    // Si es texto libre (no existe en stock)
    if (equivalenteTexto) {
      const actual = (producto.equivalencias || "").split(",").map(s => s.trim()).filter(Boolean);
      if (!actual.includes(equivalenteTexto.trim())) {
        actual.push(equivalenteTexto.trim());
        producto.equivalencias = actual.join(", ");
        await producto.save();
      }
      return res.json({ ok: true, mensaje: "Equivalencia de texto agregada." });
    }

    res.status(400).json({ ok: false, error: "Faltan datos: equivalenteId o equivalenteTexto." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/equivalencias/:id/desvincular — quita un vínculo
router.delete("/:id/desvincular", auth, async (req, res) => {
  try {
    const { equivalenteId, equivalenteTexto } = req.body;
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

    if (equivalenteId) {
      // Quitar en ambas direcciones
      producto.equivalentesVinculados = producto.equivalentesVinculados
        .filter(id => id.toString() !== equivalenteId);
      await producto.save();

      const equivalente = await Producto.findById(equivalenteId);
      if (equivalente) {
        equivalente.equivalentesVinculados = equivalente.equivalentesVinculados
          .filter(id => id.toString() !== producto._id.toString());
        await equivalente.save();
      }
      return res.json({ ok: true, mensaje: "Vínculo eliminado." });
    }

    if (equivalenteTexto) {
      const actual = (producto.equivalencias || "").split(",").map(s => s.trim()).filter(Boolean);
      producto.equivalencias = actual.filter(s => s !== equivalenteTexto.trim()).join(", ");
      await producto.save();
      return res.json({ ok: true, mensaje: "Equivalencia de texto eliminada." });
    }

    res.status(400).json({ ok: false, error: "Faltan datos." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
