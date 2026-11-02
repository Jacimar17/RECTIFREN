require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const apiRouter = require("./routes");
const errorHandler = require("./middleware/error-handler");
const httpError = require("./utils/http-error");

function crearApp() {
  const app = express();
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
      return callback(httpError(403, "Origen no autorizado."));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: true, limit: "100kb" }));

  const health = (req, res) => {
    res.json({ ok: true, app: "RECTIFREN API", version: "1.0.0" });
  };
  app.get("/", health);
  app.get("/health", health);
  app.use("/api", apiRouter);
  app.use((req, res) => res.status(404).json({ ok: false, error: "Ruta no encontrada." }));
  app.use(errorHandler);

  return app;
}

module.exports = crearApp;
