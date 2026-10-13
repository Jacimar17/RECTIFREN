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
const { resolverFamiliasLittonEnVivo } = require("../proveedores/familia-litton-en-vivo");
const router     = express.Router();
const SEARCH_LIMIT = 100;
const FAMILY_RESULT_LIMIT = 300;

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

function fusionarFamilias(familias) {
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
    const filas = [...rows.values()].sort((a, b) =>
      a.codigo.localeCompare(b.codigo, "es", { numeric: true, sensitivity: "base" })
      || a.marca.localeCompare(b.marca, "es", { sensitivity: "base" })
    );
    const totales = filas.reduce((result, row) => {
      const stock = Number(row.stock);
      if (!Number.isFinite(stock)) return result;
      result[row.ubicacion] += stock;
      result.total += stock;
      return result;
    }, { NEGOCIO: 0, DEPOSITO_GALPON: 0, total: 0 });
    merged.push({ id: filas.map((row) => row._id).sort()[0], filas, totales });
  }
  return merged;
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
    const expansionLitton = await resolverFamiliasLittonEnVivo(q, inventario, {
      buscarLitton,
      obtenerDetalle: buscarLitton.obtenerDetalle,
    });
    const familiasLocales = resolverFamiliasInventario(inventario, seeds);
    const familias = fusionarFamilias([
      ...familiasLocales,
      ...expansionLitton.familias,
    ])
      .filter((familia) => familia.filas.length > 1);
    const rowsById = new Map();
    for (const item of seeds) rowsById.set(String(item._id), item);
    for (const id of expansionLitton.matchedIds) {
      const original = inventarioPorId.get(id);
      if (original) rowsById.set(id, original);
    }
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
      matchedIds: [...new Set([
        ...seeds.map((item) => String(item._id)),
        ...expansionLitton.matchedIds,
      ])],
      littonError: expansionLitton.error,
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
