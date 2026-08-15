import { apiRequest } from "./client";

export function getDashboard(monthKey = "") {
  const query = monthKey ? `?month=${encodeURIComponent(monthKey)}` : "";
  return apiRequest(`/api/bootstrap${query}`);
}

export function updateSalary(monthKey, salary) {
  return apiRequest(`/api/months/${encodeURIComponent(monthKey)}/salary`, {
    method: "PATCH",
    body: JSON.stringify({ salary }),
  });
}

export function createMonth(payload) {
  return apiRequest("/api/months", { method: "POST", body: JSON.stringify(payload) });
}

export function initializeMonthEntries(monthKey) {
  return apiRequest(`/api/months/${encodeURIComponent(monthKey)}/initialize-entries`, { method: "POST", body: "{}" });
}

export function closeMonth(monthKey) {
  return apiRequest(`/api/months/${encodeURIComponent(monthKey)}/close`, { method: "POST", body: "{}" });
}

export function reopenMonth(monthKey) {
  return apiRequest(`/api/months/${encodeURIComponent(monthKey)}/reopen`, { method: "POST", body: "{}" });
}
