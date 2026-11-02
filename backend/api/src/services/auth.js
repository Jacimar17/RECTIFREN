const jwt = require("jsonwebtoken");
const httpError = require("../utils/http-error");

const TOKEN_TTL_SECONDS = 6 * 60 * 60;

function iniciarSesion(body) {
  const userValue = body?.user || "";
  const passValue = body?.pass || "";
  if (typeof userValue !== "string" || typeof passValue !== "string") {
    throw httpError(400, "El usuario y la contraseña deben ser texto.");
  }
  const user = userValue.trim();
  const pass = passValue.trim();
  const adminUser = (process.env.ADMIN_USER || "").trim();
  const adminPass = (process.env.ADMIN_PASS || "").trim();

  if (!user || !pass) throw httpError(400, "Faltan usuario o contraseña.");
  if (user !== adminUser || pass !== adminPass) throw httpError(401, "Credenciales inválidas.");

  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
  return { token, expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000 };
}

module.exports = { iniciarSesion };
