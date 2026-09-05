import { apiRequest } from "./client";

export function getCategories() {
  return apiRequest("/api/categories");
}

export function createCategory(category) {
  return apiRequest("/api/categories", { method: "POST", body: JSON.stringify(category) });
}

export function updateCategory(categoryId, category) {
  return apiRequest(`/api/categories/${encodeURIComponent(categoryId)}`, {
    method: "PATCH",
    body: JSON.stringify(category),
  });
}

export function deactivateCategory(categoryId) {
  return apiRequest(`/api/categories/${encodeURIComponent(categoryId)}`, { method: "DELETE" });
}
