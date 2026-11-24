const proveedoresService = require("../services/proveedores");
const { CatalogoLocalError } = require("../services/catalogo-pastillas");
const httpError = require("../utils/http-error");
const { familiasCatalogoPersistidoHabilitadas } = require("../utils/familias-catalogo-persistido");
const { familiasHabilitadas } = require("../utils/familias");

function textoEntrada(value) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

function exigirBeta() {
  if (process.env.BETA_PROVEEDORES !== "true") {
    throw httpError(404, "Ruta no encontrada.");
  }
}

async function buscarDetalle(req, res) {
  exigirBeta();
  if (!familiasCatalogoPersistidoHabilitadas()) {
    return res.status(503).json({ ok: false, error: "La búsqueda de familias con catálogo persistido está deshabilitada." });
  }
  if (!familiasHabilitadas()) {
    return res.status(503).json({ ok: false, error: "La comparación de proveedores está deshabilitada temporalmente." });
  }
  const codigo = textoEntrada(req.body.codigo);
  if (!codigo) throw httpError(400, "Falta el código del producto.");
  try {
    res.json({ ok: true, ...await proveedoresService.buscarDetalleFamilia(codigo) });
  } catch (error) {
    const message = String(error?.message || "");
    if (error instanceof CatalogoLocalError) {
      console.error("No se pudo cargar el catálogo local de pastillas.", { name: error.name });
      throw httpError(503, "El catálogo local de pastillas no está disponible.");
    }
    if (message.startsWith("No se encontró una familia única")) {
      throw httpError(404, "No se encontró una familia única para ese código.");
    }
    throw httpError(502, "No se pudo resolver la familia de pastillas o consultar sus ofertas.");
  }
}

async function buscar(req, res) {
  exigirBeta();
  const query = textoEntrada(req.body.q);
  if (!query) return res.json({ ok: true, query, total: 0, data: [], errores: [] });
  res.json(await proveedoresService.buscarProductos(query));
}

async function vehiculosLitton(req, res) {
  exigirBeta();
  try {
    const data = await proveedoresService.obtenerVehiculosLitton();
    res.json({ ok: true, data });
  } catch {
    throw httpError(502, "No se pudo consultar los vehículos de Litton.");
  }
}

async function buscarPorVehiculo(req, res) {
  exigirBeta();
  const marca = textoEntrada(req.query.marca);
  const modelo = textoEntrada(req.query.modelo);
  const page = req.query.page ? Number(req.query.page) : 1;
  if (!marca) throw httpError(400, "Falta la marca.");
  if (!modelo) throw httpError(400, "Falta el modelo.");
  if (!Number.isInteger(page) || page < 1 || page > 1000) throw httpError(400, "La página no es válida.");
  try {
    const resultado = await proveedoresService.buscarPorVehiculoLitton({ marca, modelo, page });
    res.json(resultado);
  } catch (error) {
    throw httpError(502, error.message || "No se pudo buscar pastillas por vehículo.");
  }
}

module.exports = { buscarDetalle, buscar, vehiculosLitton, buscarPorVehiculo };
