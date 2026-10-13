const express    = require("express");
const Producto   = require("../models/Producto");
const Movimiento = require("../models/Movimiento");
const auth       = require("../middleware/auth");
const {
  UBICACIONES,
  ubicacionEfectiva,
  ubicacionPredeterminada,
  resolverFamiliasInventario,
} = require("../proveedores/familia-inventario");
const buscarLitton = require("../proveedores/litton");
const { sincronizarFamiliasLitton } = require("../proveedores/sincronizacion-litton");
const { randomUUID } = require("crypto");
const router     = express.Router();
const SEARCH_LIMIT = 100;
const FAMILY_RESULT_LIMIT = 300;
let sincronizacionActiva = null;
const trabajosSincronizacion = new Map();

function aliasesIguales(a, b) {
  const signature = (items) => (items || [])
    .map(({ codigo = "", marca = "", productoLitton = "" }) => `${codigo}|${marca}|${productoLitton}`)
    .sort();
  return JSON.stringify(signature(a)) === JSON.stringify(signature(b));
}

async function ejecutarSincronizacionLitton(job) {
  try {
    const productos = await Producto.find()
      .select("_id codigo CODIGO marca MARCA equivalencias equivalenciasCatalogo")
      .lean();
    job.total = productos.filter((producto) => /^RF[-/]?[A-Z0-9]+$/i.test(String(producto.codigo || producto.CODIGO || "").trim())).length;

    const { equivalenciasPorId, summary } = await sincronizarFamiliasLitton(productos, {
      buscarLitton,
      obtenerDetalle: buscarLitton.obtenerDetalle,
      onProgress: ({ stage, processed, total }) => {
        job.stage = stage;
        job.processed = processed;
        job.total = total;
      },
    });

    const operaciones = [];
    for (const producto of productos) {
      const id = String(producto._id);
      const equivalenciasCatalogo = equivalenciasPorId.get(id);
      if (!equivalenciasCatalogo) continue;
      if (aliasesIguales(producto.equivalenciasCatalogo, equivalenciasCatalogo)) continue;
      operaciones.push({
        updateOne: {
          filter: { _id: producto._id },
          update: { $set: { equivalenciasCatalogo } },
        },
      });
    }

    for (let i = 0; i < operaciones.length; i += 100) {
      job.stage = "saving";
      job.processed = i;
      job.total = operaciones.length;
      await Producto.bulkWrite(operaciones.slice(i, i + 100), { ordered: false });
    }

    job.processed = operaciones.length;
    job.status = "completed";
    job.summary = { ...summary, productosActualizados: operaciones.length };
    job.completedAt = new Date().toISOString();
  } catch (error) {
    job.status = "failed";
    job.error = error.message || "No se pudo completar la sincronización.";
    job.completedAt = new Date().toISOString();
  } finally {
    if (sincronizacionActiva === job.id) sincronizacionActiva = null;
  }
}

/* Normaliza un documento sin importar si tiene campos en MAYUS o minus */
function norm(p) {
  return {
    _id:          p._id,
    codigo:       p.codigo || p.CODIGO || "",
    marca:        p.marca  || p.MARCA  || "",
    stock:        p.stock  !== undefined && p.stock !== null ? p.stock : (p.STOCK !== undefined ? p.STOCK : 0),
    ubicacion:    ubicacionEfectiva(p),
    equivalencias: p.equivalencias || "",
    stockMinimo:   p.stockMinimo !== undefined ? p.stockMinimo : 2
  };
}

/* Busca producto por codigo+marca soportando ambas convenciones */
async function findProducto(codigo, marca) {
  return await Producto.findOne({
    $or: [
      { codigo: codigo, marca: marca },
      { CODIGO: codigo, MARCA: marca }
    ]
  });
}

// GET /api/productos
router.get("/", async (req, res) => {
  try {
    const productos = await Producto.find().sort({ codigo: 1, CODIGO: 1 });
    res.json({ ok: true, data: productos.map(norm) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/productos/sincronizar-familias-litton — importación masiva, requiere sesión
router.post("/sincronizar-familias-litton", auth, (req, res) => {
  if (sincronizacionActiva) {
    const activeJob = trabajosSincronizacion.get(sincronizacionActiva);
    return res.status(409).json({ ok: false, error: "Ya hay una sincronización en curso.", job: activeJob });
  }

  const job = {
    id: randomUUID(),
    status: "running",
    stage: "loading",
    processed: 0,
    total: 0,
    startedAt: new Date().toISOString(),
  };
  for (const [id, oldJob] of trabajosSincronizacion) {
    if (oldJob.status !== "running") trabajosSincronizacion.delete(id);
  }
  sincronizacionActiva = job.id;
  trabajosSincronizacion.set(job.id, job);
  setImmediate(() => { void ejecutarSincronizacionLitton(job); });
  res.status(202).json({ ok: true, job });
});

// GET /api/productos/sincronizar-familias-litton/:jobId — consulta estado de importación
router.get("/sincronizar-familias-litton/:jobId", auth, (req, res) => {
  const job = trabajosSincronizacion.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: "Trabajo de sincronización no encontrado." });
  res.json({ ok: true, job });
});

// GET /api/productos/search?q=
router.get("/search", async (req, res) => {
  try {
    if (req.query.q !== undefined && typeof req.query.q !== "string") {
      return res.status(400).json({ ok: false, error: "El término de búsqueda no es válido." });
    }
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ ok: true, data: [], familias: [], matchedIds: [] });
    if (q.length > 100) return res.status(400).json({ ok: false, error: "La búsqueda no puede superar 100 caracteres." });
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const direct = await Producto.find({
      $or: [
        { codigo: regex }, { CODIGO: regex },
        { marca:  regex }, { MARCA:  regex },
        { equivalencias: regex },
        { "equivalenciasCatalogo.codigo": regex },
        { "equivalenciasCatalogo.marca": regex },
      ]
    }).sort({ codigo: 1, CODIGO: 1 }).limit(SEARCH_LIMIT + 1).lean();
    const hasMoreDirect = direct.length > SEARCH_LIMIT;
    const seeds = direct.slice(0, SEARCH_LIMIT);
    const inventario = await Producto.find()
      .select("_id codigo CODIGO marca MARCA stock STOCK ubicacion equivalencias equivalenciasCatalogo equivalentesVinculados")
      .lean();
    const inventarioPorId = new Map(inventario.map((producto) => [String(producto._id), producto]));
    const familias = resolverFamiliasInventario(inventario, seeds)
      .filter((familia) => familia.filas.length > 1);
    const rowsById = new Map();
    for (const item of seeds) rowsById.set(String(item._id), item);
    for (const familia of familias) {
      for (const item of familia.filas) {
        const original = inventarioPorId.get(item._id);
        if (original) rowsById.set(item._id, original);
      }
    }
    const allResults = [...rowsById.values()].sort((a, b) =>
      String(a.codigo || a.CODIGO || "").localeCompare(
        String(b.codigo || b.CODIGO || ""), "es", { numeric: true, sensitivity: "base" }
      ) || String(a.marca || a.MARCA || "").localeCompare(String(b.marca || b.MARCA || ""), "es")
    );
    const hasMore = hasMoreDirect || allResults.length > FAMILY_RESULT_LIMIT;
    const results = allResults.slice(0, FAMILY_RESULT_LIMIT);
    res.json({
      ok: true,
      data: results.map(norm),
      familias: familias.map(({ id, filas, totales }) => ({ id, filas, totales })),
      matchedIds: seeds.map((item) => String(item._id)),
      total: results.length,
      hasMore,
      query: q,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/productos
router.post("/", auth, async (req, res) => {
  try {
    const { codigo, marca, stock = 0, equivalencias = "" } = req.body;
    if (!codigo || !marca) return res.status(400).json({ ok: false, error: "Faltan campos: codigo, marca." });
    const ubicacion = req.body.ubicacion || ubicacionPredeterminada({ codigo });
    if (!Object.values(UBICACIONES).includes(ubicacion)) {
      return res.status(400).json({ ok: false, error: "La ubicación del producto no es válida." });
    }

    const existe = await findProducto(codigo.trim(), marca.trim());
    if (existe) return res.status(409).json({ ok: false, error: `El producto ya existe: ${codigo} — ${marca}` });

    const producto = await Producto.create({ codigo: codigo.trim(), marca: marca.trim(), stock: Number(stock), equivalencias, ubicacion });
    await Movimiento.create({ accion: "ALTA", productoId: producto._id, codigo: producto.codigo, marca: producto.marca, cantidad: Number(stock), stock_anterior: 0, stock_nuevo: Number(stock) });

    res.status(201).json({ ok: true, data: norm(producto) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/productos/:id
router.put("/:id", auth, async (req, res) => {
  try {
    const { codigo, marca, stock, equivalencias, ubicacion } = req.body;
    if (ubicacion !== undefined && !Object.values(UBICACIONES).includes(ubicacion)) {
      return res.status(400).json({ ok: false, error: "La ubicación del producto no es válida." });
    }
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

    const stockAntes = producto.stock !== undefined ? producto.stock : (producto.STOCK || 0);

    if (codigo)               { producto.codigo = codigo.trim(); producto.CODIGO = codigo.trim(); }
    if (marca)                { producto.marca  = marca.trim();  producto.MARCA  = marca.trim(); }
    if (stock !== undefined)  { producto.stock  = Number(stock); producto.STOCK  = Number(stock); }
    if (equivalencias !== undefined) producto.equivalencias = equivalencias;
    if (ubicacion !== undefined) producto.ubicacion = ubicacion;

    await producto.save();

    if (stock !== undefined && Number(stock) !== stockAntes) {
      await Movimiento.create({ accion: "AJUSTE", productoId: producto._id, codigo: norm(producto).codigo, marca: norm(producto).marca, cantidad: 0, stock_anterior: stockAntes, stock_nuevo: Number(stock) });
    }

    res.json({ ok: true, data: norm(producto) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/productos/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ ok: false, error: "Producto no encontrado." });

    const n = norm(producto);
    await Movimiento.create({ accion: "BAJA", productoId: producto._id, codigo: n.codigo, marca: n.marca, cantidad: 0, stock_anterior: n.stock, stock_nuevo: 0 });
    await producto.deleteOne();

    res.json({ ok: true, mensaje: `Producto ${n.codigo} eliminado.` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// PATCH /api/productos/:id/minimo — actualizar stock mínimo
router.patch("/:id/minimo", auth, async (req, res) => {
  try {
    const minimo = Number(req.body.stockMinimo);
    if (isNaN(minimo) || minimo < 0) return res.status(400).json({ ok: false, error: "Valor inválido." });
    const producto = await Producto.findByIdAndUpdate(
      req.params.id,
      { stockMinimo: minimo },
      { new: true }
    );
    if (!producto) return res.status(404).json({ ok: false, error: "Producto no encontrado." });
    res.json({ ok: true, data: norm(producto) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
