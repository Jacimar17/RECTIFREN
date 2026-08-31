const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  // 1. Intentar con Bearer token
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      req.admin = true;
      return next();
    } catch {
      return res.status(401).json({ ok: false, error: "Token inválido o expirado." });
    }
  }

  // 2. Fallback: user/pass en body (compatibilidad con frontend actual)
  const user = (req.body.user || "").trim();
  const pass = (req.body.pass || "").trim();

  if (user && pass &&
      user === (process.env.ADMIN_USER || "").trim() &&
      pass === (process.env.ADMIN_PASS || "").trim()) {
    req.admin = true;
    return next();
  }

  return res.status(401).json({ ok: false, error: "No autorizado. Credenciales incorrectas." });
}

module.exports = authMiddleware;
