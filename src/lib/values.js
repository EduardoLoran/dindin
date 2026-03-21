const { clientError } = require("./errors");

function normalizeCycle(cycle) {
  if (!["Inicio Do Mes", "Quinzena"].includes(cycle)) {
    throw clientError("Ciclo invalido.");
  }
  return cycle;
}

function normalizeStatus(status) {
  if (!["pending", "paid", "saved"].includes(status)) {
    throw clientError("Status invalido.");
  }
  return status;
}

function normalizeMonthKey(value) {
  return /^\d{4}-\d{2}$/.test(String(value || "")) ? String(value) : null;
}

function addMonthsToMonthKey(monthKey, offset) {
  const normalized = normalizeMonthKey(monthKey);
  if (!normalized) {
    return null;
  }

  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }

  const baseIndex = year * 12 + (month - 1);
  const nextIndex = baseIndex + Number(offset || 0);
  if (!Number.isFinite(nextIndex) || nextIndex < 0) {
    return null;
  }

  const nextYear = Math.floor(nextIndex / 12);
  const nextMonth = (nextIndex % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function toCents(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  const raw = String(value ?? "").trim();
  let normalized = raw.replace(/[^\d,.-]/g, "");

  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  normalized = normalized.replace(/[^\d.-]/g, "");
  const number = Number(normalized) || 0;
  return Math.round(number * 100);
}

function fromCents(value) {
  return Number(value || 0) / 100;
}

function sumCents(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function getCurrentMonthKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

module.exports = {
  normalizeCycle,
  normalizeStatus,
  normalizeMonthKey,
  addMonthsToMonthKey,
  toCents,
  fromCents,
  sumCents,
  getCurrentMonthKey,
};
