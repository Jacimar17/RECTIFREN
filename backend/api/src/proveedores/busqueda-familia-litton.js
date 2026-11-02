const normalizarCodigo = require("./normalizar-codigo");

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
  proveedores,
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

  const adaptadores = Array.isArray(proveedores) ? proveedores : [
    { id: "aimar", nombre: "Aimar", buscar: buscarAimar },
    { id: "atonor", nombre: "ATONOR", buscar: buscarAtonor },
  ];
  const providerIds = adaptadores.map((item) => item?.id);
  if (
    !adaptadores.length
    || adaptadores.some((item) => !item?.id || !item?.nombre || typeof item.buscar !== "function")
    || new Set(providerIds).size !== providerIds.length
  ) {
    throw new Error("La categoría no tiene adaptadores de proveedores válidos.");
  }

  const tareas = equivalencias.flatMap((equivalencia) =>
    adaptadores.map((proveedor) => ({
      proveedor,
      codigo: equivalencia.codigo,
      marca: equivalencia.marca,
      buscar: proveedor.buscar,
    }))
  );
  const errores = [];
  const resultados = await mapConcurrent(tareas, concurrency, async (tarea) => {
    try {
      const items = await tarea.buscar(tarea.codigo, tarea.marca);
      if (!Array.isArray(items)) {
        throw new Error(`${tarea.proveedor.nombre} devolvió una respuesta inválida.`);
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
        proveedorId: tarea.proveedor.id,
        proveedor: tarea.proveedor.nombre,
        codigo: tarea.codigo,
        error: String(error?.message || error),
      });
      return { proveedor: tarea.proveedor, codigoConsultado: tarea.codigo, items: [] };
    }
  });

  const data = Object.fromEntries(adaptadores.map((proveedor) => [proveedor.id, []]));
  const vistos = Object.fromEntries(adaptadores.map((proveedor) => [proveedor.id, new Set()]));
  for (const resultado of resultados) {
    const grupo = resultado.proveedor.id;
    for (const item of resultado.items) {
      const key = normalizarCodigo(item.codigo);
      if (!key || vistos[grupo].has(key)) continue;
      vistos[grupo].add(key);
      data[grupo].push(item);
    }
  }

  const erroresPorProveedor = new Map();
  for (const error of errores) {
    if (!erroresPorProveedor.has(error.proveedorId)) erroresPorProveedor.set(error.proveedorId, []);
    erroresPorProveedor.get(error.proveedorId).push(`${error.codigo}: ${error.error}`);
  }
  const erroresAgrupados = [...erroresPorProveedor].map(([proveedor, detalles]) => ({
    proveedor: adaptadores.find((item) => item.id === proveedor)?.nombre || proveedor,
    error: detalles.join(" · "),
  }));

  return {
    proveedores: adaptadores.map(({ id, nombre }) => ({ id, nombre })),
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
