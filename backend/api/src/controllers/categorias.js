const categoriasService = require("../services/categorias");

function responderError(res, error) {
  res.status(error.status || 500).json({ ok: false, error: error.message });
}

async function listar(req, res) {
  try {
    const data = await categoriasService.listar();
    res.json({ ok: true, data });
  } catch (error) {
    responderError(res, error);
  }
}

async function crear(req, res) {
  try {
    const data = await categoriasService.crear(req.body || {});
    res.status(201).json({ ok: true, data });
  } catch (error) {
    responderError(res, error);
  }
}

async function renombrar(req, res) {
  try {
    const data = await categoriasService.renombrar(req.params.id, req.body?.nombre);
    res.json({ ok: true, data });
  } catch (error) {
    responderError(res, error);
  }
}

module.exports = {
  listar,
  crear,
  renombrar,
};

