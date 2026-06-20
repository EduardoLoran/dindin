import { computed, ref } from "vue";

const STORAGE_KEY = "dindin-theme";
const activeTheme = ref("light");
let initialized = false;

function getInitialTheme() {
  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  if (["light", "dark"].includes(storedTheme)) {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  activeTheme.value = theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function useTheme() {
  if (!initialized) {
    initialized = true;
    applyTheme(getInitialTheme());
  }

  const isDark = computed(() => activeTheme.value === "dark");

  function toggleTheme() {
    const nextTheme = isDark.value ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  return {
    activeTheme,
    isDark,
    toggleTheme,
  };
}
