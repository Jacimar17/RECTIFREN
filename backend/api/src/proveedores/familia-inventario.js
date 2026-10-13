const UBICACIONES = {
  NEGOCIO: "NEGOCIO",
  DEPOSITO_GALPON: "DEPOSITO_GALPON",
};

function normalizarCodigo(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[-/]/g, "");
}

function codigosEquivalentes(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((entry) =>
    String(entry ?? "").split(/[,;\n|]+/).map((code) => code.trim()).filter(Boolean)
  );
}

function ubicacionPredeterminada(producto) {
  const codigo = producto.codigo || producto.CODIGO || "";
  return /^RF-/i.test(String(codigo).trim())
    ? UBICACIONES.NEGOCIO
    : UBICACIONES.DEPOSITO_GALPON;
}

function ubicacionEfectiva(producto) {
  if (Object.values(UBICACIONES).includes(producto.ubicacion)) return producto.ubicacion;
  return ubicacionPredeterminada(producto);
}

function resolverFamiliaInventario(productos, codigosIniciales) {
  const porId = new Map(productos.map((producto) => [String(producto._id), producto]));
  const porCodigo = new Map();
  const codigosPorProducto = new Map();

  for (const producto of productos) {
    const codigos = [
      producto.codigo,
      producto.CODIGO,
      ...codigosEquivalentes(producto.equivalencias),
    ].map(normalizarCodigo).filter(Boolean);
    codigosPorProducto.set(String(producto._id), codigos);
    for (const codigo of codigos) {
      if (!porCodigo.has(codigo)) porCodigo.set(codigo, []);
      porCodigo.get(codigo).push(producto);
    }
  }

  const codigosPendientes = codigosIniciales.map(normalizarCodigo).filter(Boolean);
  const idsPendientes = [];
  const visitadosCodigos = new Set();
  const visitadosIds = new Set();
  const encontrados = new Map();

  while (codigosPendientes.length || idsPendientes.length) {
    while (codigosPendientes.length) {
      const codigo = codigosPendientes.pop();
      if (visitadosCodigos.has(codigo)) continue;
      visitadosCodigos.add(codigo);
      for (const producto of porCodigo.get(codigo) || []) {
        idsPendientes.push(String(producto._id));
      }
    }

    while (idsPendientes.length) {
      const id = idsPendientes.pop();
      if (visitadosIds.has(id)) continue;
      visitadosIds.add(id);
      const producto = porId.get(id);
      if (!producto) continue;
      encontrados.set(id, producto);
      codigosPendientes.push(...(codigosPorProducto.get(id) || []));
      for (const vinculado of producto.equivalentesVinculados || []) {
        const vinculadoId = String(vinculado?._id || vinculado);
        if (porId.has(vinculadoId)) idsPendientes.push(vinculadoId);
      }
    }
  }

  const filas = [...encontrados.values()].map((producto) => ({
    _id: String(producto._id),
    codigo: producto.codigo || producto.CODIGO || "",
    marca: producto.marca || producto.MARCA || "",
    stock: Number(producto.stock ?? producto.STOCK ?? 0),
    ubicacion: ubicacionEfectiva(producto),
  })).sort((a, b) =>
    a.codigo.localeCompare(b.codigo, "es", { numeric: true, sensitivity: "base" })
    || a.marca.localeCompare(b.marca, "es", { sensitivity: "base" })
  );

  const totales = filas.reduce((acc, fila) => {
    const stock = Number.isFinite(fila.stock) ? fila.stock : 0;
    acc[fila.ubicacion] += stock;
    acc.total += stock;
    return acc;
  }, { [UBICACIONES.NEGOCIO]: 0, [UBICACIONES.DEPOSITO_GALPON]: 0, total: 0 });

  return { filas, totales };
}

module.exports = {
  UBICACIONES,
  codigosEquivalentes,
  normalizarCodigo,
  resolverFamiliaInventario,
  ubicacionEfectiva,
  ubicacionPredeterminada,
};
