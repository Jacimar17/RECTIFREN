const proveedoresService = require("../services/proveedores");

function textoEntrada(value) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

function betaHabilitada(res) {
  if (process.env.BETA_PROVEEDORES === "true") return true;
  res.status(404).json({ ok: false, error: "Ruta no encontrada." });
  return false;
}

async function buscarDetalle(req, res) {
  if (!betaHabilitada(res)) return;
  const codigo = textoEntrada(req.body.codigo);
  if (!codigo) return res.status(400).json({ ok: false, error: "Falta el código del producto." });
  try {
    res.json({ ok: true, ...await proveedoresService.buscarDetalleFamilia(codigo) });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message || "No se pudo consultar la familia Litton." });
  }
}

async function buscar(req, res, next) {
  if (!betaHabilitada(res)) return;
  const query = textoEntrada(req.body.q);
  if (!query) return res.json({ ok: true, query, total: 0, data: [], errores: [] });
  try {
    res.json(await proveedoresService.buscarProductos(query));
  } catch (error) {
    next(error);
  }
}

async function vehiculosLitton(req, res) {
  if (!betaHabilitada(res)) return;
  try {
    const data = await proveedoresService.obtenerVehiculosLitton();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message || "No se pudo consultar los vehículos de Litton." });
  }
}

async function buscarPorVehiculo(req, res) {
  if (!betaHabilitada(res)) return;
  const marca = typeof req.query.marca === "string" ? req.query.marca : "";
  const modelo = typeof req.query.modelo === "string" ? req.query.modelo : "";
  const page = req.query.page ? Number(req.query.page) : 1;
  if (!marca) return res.status(400).json({ ok: false, error: "Falta la marca." });
  if (!modelo) return res.status(400).json({ ok: false, error: "Falta el modelo." });
  try {
    const resultado = await proveedoresService.buscarPorVehiculoLitton({ marca, modelo, page });
    res.json(resultado);
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message || "No se pudo buscar pastillas por vehículo." });
  }
}

module.exports = { buscarDetalle, buscar, vehiculosLitton, buscarPorVehiculo };
