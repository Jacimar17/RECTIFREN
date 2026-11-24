const { createHash } = require("node:crypto");
const { EJSON } = require("mongoose").mongo.BSON;
const { crearInforme } = require("./pastillas-preview");

function huella(value) {
  return createHash("sha256").update(EJSON.stringify(value, { relaxed: false })).digest("hex");
}

function crearInformeVerificable(productos, catalogo) {
  if (!catalogo || !Array.isArray(catalogo.fichas) || catalogo.version == null) {
    throw new Error("Falta la versión activa o las fichas del catálogo.");
  }
  const resultado = crearInforme(productos, catalogo.fichas);
  return {
    ...resultado,
    catalogo: { version: catalogo.version, sha256: huella(catalogo) },
    inventario: { documentos: productos.length, sha256: huella(productos) },
  };
}

module.exports = { crearInformeVerificable, huella };
