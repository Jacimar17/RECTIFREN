function familiasCatalogoPersistidoHabilitadas() {
  return process.env.FAMILIAS_CATALOGO_PERSISTIDO_HABILITADAS !== "false";
}

module.exports = { familiasCatalogoPersistidoHabilitadas };
