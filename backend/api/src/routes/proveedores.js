const express  = require("express");
const Producto = require("../models/Producto");
const auth     = require("../middleware/auth");
const router   = express.Router();

// Proveedores activos. Acá vamos sumando Aimar y ATONOR.
const PROVEEDORES = [
  { nombre: "Litton", buscar: require("../proveedores/litton") },
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Busca en tu inventario por código exacto o dentro de equivalencias
async function buscarEnInventario(codigo) {
  if (!codigo) return null;
  const exacto  = new RegExp(`^${escapeRegex(codigo)}$`, "i");
  const enEquiv = new RegExp(escapeRegex(codigo), "i");
  const p = await Producto.findOne({
    $or: [{ codigo: exacto }, { CODIGO: exacto }, { equivalencias: enEquiv }],
  });
  if (!p) return null;
  return {
    _id:    p._id,
    codigo: p.codigo || p.CODIGO || "",
    marca:  p.marca  || p.MARCA  || "",
    stock:  p.stock ?? p.STOCK ?? 0,
  };
}

// POST /api/proveedores   body: { q }   (BETA, requiere sesión)
router.post("/", auth, async (req, res) => {
  if (process.env.BETA_PROVEEDORES !== "true") {
    return res.status(404).json({ ok: false, error: "Ruta no encontrada." });
  }

  const q = (req.body.q || "").trim();
  if (!q) return res.json({ ok: true, query: q, total: 0, data: [], errores: [] });

  const respuestas = await Promise.allSettled(PROVEEDORES.map((p) => p.buscar(q)));

  const data = [];
  const errores = [];
  for (let i = 0; i < respuestas.length; i++) {
    const nombre = PROVEEDORES[i].nombre;
    const r = respuestas[i];
    if (r.status === "rejected") {
      errores.push({ proveedor: nombre, error: String(r.reason?.message || r.reason) });
      continue;
    }
    for (const item of r.value) {
      data.push({ proveedor: nombre, ...item, enInventario: await buscarEnInventario(item.codigo) });
    }
  }

  res.json({ ok: true, query: q, total: data.length, data, errores });
});

module.exports = router;
