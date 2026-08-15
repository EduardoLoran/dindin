let csrfToken = "";

export function setCsrfToken(value) {
  csrfToken = String(value || "");
}

export async function apiRequest(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const mutation = ["POST", "PATCH", "PUT", "DELETE"].includes(method);
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(mutation && csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "Não foi possível concluir a solicitação.");
    error.status = response.status;
    error.code = payload.error || "request_failed";
    throw error;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "csrfToken")) {
    setCsrfToken(payload.csrfToken);
  }

  return payload;
}
