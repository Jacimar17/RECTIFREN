const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");
require("dotenv").config();

const productosRouter     = require("./routes/productos");
const stockRouter         = require("./routes/stock");
const movimientosRouter   = require("./routes/movimientos");
const authRouter          = require("./routes/auth");
const equivalenciasRouter = require("./routes/equivalencias");
const proveedoresRouter   = require("./routes/proveedores");
const migrarUbicacionesFaltantes = require("./migrations/ubicaciones");

const app  = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  console.warn("CORS_ORIGINS no está configurado: se rechazarán solicitudes desde navegadores.");
}

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origen no autorizado."));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "Demasiados intentos. Probá de nuevo en 15 minutos." }
});

app.use("/api/auth/login",   loginLimiter);
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
  .then(async () => {
    console.log("✅ Conectado a MongoDB Atlas");
    try {
      const migrados = await migrarUbicacionesFaltantes();
      if (migrados) console.log(`✅ Ubicaciones iniciales asignadas a ${migrados} productos`);
    } catch (err) {
      console.error("❌ Error al completar ubicaciones del inventario:", err.message);
      process.exit(1);
    }
    app.listen(PORT, () => console.log(`🚀 API en puerto ${PORT}`));
  })
  .catch((err) => { console.error("❌ Error MongoDB:", err.message); process.exit(1); });
