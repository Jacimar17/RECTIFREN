const Producto = require("../models/Producto");

function listarOrdenados() {
  return Producto.find().sort({ codigo: 1, CODIGO: 1 });
}

function buscarDirectos(regex, limit) {
  return Producto.find({
    $or: [
      { codigo: regex }, { CODIGO: regex },
      { marca: regex }, { MARCA: regex },
      { equivalencias: regex },
      { "equivalenciasCatalogo.codigo": regex },
      { "equivalenciasCatalogo.marca": regex },
    ],
  }).sort({ codigo: 1, CODIGO: 1 }).limit(limit + 1).lean();
}

function listarInventarioParaFamilias() {
  return Producto.find()
    .select("_id codigo CODIGO marca MARCA stock STOCK ubicacion equivalencias equivalenciasCatalogo equivalentesVinculados")
    .lean();
}

function buscarPorCodigoMarca(codigo, marca) {
  return Producto.findOne({
    $or: [
      { codigo, marca },
      { CODIGO: codigo, MARCA: marca },
    ],
  });
}

function buscarCandidatos(regex) {
  return Producto.find({
    $or: [{ codigo: regex }, { CODIGO: regex }, { marca: regex }, { MARCA: regex }],
  }).limit(10);
}

function buscarPorId(id) {
  return Producto.findById(id);
}

function buscarPorIdConEquivalentes(id) {
  return Producto.findById(id).populate("equivalentesVinculados");
}

function buscarPorIdYActualizar(id, update) {
  return Producto.findByIdAndUpdate(id, update, { new: true });
}

function crear(producto) {
  return Producto.create(producto);
}

function guardar(producto) {
  return producto.save();
}

function eliminar(producto) {
  return producto.deleteOne();
}

module.exports = {
  listarOrdenados,
  buscarDirectos,
  listarInventarioParaFamilias,
  buscarPorCodigoMarca,
  buscarCandidatos,
  buscarPorId,
  buscarPorIdConEquivalentes,
  buscarPorIdYActualizar,
  crear,
  guardar,
  eliminar,
};
