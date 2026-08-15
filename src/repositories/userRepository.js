const { randomBytes, randomUUID } = require("node:crypto");
const { db } = require("../db/connection");
const { clientError } = require("../lib/errors");
const { hashPassword } = require("../lib/security");

function findUserByUsername(username) {
  return db.prepare(`
    SELECT id, username, email, display_name, avatar_data_url, is_admin, must_change_password, last_login_at, password_salt, password_hash, created_at
    FROM users
    WHERE username = ?
  `).get(String(username || "").toLowerCase());
}

function findUserByEmail(email) {
  return db.prepare(`
    SELECT id, username, email, display_name, avatar_data_url, is_admin, must_change_password, last_login_at, password_salt, password_hash, created_at
    FROM users
    WHERE email = ?
  `).get(String(email || "").trim().toLowerCase());
}

function findUserById(userId) {
  return db.prepare(`
    SELECT id, username, email, display_name, avatar_data_url, is_admin, must_change_password, last_login_at, password_salt, password_hash, created_at
    FROM users
    WHERE id = ?
  `).get(userId);
}

function listUsersForAdmin(limit = 25, offset = 0) {
  return db.prepare(`
    SELECT id, username, email, display_name, avatar_data_url, is_admin, must_change_password, last_login_at, created_at
    FROM users
    ORDER BY datetime(created_at) DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function countUsers() {
  return Number(db.prepare("SELECT COUNT(*) AS total FROM users").get().total || 0);
}

function updateLastLogin(userId, isoDate) {
  db.prepare(`
    UPDATE users
    SET last_login_at = ?
    WHERE id = ?
  `).run(isoDate, userId);
}

function insertUserRecord(username, email, displayName, password, isAdmin = false) {
  const now = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  const user = {
    id: randomUUID(),
    username,
    email,
    display_name: displayName,
    avatar_data_url: "",
    is_admin: isAdmin ? 1 : 0,
    must_change_password: 0,
    last_login_at: now,
    password_salt: salt,
    password_hash: hash,
    created_at: now,
  };

  try {
    db.prepare(`
      INSERT INTO users (
        id, username, email, display_name, avatar_data_url, is_admin, must_change_password,
        last_login_at, password_salt, password_hash, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      user.username,
      user.email,
      user.display_name,
      user.avatar_data_url,
      user.is_admin,
      user.must_change_password,
      user.last_login_at,
      user.password_salt,
      user.password_hash,
      user.created_at
    );
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("UNIQUE") && message.includes("users.username")) {
      throw clientError("Usuario ja existe.");
    }
    if (message.includes("UNIQUE") && message.includes("users.email")) {
      throw clientError("E-mail ja esta em uso.");
    }
    throw error;
  }

  return user;
}

function updateUserByAdmin(userId, username, email, displayName, isAdmin) {
  try {
    return db.prepare(`
      UPDATE users
      SET username = ?, email = ?, display_name = ?, is_admin = ?
      WHERE id = ?
    `).run(username, email, displayName, isAdmin ? 1 : 0, userId);
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("UNIQUE") && message.includes("users.username")) {
      throw clientError("Usuario ja existe.");
    }
    if (message.includes("UNIQUE") && message.includes("users.email")) {
      throw clientError("E-mail ja esta em uso.");
    }
    throw error;
  }
}

function updateProfile(userId, displayName, avatarDataUrl) {
  db.prepare(`
    UPDATE users
    SET display_name = ?, avatar_data_url = ?
    WHERE id = ?
  `).run(displayName, avatarDataUrl, userId);
}

function updatePassword(userId, password) {
  const salt = randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);

  db.prepare(`
    UPDATE users
    SET password_salt = ?, password_hash = ?, must_change_password = 0
    WHERE id = ?
  `).run(salt, hash, userId);
}

function countAdmins() {
  return Number(db.prepare("SELECT COUNT(*) AS total FROM users WHERE is_admin = 1").get().total || 0);
}

module.exports = {
  findUserByUsername,
  findUserByEmail,
  findUserById,
  listUsersForAdmin,
  countUsers,
  updateLastLogin,
  insertUserRecord,
  updateUserByAdmin,
  updateProfile,
  updatePassword,
  countAdmins,
};
