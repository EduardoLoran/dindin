export async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
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

  return payload;
}
