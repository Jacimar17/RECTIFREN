const productosService = require("../services/productos");

function responderError(res, error) {
  res.status(error.status || 500).json({ ok: false, error: error.message });
}

async function catalogoPublico(req, res) {
  try {
    const resultado = await productosService.catalogoPublico(req.query);
    res.json({ ok: true, ...resultado });
  } catch (error) {
    responderError(res, error);
  }
}

async function listar(req, res) {
  try {
    res.json({ ok: true, data: await productosService.listar() });
  } catch (error) {
    responderError(res, error);
  }
}

async function buscar(req, res) {
  try {
    res.json({ ok: true, ...await productosService.buscar(req.query.q) });
  } catch (error) {
    responderError(res, error);
  }
}

async function agregar(req, res) {
  try {
    const data = await productosService.agregar(req.body);
    res.status(201).json({ ok: true, data });
  } catch (error) {
    responderError(res, error);
  }
}

async function actualizar(req, res) {
  try {
    res.json({ ok: true, data: await productosService.actualizar(req.params.id, req.body) });
  } catch (error) {
    responderError(res, error);
  }
}

async function eliminar(req, res) {
  try {
    const codigo = await productosService.eliminar(req.params.id);
    res.json({ ok: true, mensaje: `Producto ${codigo} eliminado.` });
  } catch (error) {
    responderError(res, error);
  }
}

async function eliminarVariante(req, res) {
  try {
    const codigo = await productosService.eliminarVariante(req.params.id, req.body || {});
    res.json({ ok: true, mensaje: `Variante de ${codigo} eliminada.` });
  } catch (error) {
    responderError(res, error);
  }
}

async function actualizarStockMinimo(req, res) {
  try {
    res.json({
      ok: true,
      data: await productosService.actualizarStockMinimo(req.params.id, req.body.stockMinimo, req.body),
    });
  } catch (error) {
    responderError(res, error);
  }
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
