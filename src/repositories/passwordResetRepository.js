const { randomBytes, randomUUID } = require("node:crypto");
const { db } = require("../db/connection");
const { hashResetToken } = require("../lib/security");

function createPasswordResetToken(userId) {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (60 * 60 * 1000)).toISOString();

  db.prepare(`
    INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), userId, tokenHash, expiresAt, now.toISOString());

  return rawToken;
}

function findValidPasswordResetToken(rawToken) {
  if (!rawToken) {
    return null;
  }

  const now = new Date().toISOString();
  return db.prepare(`
    SELECT password_reset_tokens.id, password_reset_tokens.user_id, password_reset_tokens.expires_at, users.email
    FROM password_reset_tokens
    JOIN users ON users.id = password_reset_tokens.user_id
    WHERE password_reset_tokens.token_hash = ?
      AND password_reset_tokens.used_at IS NULL
      AND password_reset_tokens.expires_at > ?
  `).get(hashResetToken(rawToken), now);
}

function deleteActivePasswordResetTokens(userId) {
  db.prepare(`
    DELETE FROM password_reset_tokens
    WHERE user_id = ? AND used_at IS NULL
  `).run(userId);
}

function markPasswordResetTokenUsed(tokenId, isoDate) {
  db.prepare(`
    UPDATE password_reset_tokens
    SET used_at = ?
    WHERE id = ?
  `).run(isoDate, tokenId);
}

module.exports = {
  createPasswordResetToken,
  findValidPasswordResetToken,
  deleteActivePasswordResetTokens,
  markPasswordResetTokenUsed,
};
