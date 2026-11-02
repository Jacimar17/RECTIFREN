const equivalenciasService = require("../services/equivalencias");

async function buscar(req, res) {
  res.json({ ok: true, data: await equivalenciasService.buscar(req.query.q) });
}

async function obtener(req, res) {
  res.json({ ok: true, ...await equivalenciasService.obtener(req.params.id) });
}

async function vincular(req, res) {
  const mensaje = await equivalenciasService.vincular(req.params.id, req.body);
  res.json({ ok: true, mensaje });
}

async function desvincular(req, res) {
  const mensaje = await equivalenciasService.desvincular(req.params.id, req.body || {});
  res.json({ ok: true, mensaje });
}

module.exports = { buscar, obtener, vincular, desvincular };
