const productosRepository = require("../repositories/productos");
const movimientosRepository = require("../repositories/movimientos");
const httpError = require("../utils/http-error");

async function aplicarMovimiento(tipo, body) {
  const { codigo, marca, cantidad = 1, nota = "" } = body;
  if (!codigo || !marca) throw httpError(400, "Faltan campos: codigo, marca.");

  const cant = Number(cantidad);
  if (!cant || cant <= 0) throw httpError(400, "La cantidad debe ser positiva.");

  const producto = await productosRepository.buscarPorCodigoMarca(codigo.trim(), marca.trim());
  if (!producto) throw httpError(404, `Producto no encontrado: ${codigo} — ${marca}`);

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
    cantidad: cant,
    stock_anterior: antes,
    stock_nuevo: despues,
    nota,
  });
  return { codigo: cod, marca: marc, stock_anterior: antes, stock_nuevo: despues };
}

module.exports = { aplicarMovimiento };
