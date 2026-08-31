const express = require("express");
const jwt     = require("jsonwebtoken");
const router  = express.Router();

// POST /api/auth/login
router.post("/login", (req, res) => {
  const user = req.body.user || "";
  const pass = req.body.pass || "";

  if (
    user !== process.env.ADMIN_USER ||
    pass !== process.env.ADMIN_PASS
  ) {
    return res.status(401).json({ ok: false, error: "Credenciales inválidas." });
  }

  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: "8h" });
  res.json({ ok: true, token });
});

module.exports = router;
