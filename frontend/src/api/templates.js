import { apiRequest } from "./client";

export function createTemplate(template) {
  return apiRequest("/api/templates", {
    method: "POST",
    body: JSON.stringify(template),
  });
}

export function updateTemplate(templateId, template) {
  return apiRequest(`/api/templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify(template),
  });
}

export function updateTemplateObservation(templateId, observation, monthKey) {
  return apiRequest(`/api/templates/${templateId}/observation`, {
    method: "PATCH",
    body: JSON.stringify({ observation, monthKey }),
  });
}

export function deactivateTemplate(templateId, monthKey) {
  return apiRequest(`/api/templates/${templateId}`, {
    method: "DELETE",
    body: JSON.stringify({ monthKey }),
  });
}
