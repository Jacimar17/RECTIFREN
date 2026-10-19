import { $ } from "./ui.js";
import { icon } from "./ui/icons.js";

export function applyTheme(theme) {
  const value = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", value);
  localStorage.setItem("rectifren_theme", value);
  const button = $("btnTheme");
  // En tema oscuro el botón ofrece pasar a claro (sol) y viceversa.
  if (button) button.innerHTML = icon(value === "dark" ? "sun" : "moon");
}

export function initTheme() {
  const saved = localStorage.getItem("rectifren_theme");
  if (saved === "dark" || saved === "light") { applyTheme(saved); return; }
  applyTheme(window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
