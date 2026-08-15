const { db } = require("../db/connection");

function insertSession(session) {
  db.prepare(`
    INSERT INTO sessions (
      token_hash, user_id, csrf_hash, created_at, last_seen_at, idle_expires_at, absolute_expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.tokenHash,
    session.userId,
    session.csrfHash,
    session.createdAt,
    session.lastSeenAt,
    session.idleExpiresAt,
    session.absoluteExpiresAt
  );
}

function findSession(tokenHash) {
  return db.prepare(`
    SELECT token_hash, user_id, csrf_hash, created_at, last_seen_at, idle_expires_at, absolute_expires_at
    FROM sessions
    WHERE token_hash = ?
  `).get(tokenHash);
}

function touchSession(tokenHash, csrfHash, lastSeenAt, idleExpiresAt) {
  db.prepare(`
    UPDATE sessions
    SET csrf_hash = ?, last_seen_at = ?, idle_expires_at = ?
    WHERE token_hash = ?
  `).run(csrfHash, lastSeenAt, idleExpiresAt, tokenHash);
}

function deleteSession(tokenHash) {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

function deleteSessionsForUser(userId) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

function deleteExpiredSessions(now) {
  db.prepare(`
    DELETE FROM sessions
    WHERE idle_expires_at <= ? OR absolute_expires_at <= ?
  `).run(now, now);
}

module.exports = {
  insertSession,
  findSession,
  touchSession,
  deleteSession,
  deleteSessionsForUser,
  deleteExpiredSessions,
};
