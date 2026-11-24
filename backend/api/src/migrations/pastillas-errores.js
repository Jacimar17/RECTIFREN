class ErrorSeguro extends Error {}

class FalloLimpieza extends Error {
  constructor(etapa, causa) {
    super(etapa);
    this.cause = causa;
  }
}

async function conLimpieza(operacion, limpiar, etapa) {
  let resultado;
  let principal;
  let fallo = false;
  try {
    resultado = await operacion();
  } catch (error) {
    principal = error;
    fallo = true;
  }
  try {
    await limpiar();
  } catch (error) {
    const limpieza = new FalloLimpieza(etapa, error);
    if (fallo) throw new AggregateError([principal, limpieza], "Fallaron la operación y la limpieza.");
    throw limpieza;
  }
  if (fallo) throw principal;
  return resultado;
}

function diagnosticos(error) {
  if (error instanceof AggregateError) return error.errors.flatMap(diagnosticos);
  if (error instanceof FalloLimpieza) {
    const etapas = {
      abortar: "No se pudo cancelar la transacción.",
      sesion: "No se pudo cerrar la sesión MongoDB.",
      conexion: "No se pudo cerrar la conexión MongoDB.",
    };
    return [etapas[error.message] || "Falló la limpieza.", ...diagnosticos(error.cause)];
  }
  if (error instanceof ErrorSeguro) return [error.message];
  if (error instanceof SyntaxError) return ["El informe no contiene JSON válido."];
  const codigo = error && error.code;
  if (codigo === "ENOENT") return ["No existe el archivo indicado."];
  if (codigo === "EACCES" || codigo === "EPERM") return ["No hay permiso para leer el archivo indicado."];
  if (codigo === 13 || codigo === 18) return ["MongoDB rechazó los permisos o la autenticación."];
  if (codigo === 20 || codigo === 303) return ["El servidor no admite la transacción solicitada."];
  if (codigo === 112 || codigo === 251) return ["La transacción sufrió un conflicto o fue cancelada por MongoDB."];
  if (error && ["MongoNetworkError", "MongoServerSelectionError", "MongoNetworkTimeoutError"].includes(error.name)) {
    return ["No se pudo conectar o mantener la conexión con MongoDB."];
  }
  if (typeof codigo === "number" && Number.isSafeInteger(codigo)) {
    return [`MongoDB devolvió el código ${codigo}.`];
  }
  return ["Error no clasificado; se omitieron detalles que podrían contener credenciales."];
}

module.exports = { ErrorSeguro, conLimpieza, diagnosticos };
