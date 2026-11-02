const httpError = require("../utils/http-error");

function requireJsonObject(req, res, next) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return next(httpError(400, "El cuerpo de la solicitud debe ser un objeto JSON."));
  }
  return next();
}

module.exports = requireJsonObject;
