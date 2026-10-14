import { $ } from "./ui.js";

export function applyTheme(theme) {
  const value = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", value);
  localStorage.setItem("rectifren_theme", value);
  const button = $("btnTheme");
  if (button) button.textContent = value === "dark" ? "☀️" : "🌙";
}

export function initTheme() {
  const saved = localStorage.getItem("rectifren_theme");
  if (saved === "dark" || saved === "light") { applyTheme(saved); return; }
  applyTheme(window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
