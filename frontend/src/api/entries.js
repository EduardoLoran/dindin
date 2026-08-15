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

export function updateEntriesBulk(monthKey, entries) {
  return apiRequest("/api/entries/bulk", {
    method: "PATCH",
    body: JSON.stringify({ monthKey, entries }),
  });
}
