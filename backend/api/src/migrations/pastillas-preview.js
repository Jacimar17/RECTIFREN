const { normalizarCodigo } = require("../proveedores/familia-inventario");

const UBICACIONES = new Set(["NEGOCIO", "DEPOSITO_GALPON"]);

function marca(producto) {
  return String(producto.marca || producto.MARCA || "").trim();
}

function codigo(producto) {
  return String(producto.codigo || producto.CODIGO || "").trim();
}

function identificador(producto) {
  const id = producto._id;
  if (typeof id === "string" && id.trim()) return id;
  if (id && typeof id.$oid === "string" && id.$oid.trim()) return id.$oid;
  return "";
}

function codigosDeMarca(ficha, marcaBuscada) {
  const entradas = [
    { code: ficha.brand, value: ficha.code },
    ...(Array.isArray(ficha.substitutes) ? ficha.substitutes : []),
  ];
  return entradas.filter((entrada) =>
    normalizarCodigo(entrada.code) === marcaBuscada
    && normalizarCodigo(entrada.value)
  ).map((entrada) => String(entrada.value).trim());
}

function referencias(ficha) {
  return [
    String(ficha.code || "").trim(),
    ...(Array.isArray(ficha.substitutes) ? ficha.substitutes.map((item) => item.value) : []),
  ].map(normalizarCodigo).filter(Boolean);
}

function datosStock(producto) {
  const ubicacion = producto.ubicacion;
  const cantidad = producto.stock ?? producto.STOCK;
  if (!UBICACIONES.has(ubicacion) || producto.ubicacionPendiente) return null;
  if (typeof cantidad !== "number" || !Number.isFinite(cantidad) || cantidad < 0) return null;
  if (producto.stock != null && producto.STOCK != null && producto.stock !== producto.STOCK) return null;
  return { ubicacion, cantidad };
}

function resumenDocumento(producto) {
  return {
    id: identificador(producto),
    codigo: codigo(producto),
    CODIGO: producto.CODIGO ?? null,
    marca: marca(producto),
    MARCA: producto.MARCA ?? null,
    stock: producto.stock ?? producto.STOCK ?? null,
    STOCK: producto.STOCK ?? null,
    ubicacion: producto.ubicacion ?? null,
    ubicacionPendiente: producto.ubicacionPendiente ?? false,
    schemaVersion: producto.schemaVersion ?? 1,
    variantes: producto.variantes ?? [],
    stockMinimo: producto.stockMinimo ?? null,
    precio: producto.precio ?? null,
    categoria: producto.categoria ?? null,
    titulo: producto.titulo ?? null,
    descripcion: producto.descripcion ?? null,
    equivalencias: producto.equivalencias ?? null,
    equivalentesVinculados: producto.equivalentesVinculados ?? [],
    camposExtra: producto.camposExtra ?? null,
  };
}

function crearInforme(productos, catalogo) {
  if (!Array.isArray(productos) || !Array.isArray(catalogo)) {
    throw new Error("El inventario y el catálogo deben ser listas JSON.");
  }
  if (!catalogo.length || catalogo.some((ficha) => !ficha || ficha.error || !ficha.code || !Array.isArray(ficha.substitutes))) {
    throw new Error("El catálogo contiene fichas inválidas o con errores; no se puede generar el informe.");
  }
  const activos = productos.filter((producto) => producto && producto.archivado !== true);
  const pendientes = [];
  const candidatos = new Map();
  for (const producto of activos) {
    if (!/^PD[/ -]?[A-Z0-9]+$/i.test(codigo(producto))) continue;
    const original = resumenDocumento(producto);
    if (producto.schemaVersion === 2 || !identificador(producto) || !marca(producto) || !datosStock(producto)) {
      pendientes.push({ producto: original, motivo: "Datos de producto, stock o ubicación no verificables." });
      continue;
    }
    if (producto.codigo && producto.CODIGO && normalizarCodigo(producto.codigo) !== normalizarCodigo(producto.CODIGO)) {
      pendientes.push({ producto: original, motivo: "Los campos de código son contradictorios." });
      continue;
    }
    if (producto.marca && producto.MARCA && normalizarCodigo(producto.marca) !== normalizarCodigo(producto.MARCA)) {
      pendientes.push({ producto: original, motivo: "Los campos de marca son contradictorios." });
      continue;
    }
    const codigoAnterior = normalizarCodigo(codigo(producto));
    const marcaNormalizada = normalizarCodigo(marca(producto));
    const fichas = catalogo.filter((ficha) => referencias(ficha).includes(codigoAnterior));
    const oficiales = new Map();
    for (const ficha of fichas) {
      for (const valor of codigosDeMarca(ficha, marcaNormalizada)) {
        const key = normalizarCodigo(valor);
        if (!oficiales.has(key)) oficiales.set(key, { codigo: valor, fichas: [] });
        oficiales.get(key).fichas.push(ficha.code);
      }
    }
    if (oficiales.size !== 1) {
      pendientes.push({
        producto: original,
        motivo: oficiales.size ? "Más de un código oficial posible para la marca." : "Sin código oficial verificable para la marca.",
        codigosPosibles: [...oficiales.values()],
        fichas: fichas.map((ficha) => ficha.code),
      });
      continue;
    }
    const oficial = [...oficiales.values()][0];
    const key = `${marcaNormalizada}|${normalizarCodigo(oficial.codigo)}`;
    if (!candidatos.has(key)) candidatos.set(key, { codigoOficial: oficial.codigo, marca: marca(producto), fichas: new Set(), origenes: [] });
    const grupo = candidatos.get(key);
    oficial.fichas.forEach((ficha) => grupo.fichas.add(ficha));
    grupo.origenes.push(producto);
  }

  const propuestas = [];
  for (const grupo of candidatos.values()) {
    const marcaNormalizada = normalizarCodigo(grupo.marca);
    const codigoNormalizado = normalizarCodigo(grupo.codigoOficial);
    const destinos = activos.filter((producto) =>
      producto.schemaVersion !== 2
      && [producto.codigo, producto.CODIGO].some((value) => normalizarCodigo(value) === codigoNormalizado)
      && [producto.marca, producto.MARCA].some((value) => normalizarCodigo(value) === marcaNormalizada)
      && !grupo.origenes.includes(producto)
    );
    const versionesDos = activos.filter((producto) =>
      producto.schemaVersion === 2
      && (producto.variantes || []).some((variante) => normalizarCodigo(variante.marca) === marcaNormalizada)
      && [codigo(producto), ...(producto.equivalenciasCatalogo || []).filter((item) =>
        normalizarCodigo(item.marca) === marcaNormalizada).map((item) => item.codigo)]
        .some((value) => normalizarCodigo(value) === codigoNormalizado)
    );
    const documentos = [...new Set([...grupo.origenes, ...destinos])];
    const motivos = [];
    if (documentos.some((producto) => !identificador(producto) || !datosStock(producto))) {
      motivos.push("Identificador, stock o ubicación no verificables.");
    }
    if (documentos.some((producto) =>
      (producto.codigo && producto.CODIGO && normalizarCodigo(producto.codigo) !== normalizarCodigo(producto.CODIGO))
      || (producto.marca && producto.MARCA && normalizarCodigo(producto.marca) !== normalizarCodigo(producto.MARCA))
    )) motivos.push("Campos de código o marca contradictorios.");
    if (versionesDos.length) motivos.push("Posible coincidencia con producto de variantes: requiere revisión.");
    for (const campo of ["precio", "stockMinimo", "categoria", "titulo", "descripcion", "camposExtra"]) {
      const valores = new Set(documentos.map((producto) => JSON.stringify(producto[campo] ?? null)));
      if (documentos.length > 1 && valores.size > 1) motivos.push(`Diferencias en ${campo}.`);
    }
    const totales = { NEGOCIO: 0, DEPOSITO_GALPON: 0 };
    for (const producto of documentos) {
      const stock = datosStock(producto);
      if (stock) totales[stock.ubicacion] += stock.cantidad;
    }
    propuestas.push({
      marca: grupo.marca,
      codigoOficial: grupo.codigoOficial,
      fichas: [...grupo.fichas].sort(),
      documentos: documentos.map(resumenDocumento),
      posiblesProductosConVariantes: versionesDos.map(resumenDocumento),
      stockPorUbicacionAntes: totales,
      stockTotalAntes: totales.NEGOCIO + totales.DEPOSITO_GALPON,
      stockIncompleto: documentos.some((producto) => !datosStock(producto)) || versionesDos.length > 0,
      requiereRevision: motivos,
    });
  }
  return { modo: "SIMULACION: no modifica datos", propuestas, pendientes };
}

module.exports = { crearInforme };
