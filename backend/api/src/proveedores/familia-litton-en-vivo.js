const { normalizarCodigo, resolverFamiliaInventario } = require("./familia-inventario");

function normalizarMarca(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function marcaBase(value) {
  return String(value ?? "").trim().toUpperCase().split(/[^A-Z0-9]+/)[0];
}

function codigoProducto(producto) {
  return String(producto.codigo || producto.CODIGO || "").trim();
}

function aliasesDeFicha(detalle) {
  const aliases = new Map();
  const agregar = (codigo, marca) => {
    const value = String(codigo ?? "").trim();
    const key = normalizarCodigo(value);
    if (!key || aliases.has(key)) return;
    aliases.set(key, {
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

function fichaConfirmaBusqueda(detalle, codigoBuscado) {
  const target = normalizarCodigo(codigoBuscado);
  if (!target) return false;
  if (normalizarCodigo(detalle.code) === target) return true;
  return (Array.isArray(detalle.substitutes) ? detalle.substitutes : [])
    .some((item) => normalizarCodigo(item.value) === target);
}

function coincideCodigoEspecial(producto, alias) {
  const codigo = normalizarCodigo(codigoProducto(producto));
  const codigoAlias = normalizarCodigo(alias.codigo);
  const marcaProducto = normalizarMarca(producto.marca || producto.MARCA);
  const marcaAlias = normalizarMarca(alias.marca);

  const internoRf = codigo.match(/^RF([A-Z0-9]+)$/);
  const aliasPd = codigoAlias.match(/^PD([A-Z0-9]+)$/);
  if (internoRf && aliasPd && internoRf[1] === aliasPd[1]) return true;

  const internoTrw = codigo.match(/^TRW([A-Z0-9]+)$/);
  const aliasRcpt = codigoAlias.match(/^RCPT([A-Z0-9]+)$/);
  return Boolean(
    internoTrw
    && aliasRcpt
    && internoTrw[1] === aliasRcpt[1]
    && marcaProducto.startsWith("TRW")
    && marcaAlias.startsWith("TRW")
  );
}

function coincideAliasOficial(producto, alias) {
  const codeMatches = normalizarCodigo(alias.codigo) === normalizarCodigo(codigoProducto(producto));
  if (codeMatches) {
    const productoMarca = marcaBase(producto.marca || producto.MARCA);
    const aliasMarca = marcaBase(alias.marca);
    return !productoMarca || !aliasMarca || productoMarca === aliasMarca;
  }
  return coincideCodigoEspecial(producto, alias);
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

async function resolverFamiliasLittonEnVivo(query, inventario, {
  buscarLitton,
  obtenerDetalle,
  concurrency = 6,
}) {
  let resultados;
  try {
    resultados = await buscarLitton(query);
  } catch (error) {
    return {
      familias: [],
      matchedIds: [],
      error: error.message || "Litton no pudo completar la búsqueda.",
    };
  }
  if (!Array.isArray(resultados)) {
    return {
      familias: [],
      matchedIds: [],
      error: "Litton devolvió una respuesta de búsqueda inválida.",
    };
  }

  const errores = [];
  const details = await mapConcurrent(resultados, concurrency, async (item) => {
    let detalle;
    try {
      detalle = await obtenerDetalle(item.codigo);
    } catch (error) {
      errores.push(`${item.codigo || "Producto Litton"}: ${error.message || String(error)}`);
      return null;
    }
    if (normalizarCodigo(detalle?.code) !== normalizarCodigo(item.codigo)) {
      errores.push(`${item.codigo || "Producto Litton"}: La ficha Litton devolvió otro código.`);
      return null;
    }
    const codigoBuscado = item.busquedaUsada || query;
    if (!fichaConfirmaBusqueda(detalle, codigoBuscado)) return null;
    return { item, detalle };
  });

  const familias = [];
  for (const result of details) {
    if (!result) continue;
    const aliases = aliasesDeFicha(result.detalle);
    const aliasesByCode = new Map(aliases.map((alias) => [normalizarCodigo(alias.codigo), alias]));
    const initialIds = inventario
      .filter((producto) => aliases.some((alias) => coincideAliasOficial(producto, alias)))
      .map((producto) => String(producto._id));
    const familia = resolverFamiliaInventario(inventario, [], {
      initialCodes: aliases.map((alias) => alias.codigo),
      initialIds,
      allowCodeMatch: (producto, code) => {
        const officialAlias = aliasesByCode.get(code);
        const productCode = normalizarCodigo(codigoProducto(producto));
        if (officialAlias && productCode === code) {
          return coincideAliasOficial(producto, officialAlias);
        }
        if (/^TRW[A-Z0-9]+$/.test(code) && productCode === code) {
          return normalizarMarca(producto.marca || producto.MARCA).startsWith("TRW");
        }
        return true;
      },
    });
    if (familia.filas.length) familias.push(familia);
  }

  const merged = [];
  for (const familia of familias) {
    const rows = new Map(familia.filas.map((row) => [row._id, row]));
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = merged.length - 1; index >= 0; index--) {
        if (!merged[index].filas.some((row) => rows.has(row._id))) continue;
        const [overlap] = merged.splice(index, 1);
        for (const row of overlap.filas) rows.set(row._id, row);
        changed = true;
      }
    }
    const rowsList = [...rows.values()].sort((a, b) =>
      a.codigo.localeCompare(b.codigo, "es", { numeric: true, sensitivity: "base" })
      || a.marca.localeCompare(b.marca, "es", { sensitivity: "base" })
    );
    const totales = rowsList.reduce((totals, row) => {
      const stock = Number(row.stock);
      if (!Number.isFinite(stock)) return totals;
      totals[row.ubicacion] += stock;
      totals.total += stock;
      return totals;
    }, { NEGOCIO: 0, DEPOSITO_GALPON: 0, total: 0 });
    merged.push({
      id: rowsList.map((row) => row._id).sort()[0],
      filas: rowsList,
      totales,
    });
  }

  return {
    familias: merged,
    matchedIds: [...new Set(merged.flatMap((family) => family.filas.map((row) => row._id)))],
    error: errores.length
      ? `${errores.slice(0, 3).join(" · ")}${errores.length > 3 ? ` · y ${errores.length - 3} error(es) más` : ""}`
      : "",
  };
}

module.exports = {
  aliasesDeFicha,
  coincideCodigoEspecial,
  fichaConfirmaBusqueda,
  normalizarMarca,
  resolverFamiliasLittonEnVivo,
};
