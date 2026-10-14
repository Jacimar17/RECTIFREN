import { escapeHtml } from "./dom.js";

export function highlight(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(new RegExp(`(${q})`, "gi"), `<mark class="hl">$1</mark>`);
}

/* ===== Sort base ===== */
export function sortByCodigo(list) {
  return [...list].sort((a,b) =>
    String(a.codigo||"").localeCompare(String(b.codigo||""),"es",{numeric:true,sensitivity:"base"})
  );
}
