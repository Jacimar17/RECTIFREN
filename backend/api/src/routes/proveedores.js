const express  = require("express");
const auth     = require("../middleware/auth");
const router   = express.Router();
const buscarLitton = require("../proveedores/litton");

// Proveedores activos. Acá vamos sumando Aimar y ATONOR.
const PROVEEDORES = [
  { nombre: "Litton", buscar: buscarLitton },
];

const buscarAimar = require("../proveedores/aimar");
const buscarAtonor = require("../proveedores/atonor");
const { buscarFamiliaLitton } = require("../proveedores/busqueda-familia-litton");

function textoEntrada(value) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

// POST /api/proveedores/detalle body: { codigo } (BETA, requiere sesión)
router.post("/detalle", auth, async (req, res, next) => {
  if (process.env.BETA_PROVEEDORES !== "true") {
    return res.status(404).json({ ok: false, error: "Ruta no encontrada." });
  }

  try {
    const codigo = textoEntrada(req.body.codigo);
    if (!codigo) return res.status(400).json({ ok: false, error: "Falta el código del producto." });

    const familia = await buscarFamiliaLitton(codigo, {
      obtenerDetalleLitton: buscarLitton.obtenerDetalle,
      buscarAimar,
      buscarAtonor,
    });
    res.json({ ok: true, ...familia });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message || "No se pudo consultar la familia Litton." });
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

    res.json({ ok: true, query: q, total: results.length, data: results, errores });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
