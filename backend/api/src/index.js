const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
require("dotenv").config();

const productosRouter    = require("./routes/productos");
const stockRouter        = require("./routes/stock");
const movimientosRouter  = require("./routes/movimientos");
const authRouter         = require("./routes/auth");

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Middleware ── */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // compatibilidad con form-encoded

/* ── Rutas ── */
app.use("/api/auth",         authRouter);
app.use("/api/productos",    productosRouter);
app.use("/api/stock",        stockRouter);
app.use("/api/movimientos",  movimientosRouter);

/* ── Health check ── */
app.get("/", (req, res) => {
  res.json({ ok: true, app: "RECTIFREN API", version: "1.0.0" });
});

/* ── 404 ── */
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Ruta no encontrada." });
});

/* ── Error handler global ── */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: "Error interno del servidor." });
});

/* ── Conexión a MongoDB ── */
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ Conectado a MongoDB Atlas");
    app.listen(PORT, () => console.log(`🚀 API corriendo en puerto ${PORT}`));
  })
  .catch((err) => {
    console.error("❌ Error conectando a MongoDB:", err.message);
    process.exit(1);
  });
