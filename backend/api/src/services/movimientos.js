const movimientosRepository = require("../repositories/movimientos");

async function listar(range) {
  const days = range === "month" ? 30 : 7;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const data = await movimientosRepository.listarDesde(cutoff);
  return { data, total: data.length, range };
}

module.exports = { listar };
