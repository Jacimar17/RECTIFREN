const stockService = require("../services/stock");

async function aplicarEntrada(req, res) {
  res.json({ ok: true, ...await stockService.aplicarMovimiento("ENTRADA", req.body) });
}

async function aplicarSalida(req, res) {
  res.json({ ok: true, ...await stockService.aplicarMovimiento("SALIDA", req.body) });
}

module.exports = { aplicarEntrada, aplicarSalida };
