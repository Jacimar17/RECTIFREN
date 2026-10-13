const express  = require("express");
const Producto = require("../models/Producto");
const auth     = require("../middleware/auth");
const router   = express.Router();

// Proveedores activos. Acá vamos sumando Aimar y ATONOR.
const PROVEEDORES = [
  { nombre: "Litton", buscar: require("../proveedores/litton") },
];

const buscarAimar = require("../proveedores/aimar");
const buscarAtonor = require("../proveedores/atonor");

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

function textoEntrada(value) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

// POST /api/proveedores/detalle body: { codigo, aimarCode } (BETA, requiere sesión)
router.post("/detalle", auth, async (req, res, next) => {
  if (process.env.BETA_PROVEEDORES !== "true") {
    return res.status(404).json({ ok: false, error: "Ruta no encontrada." });
  }

  try {
    const codigo = textoEntrada(req.body.codigo);
    const aimarCode = textoEntrada(req.body.aimarCode) || codigo;
    if (!codigo) return res.status(400).json({ ok: false, error: "Falta el código del producto." });

    const consultas = await Promise.allSettled([
      buscarAimar(aimarCode),
      buscarAtonor(codigo),
    ]);
    const data = { aimar: [], atonor: [] };
    const errores = [];
    const proveedores = ["Aimar", "ATONOR"];

    for (let i = 0; i < consultas.length; i++) {
      const respuesta = consultas[i];
      if (respuesta.status === "rejected") {
        errores.push({
          proveedor: proveedores[i],
          error: String(respuesta.reason?.message || respuesta.reason),
        });
        continue;
      }
      data[i === 0 ? "aimar" : "atonor"] = respuesta.value;
    }

    res.json({ ok: true, codigo, data, errores });
  } catch (error) {
    next(error);
  }
});

// POST /api/proveedores   body: { q }   (BETA, requiere sesión)
router.post("/", auth, async (req, res, next) => {
  if (process.env.BETA_PROVEEDORES !== "true") {
    return res.status(404).json({ ok: false, error: "Ruta no encontrada." });
  }

  const q = textoEntrada(req.body.q);
  if (!q) return res.json({ ok: true, query: q, total: 0, data: [], errores: [] });

  try {
    const respuestas = await Promise.allSettled(PROVEEDORES.map((p) => p.buscar(q)));
    const results = [];
    const errores = [];
    for (let i = 0; i < respuestas.length; i++) {
      const nombre = PROVEEDORES[i].nombre;
      const r = respuestas[i];
      if (r.status === "rejected") {
        errores.push({ proveedor: nombre, error: String(r.reason?.message || r.reason) });
        continue;
      }
      results.push(...r.value.map(item => ({ proveedor: nombre, ...item })));
    }

    const data = await Promise.all(results.map(async item => ({
      ...item,
      enInventario: await buscarEnInventario(item.codigo),
    })));
    res.json({ ok: true, query: q, total: data.length, data, errores });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
