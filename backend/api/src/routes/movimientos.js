const express     = require("express");
const Movimiento  = require("../models/Movimiento");
const router      = express.Router();

// GET /api/movimientos?range=week|month
router.get("/", async (req, res) => {
  try {
    const range  = req.query.range || "week";
    const days   = range === "month" ? 30 : 7;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const data = await Movimiento.find({ createdAt: { $gte: cutoff } })
      .sort({ createdAt: -1 })
      .limit(500);

    res.json({ ok: true, data, total: data.length, range });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
