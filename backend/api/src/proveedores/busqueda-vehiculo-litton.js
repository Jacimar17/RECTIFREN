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

function normalizarOferta(item, proveedor) {
  const rawPrice = item.precio;
  const amount = rawPrice === null || rawPrice === undefined || rawPrice === ""
    ? null
    : Number(rawPrice);
  const price = Number.isFinite(amount) ? amount : null;
  const quantity = typeof item.stockProveedor === "number" && Number.isFinite(item.stockProveedor)
    ? item.stockProveedor
    : null;
  let availability = "desconocido";

  if (typeof item.stockDisponible === "boolean") {
    availability = item.stockDisponible ? "disponible" : "sin_stock";
  } else if (quantity !== null) {
    availability = quantity > 0 ? "disponible" : "sin_stock";
  } else if (item.stockProveedor === "A") {
    availability = "limitado";
  } else if (item.stockProveedor === "V") {
    availability = "disponible";
  } else if (item.stockProveedor === "R") {
    availability = "sin_stock";
  }

  return {
    proveedor,
    codigoProveedor: String(item.codigo || ""),
    marca: String(item.marca || ""),
    descripcion: String(item.nombre || ""),
    precio: { importe: price, moneda: "ARS" },
    stock: { estado: availability, cantidad: quantity },
    url: item.link || null,
    imagen: item.imagen || null,
    codigoCoincidente: String(item.codigoConsultado || ""),
  };
}

async function buscarOfertasPorVehiculo(resultado, buscarDetalleFamilia, {
  concurrency = 2,
  proveedores = [
    { id: "aimar", nombre: "Aimar" },
    { id: "atonor", nombre: "ATONOR" },
  ],
} = {}) {
  if (!resultado || !Array.isArray(resultado.data)) {
    throw new Error("Litton devolvió resultados de vehículo inválidos.");
  }
  if (!Array.isArray(proveedores) || !proveedores.length) {
    throw new Error("La categoría no tiene proveedores configurados.");
  }

  const data = await mapConcurrent(resultado.data, concurrency, async (producto) => {
    try {
      if (typeof producto?.codigo !== "string" || !producto.codigo.trim()) {
        throw new Error("Litton devolvió un producto sin código.");
      }
      const detalle = await buscarDetalleFamilia(producto.codigo, { concurrency: 2 });
      if (
        !detalle
        || !Array.isArray(detalle.equivalencias)
        || proveedores.some((proveedor) => !Array.isArray(detalle.data?.[proveedor.id]))
        || !Array.isArray(detalle.errores)
      ) {
        throw new Error("La comparación de proveedores devolvió una respuesta inválida.");
      }
      const ofertas = Object.fromEntries(proveedores.map((proveedor) => [
        proveedor.id,
        detalle.data[proveedor.id].map((item) => normalizarOferta(item, proveedor.nombre)),
      ]));
      return {
        ...producto,
        equivalencias: detalle.equivalencias,
        ofertas,
        errores: detalle.errores,
      };
    } catch (error) {
      return {
        ...producto,
        equivalencias: [],
        ofertas: Object.fromEntries(proveedores.map((proveedor) => [proveedor.id, []])),
        errores: [{
          proveedor: "Litton",
          error: String(error?.message || error),
        }],
      };
    }
  });

  return {
    ...resultado,
    proveedores,
    data,
    total: data.length,
  };
}

module.exports = { buscarOfertasPorVehiculo, normalizarOferta };
