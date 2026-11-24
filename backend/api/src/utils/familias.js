function familiasHabilitadas() {
  return process.env.FAMILIAS_HABILITADAS === "true";
}

module.exports = { familiasHabilitadas };
