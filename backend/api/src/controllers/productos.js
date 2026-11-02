const productosService = require("../services/productos");

async function catalogoPublico(req, res) {
  const resultado = await productosService.catalogoPublico(req.query);
  res.json({ ok: true, ...resultado });
}

async function listar(req, res) {
  res.json({ ok: true, data: await productosService.listar() });
}

async function buscar(req, res) {
  res.json({ ok: true, ...await productosService.buscar(req.query.q) });
}

async function agregar(req, res) {
  const data = await productosService.agregar(req.body);
  res.status(201).json({ ok: true, data });
}

async function actualizar(req, res) {
  res.json({ ok: true, data: await productosService.actualizar(req.params.id, req.body) });
}

async function eliminar(req, res) {
  const codigo = await productosService.eliminar(req.params.id);
  res.json({ ok: true, mensaje: `Producto ${codigo} eliminado.` });
}

async function eliminarVariante(req, res) {
  const codigo = await productosService.eliminarVariante(req.params.id, req.body || {});
  res.json({ ok: true, mensaje: `Variante de ${codigo} eliminada.` });
}

async function actualizarStockMinimo(req, res) {
  res.json({
    ok: true,
    data: await productosService.actualizarStockMinimo(req.params.id, req.body.stockMinimo, req.body),
  });
}

module.exports = {
  catalogoPublico,
  listar,
  buscar,
  agregar,
  actualizar,
  eliminar,
  eliminarVariante,
  actualizarStockMinimo,
};
