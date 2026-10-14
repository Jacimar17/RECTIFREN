const productosRepository = require("../repositories/productos");
const movimientosRepository = require("../repositories/movimientos");
const httpError = require("../utils/http-error");

async function aplicarMovimiento(tipo, body) {
  const { codigo, marca, cantidad = 1, nota = "", ubicacion } = body;
  if (!codigo || !marca) throw httpError(400, "Faltan campos: codigo, marca.");

  const cant = Number(cantidad);
  if (!cant || cant <= 0) throw httpError(400, "La cantidad debe ser positiva.");

  const productos = await productosRepository.buscarPorCodigoMarca(codigo.trim(), marca.trim(), ubicacion);
  if (!productos.length) throw httpError(404, `Producto no encontrado: ${codigo} — ${marca}`);
  if (productos.length > 1) throw httpError(409, "Hay más de un producto coincidente; indicá una ubicación.");
  const producto = productos[0];

  if (producto.schemaVersion === 2) {
    const variantes = (producto.variantes || []).filter((variante) =>
      variante.marca === marca.trim() && (!ubicacion || variante.ubicacion === ubicacion)
    );
    if (variantes.length !== 1) {
      throw httpError(variantes.length ? 409 : 404,
        variantes.length
          ? "Hay varias ubicaciones para esta marca; indicá dónde actualizar el stock."
          : `No existe una variante ${marca} para ${codigo}.`);
    }
    const variante = variantes[0];
    const antes = Number(variante.cantidad || 0);
    let despues = antes;
    if (tipo === "ENTRADA") despues = antes + cant;
    if (tipo === "SALIDA") {
      if (antes < cant) {
        throw httpError(400, `Stock insuficiente. Disponible: ${antes}, solicitado: ${cant}`);
      }
      despues = antes - cant;
    }
    variante.cantidad = despues;
    await productosRepository.guardar(producto);
    await movimientosRepository.crear({
      accion: tipo,
      productoId: producto._id,
      codigo: producto.codigo,
      marca: variante.marca,
      ubicacion: variante.ubicacion,
      cantidad: cant,
      stock_anterior: antes,
      stock_nuevo: despues,
      nota,
    });
    return {
      codigo: producto.codigo,
      marca: variante.marca,
      ubicacion: variante.ubicacion,
      stock_anterior: antes,
      stock_nuevo: despues,
    };
  }

  const antes = producto.stock !== undefined && producto.stock !== null
    ? producto.stock
    : (producto.STOCK || 0);
  let despues = antes;
  if (tipo === "ENTRADA") despues = antes + cant;
  if (tipo === "SALIDA") {
    if (antes < cant) {
      throw httpError(400, `Stock insuficiente. Disponible: ${antes}, solicitado: ${cant}`);
    }
    despues = antes - cant;
  }

  producto.stock = despues;
  producto.STOCK = despues;
  await productosRepository.guardar(producto);

  const cod = producto.codigo || producto.CODIGO || codigo;
  const marc = producto.marca || producto.MARCA || marca;
  await movimientosRepository.crear({
    accion: tipo,
    productoId: producto._id,
    codigo: cod,
    marca: marc,
    ubicacion: producto.ubicacion,
    cantidad: cant,
    stock_anterior: antes,
    stock_nuevo: despues,
    nota,
  });
  return { codigo: cod, marca: marc, stock_anterior: antes, stock_nuevo: despues };
}

module.exports = { aplicarMovimiento };
