const Movimiento = require("../models/Movimiento");

function crear(movimiento) {
  return Movimiento.create(movimiento);
}

function listarDesde(cutoff) {
  return Movimiento.find({ createdAt: { $gte: cutoff } })
    .sort({ createdAt: -1 })
    .limit(500);
}

module.exports = { crear, listarDesde };
