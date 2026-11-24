function normalizarCodigo(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizarMarca(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function identidadMarca(value) {
  const marca = normalizarMarca(value);
  if (marca === "LITON") return "LITTON";
  if (marca === "ULTRALITON") return "ULTRALITTON";
  if (["TRWBRASIL", "TRWEXPO"].includes(marca)) return "TRW";
  return marca;
}

function mismaMarcaCatalogo(primera, segunda) {
  const a = identidadMarca(primera);
  const b = identidadMarca(segunda);
  return Boolean(a && b && a === b);
}

function aliasesFicha(ficha) {
  const aliases = [];
  const add = (codigo, marca) => {
    const value = String(codigo ?? "").trim();
    const key = normalizarCodigo(value);
    if (!key) return;
    aliases.push({ codigo: value, key, marca: String(marca ?? "").trim() });
  };
  add(ficha?.code, ficha?.brand || ficha?.subcategory || "LITTON");
  for (const substitute of Array.isArray(ficha?.substitutes) ? ficha.substitutes : []) {
    add(substitute?.value, substitute?.code);
  }
  return [...new Map(aliases.map((item) => [`${item.key}|${normalizarMarca(item.marca)}`, item])).values()];
}

function firmaFicha(ficha) {
  const substitutes = (Array.isArray(ficha?.substitutes) ? ficha.substitutes : [])
    .map((item) => `${normalizarMarca(item?.code)}:${normalizarCodigo(item?.value)}`)
    .filter((item) => !item.endsWith(":"))
    .sort();
  if (!substitutes.length) return "";
  return [
    String(ficha?.name ?? "").trim().toUpperCase(),
    normalizarMarca(ficha?.brand || ficha?.subcategory),
    String(ficha?.category ?? "").trim().toUpperCase(),
    substitutes.join("|"),
  ].join("::");
}

function materializarGrupo(fichas) {
  const items = [...new Map(fichas.map((item) => [normalizarCodigo(item.code), item])).values()];
  const aliases = [...new Map(items.flatMap(aliasesFicha)
    .map((item) => [`${item.key}|${normalizarMarca(item.marca)}`, item])).values()];
  return {
    fichas: items,
    aliases,
    codigos: new Set(aliases.map((item) => item.key)),
    paresAlias: new Set(aliases.map((item) => `${item.key}|${normalizarMarca(item.marca)}`)),
    categorias: new Set(items.map((item) => String(item.category ?? "").trim().toUpperCase())),
  };
}

function gruposFuertementeEquivalentes(a, b) {
  if (a.categorias.size !== 1 || b.categorias.size !== 1 || [...a.categorias][0] !== [...b.categorias][0]) return false;
  const menores = Math.min(a.codigos.size, b.codigos.size);
  if (!menores) return false;
  let comunes = 0;
  for (const codigo of a.codigos) if (b.codigos.has(codigo)) comunes++;
  const paresComunes = [...a.paresAlias].filter((pair) => b.paresAlias.has(pair));
  const marcasComunes = new Set(paresComunes.map((pair) => pair.split("|")[1]));
  return comunes / menores >= 0.8 && paresComunes.length >= 2 && marcasComunes.size >= 2;
}

function crearIndiceCatalogo(fichas) {
  if (!Array.isArray(fichas)) throw new Error("El catálogo activo de pastillas no contiene una lista de fichas.");
  const gruposPorFirma = new Map();
  for (const ficha of fichas) {
    if (!normalizarCodigo(ficha?.code)) continue;
    const signature = firmaFicha(ficha);
    const groupingKey = signature ? `firma:${signature}` : `codigo:${normalizarCodigo(ficha.code)}`;
    if (!gruposPorFirma.has(groupingKey)) gruposPorFirma.set(groupingKey, []);
    gruposPorFirma.get(groupingKey).push(ficha);
  }

  const gruposBase = [...gruposPorFirma.values()].map((items) => materializarGrupo(items));
  const grupos = [];
  const gruposActivos = new Set();
  const gruposPorParAlias = new Map();
  const registrar = (grupo) => {
    for (const pair of grupo.paresAlias) {
      if (!gruposPorParAlias.has(pair)) gruposPorParAlias.set(pair, new Set());
      gruposPorParAlias.get(pair).add(grupo);
    }
  };
  for (const grupo of gruposBase) {
    const candidatos = new Set();
    for (const pair of grupo.paresAlias) {
      for (const actual of gruposPorParAlias.get(pair) || []) {
        if (gruposActivos.has(actual)) candidatos.add(actual);
      }
    }
    const compatibles = [...candidatos].filter((actual) => gruposFuertementeEquivalentes(actual, grupo));
    if (compatibles.length === 1) {
      const actual = compatibles[0];
      grupos.splice(grupos.indexOf(actual), 1);
      gruposActivos.delete(actual);
      const combinado = materializarGrupo([...actual.fichas, ...grupo.fichas]);
      grupos.push(combinado);
      gruposActivos.add(combinado);
      registrar(combinado);
    } else {
      grupos.push(grupo);
      gruposActivos.add(grupo);
      registrar(grupo);
    }
  }

  const catalogo = grupos.map((grupo) => {
    const fichasDelGrupo = grupo.fichas;
    const aliases = grupo.aliases;
    const codigo = fichasDelGrupo
      .sort((a, b) =>
        (Array.isArray(b.substitutes) ? b.substitutes.length : 0)
          - (Array.isArray(a.substitutes) ? a.substitutes.length : 0)
        || String(a.code).localeCompare(String(b.code), "es", { numeric: true, sensitivity: "base" })
      )[0].code.trim();
    return {
      id: normalizarCodigo(codigo),
      codigo,
      fichas: fichasDelGrupo,
      ficha: fichasDelGrupo.find((item) => String(item.code).trim() === codigo) || fichasDelGrupo[0],
      aliases,
      equivalenciasCatalogo: aliases.map((item) => ({
        codigo: item.codigo,
        marca: item.marca,
        productoLitton: codigo,
      })),
    };
  });

  const porCodigo = new Map();
  const porCodigoLitton = new Map();
  for (const grupo of catalogo) {
    for (const ficha of grupo.fichas) {
      const codigoLitton = normalizarCodigo(ficha.code);
      if (!porCodigoLitton.has(codigoLitton)) porCodigoLitton.set(codigoLitton, new Set());
      porCodigoLitton.get(codigoLitton).add(grupo.id);
    }
    for (const alias of grupo.aliases) {
      if (!porCodigo.has(alias.key)) porCodigo.set(alias.key, new Set());
      porCodigo.get(alias.key).add(grupo.id);
    }
  }
  return {
    grupos: catalogo,
    porCodigo,
    porCodigoLitton,
    grupoPorId: new Map(catalogo.map((item) => [item.id, item])),
  };
}

function aliasesProducto(producto) {
  const values = [
    producto.codigo,
    producto.CODIGO,
    ...(Array.isArray(producto.codigosAnteriores) ? producto.codigosAnteriores : []),
    producto.fichaLitton?.code,
    ...(Array.isArray(producto.fichaLitton?.substitutes)
      ? producto.fichaLitton.substitutes.map((item) => item?.value)
      : []),
    ...(Array.isArray(producto.equivalenciasCatalogo)
      ? producto.equivalenciasCatalogo.map((item) => item?.codigo)
      : []),
  ];
  return [...new Set(values.map(normalizarCodigo).filter(Boolean))];
}

function marcaCompatible(marcaProducto, marcaCatalogo, codigo) {
  const productBrand = identidadMarca(marcaProducto);
  const catalogBrand = identidadMarca(marcaCatalogo);
  return !productBrand || !catalogBrand || productBrand === catalogBrand
    || (productBrand === "ULTRALITTON" && catalogBrand === "LITTON" && normalizarCodigo(codigo).endsWith("ULT"));
}

function esCodigoPdGenerico(codigo) {
  return /^PD[A-Z0-9]+$/.test(normalizarCodigo(codigo));
}

function familiasProducto(producto, indice) {
  const candidatos = new Set();
  const agregarCodigo = (codigo, marcaProducto = "") => {
    const key = normalizarCodigo(codigo);
    if (!key) return;
    const ids = indice.porCodigo.get(key);
    if (ids) {
      if (ids.size !== 1) return;
      const id = [...ids][0];
      const grupo = indice.grupoPorId.get(id);
      const aliases = grupo?.aliases.filter((item) => item.key === key) || [];
      if (esCodigoPdGenerico(key) || aliases.some((item) => marcaCompatible(marcaProducto, item.marca, item.codigo))) {
        candidatos.add(id);
      }
      return;
    }
    const marca = identidadMarca(marcaProducto);
    if (!marca) return;
    const posibles = new Set();
    if (key.startsWith(marca) && key.length > marca.length) posibles.add(key.slice(marca.length));
    const trw = marca === "TRW" && key.match(/^TRW([A-Z0-9]+)$/);
    if (trw) posibles.add(`RCPT${trw[1]}`);
    const encontrados = new Set();
    for (const posible of posibles) {
      const grupos = indice.porCodigo.get(posible);
      if (!grupos) continue;
      if (grupos.size !== 1) return;
      const id = [...grupos][0];
      const grupo = indice.grupoPorId.get(id);
      if (grupo?.aliases.some(alias => alias.key === posible && mismaMarcaCatalogo(marcaProducto, alias.marca))) {
        encontrados.add(id);
      }
    }
    if (encontrados.size === 1) candidatos.add([...encontrados][0]);
  };

  agregarCodigo(producto.codigo || producto.CODIGO, producto.marca || producto.MARCA);
  for (const oldCode of Array.isArray(producto.codigosAnteriores) ? producto.codigosAnteriores : []) {
    agregarCodigo(oldCode, producto.marca || producto.MARCA);
  }
  if (producto.fichaLitton?.code) {
    const ids = indice.porCodigoLitton.get(normalizarCodigo(producto.fichaLitton.code));
    if (ids?.size === 1) candidatos.add([...ids][0]);
  }
  for (const equivalencia of Array.isArray(producto.equivalenciasCatalogo) ? producto.equivalenciasCatalogo : []) {
    const littonIds = indice.porCodigoLitton.get(normalizarCodigo(equivalencia?.productoLitton));
    if (littonIds?.size === 1) {
      candidatos.add([...littonIds][0]);
      continue;
    }
    agregarCodigo(equivalencia?.codigo, equivalencia?.marca || producto.marca || producto.MARCA);
  }
  for (const alias of aliasesProducto(producto)) {
    if (alias === normalizarCodigo(producto.codigo || producto.CODIGO)) continue;
    agregarCodigo(alias, producto.marca || producto.MARCA);
  }
  return candidatos;
}

function filaInventario(producto, variante) {
  const stock = variante ? variante.cantidad : (producto.stock ?? producto.STOCK);
  const location = variante
    ? variante.ubicacion
    : producto.ubicacionPendiente ? undefined : producto.ubicacion;
  const ubicacionValida = location === "NEGOCIO" || location === "DEPOSITO_GALPON";
  return {
    _id: String(producto._id),
    ...(variante?._id ? { varianteId: String(variante._id) } : {}),
    ...(variante ? { schemaVersion: 2 } : {}),
    codigo: String(producto.codigo || producto.CODIGO || producto.fichaLitton?.code || ""),
    marca: String(variante?.marca || producto.marca || producto.MARCA || ""),
    ...(stock !== undefined && stock !== null ? { stock } : {}),
    ...(ubicacionValida ? { ubicacion: location } : {}),
    ...(producto.categoria ? { categoria: producto.categoria } : {}),
    ...(variante?.stockMinimo !== undefined
      ? { stockMinimo: variante.stockMinimo }
      : producto.stockMinimo !== undefined ? { stockMinimo: producto.stockMinimo } : {}),
  };
}

function totalizar(filas) {
  const totales = { NEGOCIO: 0, DEPOSITO_GALPON: 0, total: 0 };
  for (const fila of filas) {
    const stock = Number(fila.stock);
    if (!Number.isFinite(stock)) continue;
    if (fila.ubicacion === "NEGOCIO" || fila.ubicacion === "DEPOSITO_GALPON") {
      totales[fila.ubicacion] += stock;
    } else {
      totales.SIN_UBICACION = (totales.SIN_UBICACION || 0) + stock;
    }
    totales.total += stock;
  }
  return totales;
}

function idsFamiliaPorBusqueda(query, indice) {
  const codigo = normalizarCodigo(query);
  if (!codigo) return { ids: null, ambiguo: false };
  const exactos = indice.porCodigo.get(codigo);
  if (exactos) return { ids: exactos, ambiguo: exactos.size !== 1 };
  if (!/^\d+$/.test(codigo)) return { ids: null, ambiguo: false };
  const prefijados = indice.porCodigo.get(`PD${codigo}`);
  return prefijados
    ? { ids: prefijados, ambiguo: prefijados.size !== 1 }
    : { ids: null, ambiguo: false };
}

function resolverGrupoCatalogo(query, fichas) {
  const codigo = normalizarCodigo(query);
  if (!codigo) return null;
  const indice = crearIndiceCatalogo(fichas);
  const resultado = idsFamiliaPorBusqueda(codigo, indice);
  if (resultado.ambiguo || resultado.ids?.size !== 1) return null;
  return indice.grupoPorId.get([...resultado.ids][0]) || null;
}

function resolverFamiliasCatalogo(query, productos, fichas) {
  const indice = crearIndiceCatalogo(fichas);
  const codigoBuscado = normalizarCodigo(query);
  if (!codigoBuscado) return [];

  const codigoFamilia = idsFamiliaPorBusqueda(codigoBuscado, indice);
  if (codigoFamilia.ambiguo) return [];
  const idsIniciales = new Set(codigoFamilia.ids || []);
  const familiasPorProducto = new Map();

  for (const producto of productos) {
    familiasPorProducto.set(String(producto._id), familiasProducto(producto, indice));
    if (aliasesProducto(producto).includes(codigoBuscado)) {
      for (const id of familiasPorProducto.get(String(producto._id))) idsIniciales.add(id);
    }
  }

  const familias = [];
  for (const idFamilia of idsIniciales) {
    const familia = indice.grupoPorId.get(idFamilia);
    if (!familia) continue;
    const incluidos = new Set();
    const pendientes = [];
    for (const producto of productos) {
      const asociaciones = familiasPorProducto.get(String(producto._id));
      if (asociaciones.size === 1 && asociaciones.has(idFamilia)) pendientes.push(String(producto._id));
    }
    const porId = new Map(productos.map((item) => [String(item._id), item]));

    while (pendientes.length) {
      const idProducto = pendientes.pop();
      if (incluidos.has(idProducto)) continue;
      const producto = porId.get(idProducto);
      if (!producto) continue;
      const asociaciones = familiasPorProducto.get(idProducto);
      if (asociaciones.size > 1 || (asociaciones.size === 1 && !asociaciones.has(idFamilia))) continue;
      incluidos.add(idProducto);
      for (const vinculado of producto.equivalentesVinculados || []) {
        const vinculadoId = String(vinculado?._id || vinculado);
        const vinculadoProducto = porId.get(vinculadoId);
        if (vinculadoProducto) pendientes.push(vinculadoId);
      }
    }

    const filas = [];
    for (const idProducto of incluidos) {
      const producto = porId.get(idProducto);
      if (producto.schemaVersion === 2) {
        for (const variante of Array.isArray(producto.variantes) ? producto.variantes : []) {
          filas.push(filaInventario(producto, variante));
        }
      } else {
        filas.push(filaInventario(producto));
      }
    }
    filas.sort((a, b) =>
      a.codigo.localeCompare(b.codigo, "es", { numeric: true, sensitivity: "base" })
      || a.marca.localeCompare(b.marca, "es", { sensitivity: "base" })
      || String(a.ubicacion || "").localeCompare(String(b.ubicacion || ""))
    );
    if (!filas.length) continue;
    familias.push({
      id: [...incluidos].sort()[0],
      filas,
      totales: totalizar(filas),
      fichaLitton: familia.ficha,
      equivalenciasCatalogo: familia.equivalenciasCatalogo,
      imagenLitton: familia.ficha?.image || "",
    });
  }
  return familias;
}

module.exports = {
  aliasesFicha,
  crearIndiceCatalogo,
  identidadMarca,
  mismaMarcaCatalogo,
  normalizarCodigo,
  resolverGrupoCatalogo,
  resolverFamiliasCatalogo,
};
