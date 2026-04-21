document.addEventListener('DOMContentLoaded', () => {
  const themeButtons = document.querySelectorAll('.theme-mode-btn');

  function updateActiveButton() {
    const currentMode = getThemeMode();
    themeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === currentMode);
    });
  }

  themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setThemeMode(btn.dataset.theme);
      updateActiveButton();
    });
  });

  updateActiveButton();

  const originalApplyTheme = window.applyTheme;
  if (originalApplyTheme) {
    window.applyTheme = (mode) => {
      originalApplyTheme(mode);
      updateActiveButton();
    };
  }
});
