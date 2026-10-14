const stockService = require("../services/stock");

async function aplicarEntrada(req, res) {
  try {
    res.json({ ok: true, ...await stockService.aplicarMovimiento("ENTRADA", req.body) });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message });
  }
}

async function aplicarSalida(req, res) {
  try {
    res.json({ ok: true, ...await stockService.aplicarMovimiento("SALIDA", req.body) });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message });
  }
}

module.exports = { aplicarEntrada, aplicarSalida };
