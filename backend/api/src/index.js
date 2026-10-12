const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
require("dotenv").config();

const productosRouter     = require("./routes/productos");
const stockRouter         = require("./routes/stock");
const movimientosRouter   = require("./routes/movimientos");
const authRouter          = require("./routes/auth");
const equivalenciasRouter = require("./routes/equivalencias");
const proveedoresRouter   = require("./routes/proveedores");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth",         authRouter);
app.use("/api/productos",    productosRouter);
app.use("/api/stock",        stockRouter);
app.use("/api/movimientos",  movimientosRouter);
app.use("/api/equivalencias", equivalenciasRouter);
app.use("/api/proveedores",  proveedoresRouter);

app.get("/", (req, res) => {
  res.json({ ok: true, app: "RECTIFREN API", version: "1.0.0" });
});

app.use((req, res) => res.status(404).json({ ok: false, error: "Ruta no encontrada." }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ ok: false, error: "Error interno." }); });

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("✅ Conectado a MongoDB Atlas");
    app.listen(PORT, () => console.log(`🚀 API en puerto ${PORT}`));
  })
  .catch((err) => { console.error("❌ Error MongoDB:", err.message); process.exit(1); });
