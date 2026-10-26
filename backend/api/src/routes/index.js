const express = require("express");
const rateLimit = require("express-rate-limit");

const authRouter = require("./auth");
const categoriasRouter = require("./categorias");
const equivalenciasRouter = require("./equivalencias");
const movimientosRouter = require("./movimientos");
const productosRouter = require("./productos");
const proveedoresRouter = require("./proveedores");
const stockRouter = require("./stock");

const router = express.Router();

router.use("/auth/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "Demasiados intentos. Probá de nuevo en 15 minutos." },
}));

router.use("/auth", authRouter);
router.use("/productos", productosRouter);
router.use("/stock", stockRouter);
router.use("/movimientos", movimientosRouter);
router.use("/equivalencias", equivalenciasRouter);
router.use("/proveedores", proveedoresRouter);
router.use("/categorias", categoriasRouter);

module.exports = router;
