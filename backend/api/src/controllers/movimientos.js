const movimientosService = require("../services/movimientos");

async function listar(req, res) {
  try {
    res.json({ ok: true, ...await movimientosService.listar(req.query.range || "week") });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}

module.exports = { listar };
