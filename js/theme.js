// Alterna entre tema claro y oscuro a mano, guardando la preferencia en este
// dispositivo. Sin preferencia guardada, se usa el tema del sistema (ya
// cubierto por CSS con prefers-color-scheme).

import { icon } from "./icons.js";

const KEY = "rc_patinete_theme";

function currentTheme() {
  const stored = localStorage.getItem(KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function renderButton() {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;
  const theme = currentTheme();
  btn.innerHTML = theme === "dark" ? `${icon("sun")} Modo claro` : `${icon("moon")} Modo oscuro`;
}

export function initTheme() {
  applyTheme(currentTheme());
  renderButton();
  document.getElementById("theme-toggle-btn")?.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    localStorage.setItem(KEY, next);
    applyTheme(next);
    renderButton();
  });
}
