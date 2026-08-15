import { apiRequest } from "./client";

export function getSession() {
  return apiRequest("/api/session");
}

export function getPublicConfig() {
  return apiRequest("/api/public-config");
}

export function login(credentials) {
  return apiRequest("/api/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export function register(account) {
  return apiRequest("/api/register", {
    method: "POST",
    body: JSON.stringify(account),
  });
}

export function requestPasswordReset(email, turnstileToken) {
  return apiRequest("/api/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email, turnstileToken }),
  });
}

export function validatePasswordReset(token) {
  return apiRequest(`/api/password-reset/validate?token=${encodeURIComponent(token)}`);
}

export function completePasswordReset(payload) {
  return apiRequest("/api/password-reset/complete", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProfile(profile) {
  return apiRequest("/api/profile", {
    method: "PATCH",
    body: JSON.stringify(profile),
  });
}

export function changePassword(payload) {
  return apiRequest("/api/change-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout() {
  return apiRequest("/api/logout", { method: "POST" });
}
