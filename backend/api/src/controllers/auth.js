const authService = require("../services/auth");

async function iniciarSesion(req, res) {
  res.json({ ok: true, ...authService.iniciarSesion(req.body) });
}

module.exports = { iniciarSesion };
