const Producto = require("../models/Producto");

function listarOrdenados() {
  return Producto.find({ archivado: { $ne: true } }).sort({ codigo: 1, CODIGO: 1 });
}

function buscarDirectos(regex, limit) {
  return Producto.find({
    archivado: { $ne: true },
    $or: [
      { codigo: regex }, { CODIGO: regex },
      { marca: regex }, { MARCA: regex },
      { equivalencias: regex },
      { "equivalenciasCatalogo.codigo": regex },
      { "equivalenciasCatalogo.marca": regex },
      { "fichaLitton.name": regex },
      { "fichaLitton.substitutes.value": regex },
      { "variantes.marca": regex },
    ]
  }).sort({ codigo: 1, CODIGO: 1 }).limit(limit + 1).lean();
}

function listarInventarioParaFamilias() {
  return Producto.find({ archivado: { $ne: true } })
    .select("_id codigo CODIGO marca MARCA stock STOCK ubicacion equivalencias equivalenciasCatalogo equivalentesVinculados schemaVersion fichaLitton variantes")
    .lean();
}

function buscarPorCodigoMarca(codigo, marca, ubicacion) {
  const variant = { marca };
  if (ubicacion) variant.ubicacion = ubicacion;
  const legacyMatch = { schemaVersion: { $ne: 2 } };
  if (ubicacion) legacyMatch.ubicacion = ubicacion;
  return Producto.find({
    archivado: { $ne: true },
    $and: [
      { $or: [
        { codigo, marca },
        { CODIGO: codigo, MARCA: marca },
        { schemaVersion: 2, codigo },
        { schemaVersion: 2, "equivalenciasCatalogo.codigo": codigo },
        { schemaVersion: 2, "fichaLitton.substitutes.value": codigo },
      ] },
      { $or: [
        legacyMatch,
        { schemaVersion: 2, variantes: { $elemMatch: variant } },
      ] },
    ],
  }).limit(2);
}

function buscarLittonPorCodigo(codigo) {
  return Producto.find({
    archivado: { $ne: true },
    schemaVersion: 2,
    $or: [
      { codigo },
      { "equivalenciasCatalogo.codigo": codigo },
      { "fichaLitton.substitutes.value": codigo },
    ],
  }).limit(2);
}

function buscarCandidatos(regex) {
  return Producto.find({
    archivado: { $ne: true },
    $or: [
      { codigo: regex }, { CODIGO: regex }, { marca: regex }, { MARCA: regex },
      { equivalencias: regex },
      { "equivalenciasCatalogo.codigo": regex },
      { "equivalenciasCatalogo.marca": regex },
      { "fichaLitton.name": regex },
      { "fichaLitton.substitutes.value": regex },
      { "variantes.marca": regex },
    ],
  }).limit(10);
}

function buscarPorId(id, { incluirArchivados = false } = {}) {
  const query = Producto.findById(id);
  return incluirArchivados ? query : query.where({ archivado: { $ne: true } });
}

function buscarPorIdConEquivalentes(id) {
  return Producto.findOne({ _id: id, archivado: { $ne: true } }).populate("equivalentesVinculados");
}

function buscarPorIdYActualizar(id, update) {
  return Producto.findOneAndUpdate({ _id: id, archivado: { $ne: true } }, update, { new: true });
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
  buscarLittonPorCodigo,
  buscarCandidatos,
  buscarPorId,
  buscarPorIdConEquivalentes,
  buscarPorIdYActualizar,
  crear,
  guardar,
  eliminar,
};
