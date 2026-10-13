const express = require("express");
const jwt     = require("jsonwebtoken");
const router  = express.Router();
const TOKEN_TTL_SECONDS = 6 * 60 * 60;

router.post("/login", (req, res) => {
  const user = (req.body.user || "").trim();
  const pass = (req.body.pass || "").trim();

  const adminUser = (process.env.ADMIN_USER || "").trim();
  const adminPass = (process.env.ADMIN_PASS || "").trim();

  if (!user || !pass) {
    return res.status(400).json({ ok: false, error: "Faltan usuario o contraseña." });
  }

  if (user !== adminUser || pass !== adminPass) {
    return res.status(401).json({ ok: false, error: "Credenciales inválidas." });
  }

  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
  res.json({ ok: true, token, expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000 });
});

module.exports = router;
