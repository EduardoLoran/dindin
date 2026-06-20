import { apiRequest } from "./client";

export function getUsers() {
  return apiRequest("/api/admin/users");
}

export function createUser(user) {
  return apiRequest("/api/admin/users", { method: "POST", body: JSON.stringify(user) });
}

export function updateUser(userId, user) {
  return apiRequest(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(user),
  });
}
