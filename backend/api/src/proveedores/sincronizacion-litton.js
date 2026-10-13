const { normalizarCodigo } = require("./familia-inventario");

function codigoProducto(producto) {
  return String(producto.codigo || producto.CODIGO || "").trim();
}

function extraerSemillaInterna(producto) {
  const match = codigoProducto(producto).match(/^RF[-/]?([A-Z0-9]+)$/i);
  if (!match) return null;
  const sufijo = normalizarCodigo(match[1]);
  if (!sufijo) return null;
  return { codigo: codigoProducto(producto), sufijo, codigoLitton: `PD/${sufijo}` };
}

function aliasesDeFicha(detalle) {
  const aliases = new Map();
  const agregar = (codigo, marca) => {
    const value = String(codigo ?? "").trim();
    if (!value) return;
    const normalized = normalizarCodigo(value);
    if (!normalized || aliases.has(normalized)) return;
    aliases.set(normalized, {
      codigo: value,
      marca: String(marca ?? "").trim(),
      productoLitton: String(detalle.code ?? "").trim(),
    });
  };

  agregar(detalle.code, detalle.subcategory || "LITTON");
  for (const substitute of Array.isArray(detalle.substitutes) ? detalle.substitutes : []) {
    agregar(substitute.value, substitute.code);
  }
  return [...aliases.values()];
}

function detalleContieneCodigo(detalle, codigo) {
  const target = normalizarCodigo(codigo);
  return (Array.isArray(detalle.substitutes) ? detalle.substitutes : [])
    .some((item) => normalizarCodigo(item.value) === target);
}

function construirFamilias(rows, catalogDetails, seedsIncompletas = new Set()) {
  const families = new Map();
  const seeds = new Map();

  for (const row of rows) {
    const seed = extraerSemillaInterna(row);
    if (!seed) continue;
    const key = normalizarCodigo(seed.codigo);
    if (!seeds.has(key)) seeds.set(key, seed);
  }

  for (const seed of seeds.values()) {
    const key = normalizarCodigo(seed.codigoLitton);
    if (seedsIncompletas.has(normalizarCodigo(seed.codigo))) continue;
    const matches = catalogDetails.filter(({ detail }) =>
      detail && detalleContieneCodigo(detail, seed.codigoLitton)
    );
    if (!matches.length) continue;

    const aliases = new Map();
    for (const { detail } of matches) {
      for (const alias of aliasesDeFicha(detail)) {
        const aliasKey = normalizarCodigo(alias.codigo);
        if (!aliases.has(aliasKey)) aliases.set(aliasKey, alias);
      }
    }
    families.set(key, {
      id: key,
      seeds: new Set([key]),
      aliases,
    });
  }

  const components = [];
  for (const family of families.values()) {
    const component = {
      seeds: new Set(family.seeds),
      aliases: new Map(family.aliases),
    };
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = components.length - 1; i >= 0; i--) {
        const current = components[i];
        if (![...component.aliases.keys()].some((alias) => current.aliases.has(alias))) continue;
        components.splice(i, 1);
        for (const seed of current.seeds) component.seeds.add(seed);
        for (const [alias, value] of current.aliases) {
          if (!component.aliases.has(alias)) component.aliases.set(alias, value);
        }
        merged = true;
      }
    }
    components.push(component);
  }
  return components.map((component) => {
    const seedCodes = [...component.seeds].sort();
    return {
      id: seedCodes[0],
      seedCodes,
      aliases: [...component.aliases.values()],
    };
  });
}

function familiasCandidatas(producto, familias) {
  const candidateFamilies = new Set();
  const productCode = normalizarCodigo(codigoProducto(producto));

  for (const family of familias) {
    const aliases = new Set(family.aliases.map((item) => normalizarCodigo(item.codigo)));
    if (aliases.has(productCode)) {
      candidateFamilies.add(family.id);
      continue;
    }

    const seed = extraerSemillaInterna(producto);
    if (seed && family.seedCodes.includes(normalizarCodigo(seed.codigoLitton))) {
      candidateFamilies.add(family.id);
    }
  }
  return [...candidateFamilies];
}

function armarEquivalenciasCatalogo(productos, familias) {
  const familyById = new Map(familias.map((family) => [family.id, family]));
  const results = productos.map((producto) => {
    const matches = familiasCandidatas(producto, familias);
    if (matches.length !== 1) {
      return {
        id: String(producto._id),
        codigo: codigoProducto(producto),
        marca: String(producto.marca || producto.MARCA || ""),
        matches,
        aliases: [],
      };
    }
    const family = familyById.get(matches[0]);
    return {
      id: String(producto._id),
      codigo: codigoProducto(producto),
      marca: String(producto.marca || producto.MARCA || ""),
      matches,
      aliases: family.aliases,
    };
  });

  return {
    results,
    ambiguos: results.filter((item) => item.matches.length > 1),
    familias: familyById.size,
  };
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function sincronizarFamiliasLitton(productos, {
  buscarLitton,
  obtenerDetalle,
  onProgress = () => {},
  concurrency = 3,
}) {
  const seeds = new Map();
  for (const producto of productos) {
    const seed = extraerSemillaInterna(producto);
    if (seed) seeds.set(normalizarCodigo(seed.codigo), seed);
  }
  const seedList = [...seeds.values()];
  const errors = [];
  let searched = 0;

  const searchResults = await mapConcurrent(seedList, concurrency, async (seed) => {
    try {
      const items = await buscarLitton(seed.codigoLitton);
      return { seed, items, searchError: "" };
    } catch (error) {
      errors.push({ codigo: seed.codigo, error: error.message || String(error) });
      return { seed, items: [], searchError: error.message || String(error) };
    } finally {
      searched++;
      onProgress({ stage: "search", processed: searched, total: seedList.length });
    }
  });

  const uniqueCatalogCodes = new Map();
  for (const result of searchResults) {
    for (const item of result.items) {
      const code = String(item.codigo || "").trim();
      const key = normalizarCodigo(code);
      if (key && !uniqueCatalogCodes.has(key)) uniqueCatalogCodes.set(key, code);
    }
  }

  let detailed = 0;
  const detailCodes = [...uniqueCatalogCodes.values()];
  const detailResults = await mapConcurrent(detailCodes, concurrency, async (code) => {
    try {
      const detail = await obtenerDetalle(code);
      if (normalizarCodigo(detail.code) !== normalizarCodigo(code)) {
        throw new Error(`La ficha Litton de ${code} devolvió el código ${detail.code || "vacío"}.`);
      }
      return { detail, error: "" };
    } catch (error) {
      errors.push({ codigo: code, error: error.message || String(error) });
      return { detail: null, error: error.message || String(error) };
    } finally {
      detailed++;
      onProgress({ stage: "details", processed: detailed, total: detailCodes.length });
    }
  });

  const detailByCode = new Map();
  [...uniqueCatalogCodes.keys()].forEach((code, index) => {
    detailByCode.set(code, detailResults[index]);
  });
  const seedsIncompletas = new Set();
  for (const result of searchResults) {
    if (result.searchError || result.items.some((item) => {
      const detailResult = detailByCode.get(normalizarCodigo(item.codigo));
      return !detailResult || !detailResult.detail;
    })) {
      seedsIncompletas.add(normalizarCodigo(result.seed.codigo));
    }
  }
  const catalogDetails = detailResults.map(({ detail }) => ({ detail }));
  const families = construirFamilias(productos, catalogDetails, seedsIncompletas);
  const mappings = armarEquivalenciasCatalogo(productos, families);
  const matchedIds = new Set(mappings.results.filter((item) => item.aliases.length).map((item) => item.id));
  const summary = {
    productosRevisados: productos.length,
    familiasLitton: families.length,
    productosVinculados: matchedIds.size,
    codigosRFConsultados: seedList.length,
    codigosRFEncontrados: new Set(families.flatMap((family) => family.seedCodes)).size,
    ambiguos: mappings.ambiguos.length,
    sinCoincidencia: Math.max(0, productos.length - matchedIds.size - mappings.ambiguos.length),
    errores: errors.length,
    detalleErrores: errors.slice(0, 20),
    detalleAmbiguos: mappings.ambiguos.slice(0, 20).map(({ codigo, marca, matches }) => ({
      codigo,
      marca,
      familias: matches,
    })),
  };

  return {
    equivalenciasPorId: new Map(
      mappings.results
        .filter((item) => item.aliases.length > 0)
        .map((item) => [item.id, item.aliases])
    ),
    summary,
  };
}

module.exports = {
  aliasesDeFicha,
  armarEquivalenciasCatalogo,
  construirFamilias,
  extraerSemillaInterna,
  sincronizarFamiliasLitton,
};
