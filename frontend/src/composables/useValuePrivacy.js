import { readonly, ref } from "vue";

const STORAGE_KEY = "dindin-values-hidden";
const valuesHidden = ref(readStoredPreference());

function readStoredPreference() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function setValuesHidden(hidden) {
  valuesHidden.value = Boolean(hidden);
  try {
    window.localStorage.setItem(STORAGE_KEY, String(valuesHidden.value));
  } catch {
    // The preference still works for this session when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent("dindin-value-privacy-change", {
    detail: { hidden: valuesHidden.value },
  }));
}

function toggleValuesVisibility() {
  setValuesHidden(!valuesHidden.value);
}

export function shouldHideValues() {
  return valuesHidden.value;
}

export function useValuePrivacy() {
  return {
    valuesHidden: readonly(valuesHidden),
    setValuesHidden,
    toggleValuesVisibility,
  };
}
