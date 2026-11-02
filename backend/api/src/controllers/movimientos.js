const movimientosService = require("../services/movimientos");

async function listar(req, res) {
  res.json({ ok: true, ...await movimientosService.listar(req.query.range || "week") });
}

module.exports = { listar };
