(() => {
  const storedTheme = localStorage.getItem("dindin-theme");
  const systemTheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const theme = ["light", "dark"].includes(storedTheme) ? storedTheme : systemTheme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
