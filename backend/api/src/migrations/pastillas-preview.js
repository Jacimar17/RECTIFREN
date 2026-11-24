const { normalizarCodigo } = require("../proveedores/familia-inventario");
const { coincideCodigoEspecial } = require("../proveedores/familia-litton-en-vivo");
const { identidadMarca, mismaMarcaCatalogo } = require("../proveedores/familias-catalogo-persistido");

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
  if (id && typeof id.toHexString === "function") return id.toHexString();
  return "";
}

function codigosDeMarca(ficha, marcaBuscada) {
  const entradas = [
    { code: ficha.brand, value: ficha.code },
    ...(Array.isArray(ficha.substitutes) ? ficha.substitutes : []),
  ];
  const marcaCatalogo = marcaBuscada === "ULTRALITTON" ? "LITTON" : marcaBuscada;
  return entradas.filter((entrada) => {
    return mismaMarcaCatalogo(entrada.code, marcaCatalogo) && normalizarCodigo(entrada.value);
  }).map((entrada) => String(entrada.value).trim());
}

function seleccionarCodigoOficial(oficiales, marcaNormalizada) {
  const codigos = [...oficiales.values()];
  const sufijo = marcaNormalizada === "LITTON" ? "NA" : marcaNormalizada === "ULTRALITTON" ? "ULT" : "";
  if (!sufijo) return codigos.length === 1 ? codigos[0] : null;
  const variantes = codigos.map((item) => normalizarCodigo(item.codigo).match(/^(.+)(NA|ULT|XFR)$/));
  if (variantes.some((item) => !item) || new Set(variantes.map((item) => item[1])).size !== 1) return null;
  const preferidos = codigos.filter((item) => normalizarCodigo(item.codigo).endsWith(sufijo));
  return preferidos.length === 1 ? preferidos[0] : null;
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

function serializarEstable(valor) {
  if (Array.isArray(valor)) return `[${valor.map(serializarEstable).join(",")}]`;
  if (valor && typeof valor === "object") {
    if (valor instanceof Date) return `Date:${valor.toISOString()}`;
    if (Buffer.isBuffer(valor)) return `Buffer:${valor.toString("base64")}`;
    if (typeof valor.toHexString === "function") return `ObjectId:${valor.toHexString()}`;
    return `{${Object.keys(valor).sort().map(clave =>
      `${JSON.stringify(clave)}:${serializarEstable(valor[clave])}`).join(",")}}`;
  }
  return JSON.stringify(valor);
}

function camposMetadatosEnConflicto(documentos) {
  const predeterminados = {
    archivado: false,
    camposExtra: {},
    descripcion: "",
    equivalenciasCatalogo: [],
    equivalentesVinculados: [],
    foto: "",
    imagenLitton: "",
    precio: 0,
    schemaVersion: 1,
    titulo: "",
  };
  const variables = new Set([
    "_id", "codigo", "CODIGO", "marca", "MARCA", "stock", "STOCK", "ubicacion",
    "ubicacionPendiente", "createdAt", "updatedAt", "__v",
  ]);
  const campos = new Set(documentos.flatMap(producto => Object.keys(producto)));
  const conflictos = [];
  for (const campo of campos) {
    if (variables.has(campo)) continue;
    if (campo === "stockMinimo") {
      const porUbicacion = new Map();
      for (const producto of documentos) {
        const firma = serializarEstable(producto.stockMinimo ?? null);
        const valores = porUbicacion.get(producto.ubicacion) || new Set();
        valores.add(firma);
        porUbicacion.set(producto.ubicacion, valores);
      }
      if ([...porUbicacion.values()].some(valores => valores.size > 1)) conflictos.push(campo);
      continue;
    }
    const predeterminado = Object.prototype.hasOwnProperty.call(predeterminados, campo)
      ? predeterminados[campo] : null;
    const firmas = new Set(documentos.map(producto => {
      const valor = producto[campo];
      if (valor == null || serializarEstable(valor) === serializarEstable(predeterminado)) {
        return serializarEstable(predeterminado);
      }
      return serializarEstable(valor);
    }));
    if (firmas.size > 1) conflictos.push(campo);
  }
  return conflictos.sort();
}

function crearInforme(productos, catalogo) {
  if (!Array.isArray(productos) || !Array.isArray(catalogo)) {
    throw new Error("El inventario y el catálogo deben ser listas JSON.");
  }
  const fichasVistas = new Set();
  if (!catalogo.length || catalogo.some((ficha) => {
    if (!ficha || ficha.error || typeof ficha.code !== "string" || !normalizarCodigo(ficha.code)
      || typeof ficha.brand !== "string" || !normalizarCodigo(ficha.brand)
      || !Array.isArray(ficha.substitutes)
      || ficha.substitutes.some((item) => !item || typeof item.code !== "string" || !normalizarCodigo(item.code)
        || typeof item.value !== "string"
        || (!normalizarCodigo(item.value) && !["", "-"].includes(item.value.trim())))) return true;
    const key = normalizarCodigo(ficha.code);
    if (fichasVistas.has(key)) return true;
    fichasVistas.add(key);
    return false;
  })) {
    throw new Error("El catálogo contiene fichas inválidas o con errores; no se puede generar el informe.");
  }
  const fichasPorCodigo = new Map();
  for (const ficha of catalogo) {
    for (const referencia of new Set(referencias(ficha))) {
      if (!fichasPorCodigo.has(referencia)) fichasPorCodigo.set(referencia, []);
      fichasPorCodigo.get(referencia).push(ficha);
    }
  }
  const activos = productos.filter((producto) => producto && producto.archivado !== true);
  const pendientes = [];
  const candidatos = new Map();
  for (const producto of activos) {
    if (![producto.codigo, producto.CODIGO].some((value) =>
      /^PD[/ -]?[A-Z0-9]+$/i.test(String(value || "").trim()))) continue;
    const original = resumenDocumento(producto);
    if (producto.schemaVersion === 2 || !identificador(producto) || !marca(producto) || !datosStock(producto)) {
      pendientes.push({ producto: original, motivo: "Datos de producto, stock o ubicación no verificables." });
      continue;
    }
    if (producto.codigo && producto.CODIGO && normalizarCodigo(producto.codigo) !== normalizarCodigo(producto.CODIGO)) {
      pendientes.push({ producto: original, motivo: "Los campos de código son contradictorios." });
      continue;
    }
    if (producto.marca && producto.MARCA && identidadMarca(producto.marca) !== identidadMarca(producto.MARCA)) {
      pendientes.push({ producto: original, motivo: "Los campos de marca son contradictorios." });
      continue;
    }
    const codigoAnterior = normalizarCodigo(codigo(producto));
    const marcaNormalizada = identidadMarca(marca(producto));
    const fichas = fichasPorCodigo.get(codigoAnterior) || [];
    const oficiales = new Map();
    for (const ficha of fichas) {
      for (const valor of codigosDeMarca(ficha, marcaNormalizada)) {
        const key = normalizarCodigo(valor);
        if (!oficiales.has(key)) oficiales.set(key, { codigo: valor, fichas: [] });
        oficiales.get(key).fichas.push(ficha.code);
      }
    }
    const oficial = seleccionarCodigoOficial(oficiales, marcaNormalizada);
    if (!oficial) {
      const posiblesCoincidencias = activos.filter((candidato) =>
        candidato !== producto
        && candidato.schemaVersion !== 2
        && identidadMarca(marca(candidato)) === marcaNormalizada
        && fichas.some((ficha) => ficha.substitutes.some((item) =>
          coincideCodigoEspecial(candidato, { codigo: item.value, marca: item.code })))
      ).map(resumenDocumento);
      pendientes.push({
        producto: original,
        motivo: !oficiales.size ? "Sin código oficial verificable para la marca."
          : ["LITTON", "ULTRALITTON"].includes(marcaNormalizada)
            ? "No se pudo determinar el código de la variante correspondiente a la marca."
            : "Más de un código oficial posible para la marca.",
        codigosPosibles: [...oficiales.values()],
        fichas: fichas.map((ficha) => ficha.code),
        posiblesCoincidencias,
      });
      continue;
    }
    const key = `${marcaNormalizada}|${normalizarCodigo(oficial.codigo)}`;
    if (!candidatos.has(key)) candidatos.set(key, { codigoOficial: oficial.codigo, marca: marca(producto), fichas: new Set(), origenes: [] });
    const grupo = candidatos.get(key);
    oficial.fichas.forEach((ficha) => grupo.fichas.add(ficha));
    grupo.origenes.push(producto);
  }

  const propuestas = [];
  for (const grupo of candidatos.values()) {
    const marcaNormalizada = identidadMarca(grupo.marca);
    const codigoNormalizado = normalizarCodigo(grupo.codigoOficial);
    const codigoConMarca = `${marcaNormalizada}${codigoNormalizado}`;
    const coincideTrwEspecial = (producto) => marcaNormalizada === "TRW"
      && coincideCodigoEspecial(producto, { codigo: grupo.codigoOficial, marca: grupo.marca });
    const destinos = activos.filter((producto) =>
      producto.schemaVersion !== 2
      && ([producto.codigo, producto.CODIGO].some((value) =>
        [codigoNormalizado, codigoConMarca].includes(normalizarCodigo(value))) || coincideTrwEspecial(producto))
      && [producto.marca, producto.MARCA].some((value) => identidadMarca(value) === marcaNormalizada)
      && !grupo.origenes.includes(producto)
    );
    const versionesDos = activos.filter((producto) =>
      producto.schemaVersion === 2
      && (producto.variantes || []).some((variante) => identidadMarca(variante.marca) === marcaNormalizada)
      && [codigo(producto), ...(producto.equivalenciasCatalogo || []).filter((item) =>
        identidadMarca(item.marca) === marcaNormalizada).map((item) => item.codigo)]
        .some((value) => normalizarCodigo(value) === codigoNormalizado)
    );
    const documentos = [...new Set([...grupo.origenes, ...destinos])];
    const motivos = [];
    if (documentos.some((producto) => !identificador(producto) || !datosStock(producto))) {
      motivos.push("Identificador, stock o ubicación no verificables.");
    }
    if (documentos.some((producto) =>
      (producto.codigo && producto.CODIGO && normalizarCodigo(producto.codigo) !== normalizarCodigo(producto.CODIGO))
      || (producto.marca && producto.MARCA && identidadMarca(producto.marca) !== identidadMarca(producto.MARCA))
    )) motivos.push("Campos de código o marca contradictorios.");
    if (versionesDos.length) motivos.push("Posible coincidencia con producto de variantes: requiere revisión.");
    if (destinos.some((producto) => [producto.codigo, producto.CODIGO]
      .some((value) => normalizarCodigo(value) === codigoConMarca))) {
      motivos.push("Código con prefijo de marca: confirmar que es la misma pieza.");
    }
    if (destinos.some(coincideTrwEspecial)) {
      motivos.push("Código TRW abreviado: confirmar que es la misma pieza.");
    }
    const metadatosEnConflicto = {};
    for (const campo of camposMetadatosEnConflicto(documentos)) {
      motivos.push(`Diferencias en ${campo}.`);
      metadatosEnConflicto[campo] = documentos.map((producto) => ({
        id: identificador(producto),
        valor: producto[campo] ?? null,
      }));
    }
    const totales = { NEGOCIO: 0, DEPOSITO_GALPON: 0 };
    for (const producto of documentos) {
      const stock = datosStock(producto);
      if (stock) totales[stock.ubicacion] += stock.cantidad;
    }
    const stockIncompleto = documentos.some((producto) => !datosStock(producto)) || versionesDos.length > 0;
    propuestas.push({
      marca: grupo.marca,
      codigoOficial: grupo.codigoOficial,
      fichas: [...grupo.fichas].sort(),
      evidencia: catalogo.filter((ficha) => grupo.fichas.has(ficha.code)).map((ficha) => ({
        codigo: ficha.code,
        marca: ficha.brand,
        equivalencias: ficha.substitutes,
      })),
      documentos: documentos.map(resumenDocumento),
      posiblesProductosConVariantes: versionesDos.map(resumenDocumento),
      stockPorUbicacionAntes: totales,
      stockTotalAntes: totales.NEGOCIO + totales.DEPOSITO_GALPON,
      stockPorUbicacionPropuesto: stockIncompleto ? null : { ...totales },
      stockTotalPropuesto: stockIncompleto ? null : totales.NEGOCIO + totales.DEPOSITO_GALPON,
      stockIncompleto,
      metadatosEnConflicto,
      requiereRevision: motivos,
    });
  }
  const gruposPorDocumento = new Map();
  for (const propuesta of propuestas) {
    for (const documento of propuesta.documentos) {
      if (!documento.id) continue;
      if (!gruposPorDocumento.has(documento.id)) gruposPorDocumento.set(documento.id, []);
      gruposPorDocumento.get(documento.id).push(propuesta);
    }
  }
  for (const grupos of gruposPorDocumento.values()) {
    if (grupos.length < 2) continue;
    for (const grupo of grupos) {
      const motivo = "Un documento aparece en varias propuestas; revisar la identidad de la pieza.";
      if (!grupo.requiereRevision.includes(motivo)) grupo.requiereRevision.push(motivo);
    }
  }
  return {
    modo: "SIMULACION: no modifica datos",
    propuestas,
    pendientes: pendientes.map((item) => ({ ...item, accion: "conservar_sin_cambios" })),
  };
}

module.exports = { crearInforme, camposMetadatosEnConflicto };
