import { apiRequest } from "./client";

export function getDashboard(monthKey = "") {
  const query = monthKey ? `?month=${encodeURIComponent(monthKey)}` : "";
  return apiRequest(`/api/bootstrap${query}`);
}

export function updateSalary(monthKey, salary) {
  return apiRequest("/api/salary", {
    method: "POST",
    body: JSON.stringify({ monthKey, salary }),
  });
}
