import { ref } from "vue";

const STORAGE_KEY = "dindin-selected-month";
const selectedMonth = ref(readStoredMonth());

function readStoredMonth() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function setSelectedMonth(monthKey, { notify = false } = {}) {
  if (!monthKey) return;
  selectedMonth.value = monthKey;
  try {
    localStorage.setItem(STORAGE_KEY, monthKey);
  } catch {
    // LocalStorage can be unavailable in private or restricted contexts.
  }
  if (notify) window.dispatchEvent(new CustomEvent("dindin-period-change", { detail: { monthKey } }));
}

function changeSelectedMonth(monthKey) {
  setSelectedMonth(monthKey, { notify: true });
}

export function useGlobalPeriod() {
  return { selectedMonth, setSelectedMonth, changeSelectedMonth };
}
