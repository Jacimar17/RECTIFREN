const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
const helmet     = require("helmet");
require("dotenv").config();

const apiRouter = require("./routes");
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

app.use("/api", apiRouter);

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
