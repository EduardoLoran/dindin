const {
  IS_PRODUCTION,
  TURNSTILE_ALLOWED_HOSTS,
  TURNSTILE_REQUIRED,
  TURNSTILE_SECRET_KEY,
  TURNSTILE_SITE_KEY,
  TURNSTILE_VERIFY_URL,
  isTurnstileTestKey,
} = require("../config");
const { httpError } = require("../lib/errors");
const { getClientIp } = require("./rateLimitService");

function isTurnstileEnabled() {
  return Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY);
}

async function assertTurnstile(request, token, expectedAction = "") {
  if (!isTurnstileEnabled()) {
    if (TURNSTILE_REQUIRED) {
      throw httpError(503, "Protecao anti-automacao indisponivel.", "turnstile_unavailable");
    }
    return;
  }

  if (!String(token || "").trim()) {
    throw httpError(400, "Conclua a verificacao de seguranca.", "turnstile_required");
  }

  const body = new URLSearchParams({
    secret: TURNSTILE_SECRET_KEY,
    response: String(token),
    remoteip: getClientIp(request),
  });

  let payload;
  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(6000),
    });
    payload = await response.json();
  } catch {
    throw httpError(503, "Nao foi possivel validar a verificacao de seguranca. Tente novamente.", "turnstile_unavailable");
  }

  const responseHostname = String(payload.hostname || "");
  const usesTestKeys = isTurnstileTestKey(TURNSTILE_SITE_KEY) || isTurnstileTestKey(TURNSTILE_SECRET_KEY);
  const isOfficialTestResponse = !IS_PRODUCTION && usesTestKeys && responseHostname === "example.com";
  const hostnameAllowed = isOfficialTestResponse
    || !TURNSTILE_ALLOWED_HOSTS.length
    || TURNSTILE_ALLOWED_HOSTS.includes(responseHostname);
  const actionAllowed = isOfficialTestResponse || !expectedAction || payload.action === expectedAction;
  if (!payload.success || !hostnameAllowed || !actionAllowed) {
    throw httpError(400, "Verificacao de seguranca invalida ou expirada.", "turnstile_invalid");
  }
}

module.exports = { assertTurnstile, isTurnstileEnabled };
