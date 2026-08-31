const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  // También aceptar user/pass en body para compatibilidad con el frontend actual
  if (!token) {
    const user = req.body.user || req.body.User || "";
    const pass = req.body.pass || req.body.Pass || "";
    if (
      user === process.env.ADMIN_USER &&
      pass === process.env.ADMIN_PASS
    ) {
      req.admin = true;
      return next();
    }
    return res.status(401).json({ ok: false, error: "No autorizado." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload.admin;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Token inválido o expirado." });
  }
}

module.exports = authMiddleware;
