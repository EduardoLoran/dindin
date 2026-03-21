const { randomUUID } = require("node:crypto");
const { SESSION_COOKIE } = require("../config");
const { findUserById } = require("../repositories/userRepository");

const sessions = new Map();

function parseCookies(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator === -1) {
        return cookies;
      }
      const key = decodeURIComponent(part.slice(0, separator).trim());
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function setSessionCookie(response, sessionId) {
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function createSession(response, userId) {
  const sessionId = randomUUID();
  sessions.set(sessionId, { userId, createdAt: new Date().toISOString() });
  setSessionCookie(response, sessionId);
}

function clearSessionsForUser(userId) {
  for (const [sessionId, session] of sessions.entries()) {
    if (session.userId === userId) {
      sessions.delete(sessionId);
    }
  }
}

function destroySessionFromRequest(request, response) {
  const cookies = parseCookies(request.headers.cookie || "");
  if (cookies[SESSION_COOKIE]) {
    sessions.delete(cookies[SESSION_COOKIE]);
  }
  clearSessionCookie(response);
}

function getAuthenticatedUser(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const sessionId = cookies[SESSION_COOKIE];
  const session = sessionId ? sessions.get(sessionId) : null;
  if (!session) {
    return null;
  }

  const user = findUserById(session.userId);
  if (!user) {
    sessions.delete(sessionId);
    return null;
  }

  return user;
}

module.exports = {
  parseCookies,
  createSession,
  clearSessionsForUser,
  clearSessionCookie,
  destroySessionFromRequest,
  getAuthenticatedUser,
};
