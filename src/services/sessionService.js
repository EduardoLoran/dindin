const { createHash, randomBytes, timingSafeEqual } = require("node:crypto");
const {
  IS_PRODUCTION,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_COOKIE,
  SESSION_IDLE_SECONDS,
} = require("../config");
const { findUserById } = require("../repositories/userRepository");
const {
  deleteExpiredSessions,
  deleteSession,
  deleteSessionsForUser,
  findSession,
  insertSession,
  touchSession,
} = require("../repositories/sessionRepository");

function parseCookies(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator === -1) return cookies;
      try {
        cookies[decodeURIComponent(part.slice(0, separator).trim())] = decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        // Ignore malformed cookies instead of failing the request.
      }
      return cookies;
    }, {});
}

function setSessionCookie(response, sessionId) {
  const secure = IS_PRODUCTION ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Strict${secure}`
  );
}

function clearSessionCookie(response) {
  const secure = IS_PRODUCTION ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
  );
}

function createSession(response, userId) {
  const rawToken = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const now = new Date();
  insertSession({
    tokenHash: hashToken(rawToken),
    userId,
    csrfHash: hashToken(csrfToken),
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    idleExpiresAt: new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000).toISOString(),
    absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_SECONDS * 1000).toISOString(),
  });
  setSessionCookie(response, rawToken);
  return { csrfToken };
}

function getAuthenticatedSession(request, { rotateCsrf = false } = {}) {
  const rawToken = parseCookies(request.headers.cookie || "")[SESSION_COOKIE];
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const session = findSession(tokenHash);
  if (!session) return null;

  const now = new Date();
  if (session.idle_expires_at <= now.toISOString() || session.absolute_expires_at <= now.toISOString()) {
    deleteSession(tokenHash);
    return null;
  }

  const user = findUserById(session.user_id);
  if (!user) {
    deleteSession(tokenHash);
    return null;
  }

  let csrfToken = null;
  let csrfHash = session.csrf_hash;
  if (rotateCsrf) {
    csrfToken = randomBytes(32).toString("base64url");
    csrfHash = hashToken(csrfToken);
  }

  const lastSeen = new Date(session.last_seen_at).getTime();
  if (rotateCsrf || !Number.isFinite(lastSeen) || now.getTime() - lastSeen >= 60_000) {
    const idleExpiry = new Date(
      Math.min(
        now.getTime() + SESSION_IDLE_SECONDS * 1000,
        new Date(session.absolute_expires_at).getTime()
      )
    ).toISOString();
    touchSession(tokenHash, csrfHash, now.toISOString(), idleExpiry);
  }

  return { ...session, token_hash: tokenHash, csrf_hash: csrfHash, csrfToken, user };
}

function assertCsrfToken(request, session) {
  const provided = String(request.headers["x-csrf-token"] || "");
  if (!provided || !safeEqual(hashToken(provided), session.csrf_hash)) {
    const error = new Error("Token de seguranca invalido. Recarregue a pagina.");
    error.statusCode = 403;
    error.code = "invalid_csrf";
    throw error;
  }
}

function clearSessionsForUser(userId) {
  deleteSessionsForUser(userId);
}

function destroySessionFromRequest(request, response) {
  const rawToken = parseCookies(request.headers.cookie || "")[SESSION_COOKIE];
  if (rawToken) deleteSession(hashToken(rawToken));
  clearSessionCookie(response);
}

function cleanupExpiredSessions() {
  deleteExpiredSessions(new Date().toISOString());
}

function hashToken(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
  parseCookies,
  createSession,
  clearSessionsForUser,
  clearSessionCookie,
  destroySessionFromRequest,
  getAuthenticatedSession,
  assertCsrfToken,
  cleanupExpiredSessions,
};
