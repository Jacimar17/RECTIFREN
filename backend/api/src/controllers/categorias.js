const categoriasService = require("../services/categorias");

async function listar(req, res) {
  const data = await categoriasService.listar();
  res.json({ ok: true, data });
}

async function crear(req, res) {
  const data = await categoriasService.crear(req.body || {});
  res.status(201).json({ ok: true, data });
}

async function renombrar(req, res) {
  const data = await categoriasService.renombrar(req.params.id, req.body.nombre);
  res.json({ ok: true, data });
}

async function marcas(req, res) {
  const data = await categoriasService.listarMarcas();
  res.json({ ok: true, data });
}

async function asignar(req, res) {
  const data = await categoriasService.asignarMasivo(req.body || {});
  res.json({ ok: true, data });
}

module.exports = {
  listar,
  crear,
  renombrar,
  marcas,
  asignar,
};
