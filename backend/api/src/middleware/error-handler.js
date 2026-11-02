function obtenerErrorHttp(error) {
  if (error?.name === "CastError") {
    return { status: 400, message: "El identificador no es válido." };
  }
  if (error?.name === "ValidationError") {
    return { status: 400, message: error.message };
  }
  if (error?.code === 11000) {
    return { status: 409, message: "El recurso ya existe." };
  }

  const status = Number(error?.status || error?.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return { status, message: error.message || "Solicitud no válida." };
  }
  if (status === 502 && error.isOperational) {
    return { status, message: error.message };
  }
  return { status: 500, message: "Error interno." };
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const { status, message } = obtenerErrorHttp(error);
  if (status >= 500) console.error(error);

  const body = { ok: false, error: message };
  if (error.codigoExiste) body.codigoExiste = true;
  return res.status(status).json(body);
}

module.exports = errorHandler;
