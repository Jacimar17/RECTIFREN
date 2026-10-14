const authService = require("../services/auth");

async function iniciarSesion(req, res) {
  try {
    res.json({ ok: true, ...authService.iniciarSesion(req.body) });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message });
  }
}

module.exports = { iniciarSesion };
