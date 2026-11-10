export function groupOutgoing(movements) {
  const groups = new Map();
  for (const movement of movements || []) {
    if (String(movement.accion || "").toUpperCase() !== "SALIDA") continue;
    const cantidad = Number(movement.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
    const codigo = String(movement.codigo || "").trim();
    const marca = String(movement.marca || "").trim();
    const key = `${codigo.toUpperCase()}|${marca.toUpperCase()}`;
    const current = groups.get(key);
    if (current) current.cantidad += cantidad;
    else groups.set(key, { codigo, marca, cantidad });
  }
  return [...groups.values()].sort((a, b) =>
    a.codigo.localeCompare(b.codigo, "es", { numeric: true }) || a.marca.localeCompare(b.marca, "es"));
}

export function buildRestockText(movements, range) {
  const items = groupOutgoing(movements);
  if (!items.length) return "";
  const period = range === "month" ? "últimos 30 días" : "últimos 7 días";
  const lines = items.map(({ codigo, marca, cantidad }) => `${codigo} ${marca} x${cantidad}`.replace(/\s+/g, " "));
  return [`Productos a reponer (${period}):`, ...lines].join("\n");
}
