const THEME_KEY = "jockcloud_theme";

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "auto";
  applyTheme(savedTheme);
}

function applyTheme(mode) {
  let actualTheme;
  if (mode === "auto") {
    actualTheme = getSystemTheme();
  } else {
    actualTheme = mode;
  }
  if (actualTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  document.documentElement.setAttribute("data-theme-mode", mode);
  localStorage.setItem(THEME_KEY, mode);
}

function setThemeMode(mode) {
  applyTheme(mode);
  return mode;
}

function getThemeMode() {
  return localStorage.getItem(THEME_KEY) || "auto";
}

function getCurrentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function isDarkMode() {
  return getCurrentTheme() === "dark";
}

window.initTheme = initTheme;
window.applyTheme = applyTheme;
window.setThemeMode = setThemeMode;
window.getThemeMode = getThemeMode;
window.getCurrentTheme = getCurrentTheme;
window.isDarkMode = isDarkMode;

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const mode = getThemeMode();
  if (mode === "auto") {
    applyTheme("auto");
  }
});

// 立即执行，避免闪烁
(function() {
  const savedTheme = localStorage.getItem(THEME_KEY) || "auto";
  let actualTheme;
  if (savedTheme === "auto") {
    actualTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } else {
    actualTheme = savedTheme;
  }
  if (actualTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
  document.documentElement.setAttribute("data-theme-mode", savedTheme);
})();
