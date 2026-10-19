/**
 * Reglas de clasificación de categorías para la migración del inventario.
 *
 * Se usan reglas ESTRICTAS sobre la descripción, el título, las equivalencias,
 * la ficha de Litton y el propio código. Si un producto coincide con dos reglas
 * (o con ninguna) no se clasifica: queda para revisión manual. No se adivina.
 *
 *  - "pastilla" / "brake pad"  -> Pastillas de freno
 *  - "cable" / "comando"       -> Cables comando
 */

const CAT_PASTILLAS = "Pastillas de freno";
const CAT_CABLES = "Cables comando";

/** Minúsculas y sin acentos, para comparar textos de forma segura. */
function normalizarTexto(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Recopila los textos del producto donde puede aparecer una pista de categoría. */
function textosDelProducto(producto) {
  const textos = [
    producto.descripcion,
    producto.titulo,
    producto.equivalencias,
    producto.fichaLitton?.description,
    producto.fichaLitton?.name,
    producto.fichaLitton?.subcategory,
  ].map(normalizarTexto).filter(Boolean);

  const codigos = [producto.codigo, producto.CODIGO].map(normalizarTexto).filter(Boolean);
  return { textos, codigos };
}

/**
 * Clasifica un producto con reglas estrictas.
 * Devuelve la categoría asignada o "" si hay que revisarlo a mano.
 */
function clasificarProducto(producto) {
  const { textos, codigos } = textosDelProducto(producto);

  const mencionaPastilla = (valor) => /\bpastillas?\b/.test(valor) || /\bbrake pads?\b/.test(valor);
  const mencionaCable = (valor) => /\bcables?\b/.test(valor) || /\bcomando\b/.test(valor);

  const esPastilla = textos.some(mencionaPastilla) || codigos.some(mencionaPastilla);
  const esCable = textos.some(mencionaCable) || codigos.some(mencionaCable);

  // Doble coincidencia o ninguna: queda sin categoría y se lista para revisión.
  if (esPastilla === esCable) return "";
  return esPastilla ? CAT_PASTILLAS : CAT_CABLES;
}

/** Devuelve true si el producto todavía no tiene categoría. */
function sinCategoria(producto) {
  return !String(producto.categoria || "").trim();
}

/** Línea corta para el informe de la migración. */
function resumenProducto(producto) {
  const codigo = producto.codigo || producto.CODIGO || "(sin código)";
  const marca = producto.marca || producto.MARCA || "(sin marca)";
  const detalle = String(producto.descripcion || producto.titulo || "").slice(0, 60);
  return `${codigo} | ${marca}${detalle ? ` | "${detalle}"` : ""}`;
}

module.exports = {
  CAT_PASTILLAS,
  CAT_CABLES,
  normalizarTexto,
  textosDelProducto,
  clasificarProducto,
  sinCategoria,
  resumenProducto,
};
