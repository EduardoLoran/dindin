import { apiRequest } from "./client";

export function updateEntry(entryId, entry) {
  return apiRequest(`/api/entries/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(entry),
  });
}

export function updateEntryObservation(entryId, observation) {
  return apiRequest(`/api/entries/${entryId}/observation`, {
    method: "PATCH",
    body: JSON.stringify({ observation }),
  });
}

export function deleteEntry(entryId) {
  return apiRequest(`/api/entries/${entryId}`, { method: "DELETE" });
}

export function updateIncomeClassification(entryId, isSalary) {
  return apiRequest(`/api/entries/${entryId}/income-classification`, {
    method: "PATCH",
    body: JSON.stringify({ isSalary }),
  });
}

export function deleteMonthEntries(monthKey, directions) {
  return apiRequest(`/api/months/${encodeURIComponent(monthKey)}/entries`, {
    method: "DELETE",
    body: JSON.stringify({ directions }),
  });
}

export function updateEntriesBulk(monthKey, entries) {
  return apiRequest("/api/entries/bulk", {
    method: "PATCH",
    body: JSON.stringify({ monthKey, entries }),
  });
}
