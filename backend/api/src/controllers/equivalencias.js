const equivalenciasService = require("../services/equivalencias");

function responderError(res, error) {
  res.status(error.status || 500).json({ ok: false, error: error.message });
}

async function buscar(req, res) {
  try {
    res.json({ ok: true, data: await equivalenciasService.buscar(req.query.q) });
  } catch (error) {
    responderError(res, error);
  }
}

async function obtener(req, res) {
  try {
    res.json({ ok: true, ...await equivalenciasService.obtener(req.params.id) });
  } catch (error) {
    responderError(res, error);
  }
}

async function vincular(req, res) {
  try {
    const mensaje = await equivalenciasService.vincular(req.params.id, req.body);
    res.json({ ok: true, mensaje });
  } catch (error) {
    responderError(res, error);
  }
}

async function desvincular(req, res) {
  try {
    const mensaje = await equivalenciasService.desvincular(req.params.id, req.body);
    res.json({ ok: true, mensaje });
  } catch (error) {
    responderError(res, error);
  }
}

module.exports = { buscar, obtener, vincular, desvincular };
