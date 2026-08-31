const express  = require("express");
const mongoose = require("mongoose");
const router   = express.Router();

// POST /api/migrate?secret=rectifren_migrate_2024
router.post("/", async (req, res) => {
  const secret = req.query.secret || req.body.secret || "";
  if (secret !== "rectifren_migrate_2024") {
    return res.status(401).json({ ok: false, error: "No autorizado." });
  }

  try {
    const datos = require("../scripts/importCSV.js");
    res.json({ ok: false, error: "Usá el endpoint /api/migrate/run" });
  } catch {
    res.json({ ok: false, error: "Usá el endpoint /api/migrate/run" });
  }
});

router.get("/run", async (req, res) => {
  const secret = req.query.secret || "";
  if (secret !== "rectifren_migrate_2024") {
    return res.status(401).json({ ok: false, error: "No autorizado." });
  }

  try {
    // Inline data from CSV
    const script = require("../scripts/importCSV.js");
    res.json({ ok: false, error: "Error: el script no exporta datos. Usá /api/migrate/exec" });
  } catch {
    res.json({ ok: false, error: "Error cargando script" });
  }
});

module.exports = router;
