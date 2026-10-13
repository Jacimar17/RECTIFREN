function normalizarCodigo(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[-/]/g, "");
}

function extraerEquivalencias(detalle) {
  const equivalencias = new Map();
  const agregar = (codigo, marca = "") => {
    const value = String(codigo ?? "").trim();
    const key = normalizarCodigo(value);
    if (!key || equivalencias.has(key)) return;
    equivalencias.set(key, { codigo: value, marca: String(marca ?? "").trim() });
  };

  agregar(detalle.code, detalle.subcategory || "LITTON");
  for (const item of Array.isArray(detalle.substitutes) ? detalle.substitutes : []) {
    agregar(item?.value, item?.code);
  }
  return [...equivalencias.values()];
}

function codigosEquivalencia(item) {
  const entries = Array.isArray(item.equivalencias) ? item.equivalencias : [item.equivalencias];
  return entries.flatMap((entry) => {
    const value = entry && typeof entry === "object"
      ? entry.codigo || entry.code || entry.value
      : entry;
    return String(value ?? "").split(/[,;\n|]+/).map(normalizarCodigo).filter(Boolean);
  });
}

function coincideEquivalencia(item, codigo) {
  const buscado = normalizarCodigo(codigo);
  if (!buscado) return false;
  return normalizarCodigo(item.codigo) === buscado || codigosEquivalencia(item).includes(buscado);
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

async function buscarFamiliaLitton(codigoLitton, {
  obtenerDetalleLitton,
  buscarAimar,
  buscarAtonor,
  concurrency = 4,
}) {
  const detalle = await obtenerDetalleLitton(codigoLitton);
  if (normalizarCodigo(detalle?.code) !== normalizarCodigo(codigoLitton)) {
    throw new Error(`La ficha Litton de ${codigoLitton} devolvió otro código.`);
  }

  const equivalencias = extraerEquivalencias(detalle);
  if (!equivalencias.length) {
    throw new Error(`La ficha Litton de ${codigoLitton} no informa códigos para consultar.`);
  }

  const tareas = equivalencias.flatMap((equivalencia) => [
    { proveedor: "Aimar", codigo: equivalencia.codigo, buscar: buscarAimar },
    { proveedor: "ATONOR", codigo: equivalencia.codigo, buscar: buscarAtonor },
  ]);
  const errores = [];
  const resultados = await mapConcurrent(tareas, concurrency, async (tarea) => {
    try {
      const items = await tarea.buscar(tarea.codigo);
      if (!Array.isArray(items)) {
        throw new Error(`${tarea.proveedor} devolvió una respuesta inválida.`);
      }
      return {
        proveedor: tarea.proveedor,
        codigoConsultado: tarea.codigo,
        items: items
          .filter((item) => coincideEquivalencia(item, tarea.codigo))
          .map((item) => ({ ...item, codigoConsultado: tarea.codigo })),
      };
    } catch (error) {
      errores.push({
        proveedor: tarea.proveedor,
        codigo: tarea.codigo,
        error: String(error?.message || error),
      });
      return { proveedor: tarea.proveedor, codigoConsultado: tarea.codigo, items: [] };
    }
  });

  const data = { aimar: [], atonor: [] };
  const vistos = { aimar: new Set(), atonor: new Set() };
  for (const resultado of resultados) {
    const grupo = resultado.proveedor === "Aimar" ? "aimar" : "atonor";
    for (const item of resultado.items) {
      const key = normalizarCodigo(item.codigo);
      if (!key || vistos[grupo].has(key)) continue;
      vistos[grupo].add(key);
      data[grupo].push(item);
    }
  }

  const erroresPorProveedor = new Map();
  for (const error of errores) {
    if (!erroresPorProveedor.has(error.proveedor)) erroresPorProveedor.set(error.proveedor, []);
    erroresPorProveedor.get(error.proveedor).push(`${error.codigo}: ${error.error}`);
  }
  const erroresAgrupados = [...erroresPorProveedor].map(([proveedor, detalles]) => ({
    proveedor,
    error: detalles.join(" · "),
  }));

  return {
    codigo: detalle.code,
    familia: {
      codigo: detalle.code,
      nombre: detalle.name || "",
      marca: detalle.subcategory || "",
      categoria: detalle.category || "",
      imagen: detalle.image || "",
      equivalencias,
    },
    equivalencias,
    data,
    errores: erroresAgrupados,
  };
}

module.exports = {
  buscarFamiliaLitton,
  coincideEquivalencia,
  extraerEquivalencias,
  normalizarCodigo,
};
