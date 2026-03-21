const { randomBytes, randomUUID } = require("node:crypto");
const { db } = require("./connection");
const { hashPassword } = require("../lib/security");

function initializeDatabase() {
  db.exec("PRAGMA foreign_keys = ON;");

  const requiresRebuild =
    !hasTable("users") ||
    !hasColumn("users", "email") ||
    !hasTable("password_reset_tokens") ||
    !hasColumn("months", "user_id") ||
    !hasColumn("templates", "user_id") ||
    !hasColumn("entries", "user_id");

  if (requiresRebuild) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE IF EXISTS entries;
      DROP TABLE IF EXISTS templates;
      DROP TABLE IF EXISTS months;
      DROP TABLE IF EXISTS password_reset_tokens;
      DROP TABLE IF EXISTS users;
      PRAGMA foreign_keys = ON;
    `);
  }

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      avatar_data_url TEXT NOT NULL DEFAULT '',
      is_admin INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT NOT NULL DEFAULT '',
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS months (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      month_key TEXT NOT NULL,
      salary_cents INTEGER NOT NULL DEFAULT 0,
      salary_defined INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      rolled_over_from TEXT,
      UNIQUE (user_id, month_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      default_amount_cents INTEGER NOT NULL DEFAULT 0,
      cycle TEXT NOT NULL CHECK(cycle IN ('Inicio Do Mes', 'Quinzena')),
      payment_method TEXT NOT NULL DEFAULT '',
      observation TEXT NOT NULL DEFAULT '',
      start_month TEXT NOT NULL DEFAULT '',
      is_variable INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      month_key TEXT NOT NULL,
      template_id TEXT,
      name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      cycle TEXT NOT NULL CHECK(cycle IN ('Inicio Do Mes', 'Quinzena')),
      payment_method TEXT NOT NULL DEFAULT '',
      observation TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('pending', 'paid', 'saved')),
      is_variable INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id, month_key) REFERENCES months(user_id, month_key) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_months_user_month ON months(user_id, month_key);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_lookup ON password_reset_tokens(token_hash, expires_at, used_at);
    CREATE INDEX IF NOT EXISTS idx_templates_user_active ON templates(user_id, active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_entries_user_month ON entries(user_id, month_key);
  `);

  if (!hasColumn("users", "avatar_data_url")) {
    db.exec("ALTER TABLE users ADD COLUMN avatar_data_url TEXT NOT NULL DEFAULT '';");
  }
  if (!hasColumn("users", "is_admin")) {
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;");
  }
  if (!hasColumn("users", "last_login_at")) {
    db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT NOT NULL DEFAULT '';");
  }

  ensureEntryTemplateUniqueness();
  ensureDefaultAdminUser();
}

function ensureEntryTemplateUniqueness() {
  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_user_month_template_unique
        ON entries(user_id, month_key, template_id)
        WHERE template_id IS NOT NULL;
    `);
    return;
  } catch (error) {
    // Existing duplicates are cleaned below before retrying.
  }

  cleanupDuplicateTemplateEntries();

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_user_month_template_unique
      ON entries(user_id, month_key, template_id)
      WHERE template_id IS NOT NULL;
  `);
}

function cleanupDuplicateTemplateEntries() {
  const groups = db.prepare(`
    SELECT user_id, month_key, template_id, COUNT(*) AS cnt
    FROM entries
    WHERE template_id IS NOT NULL
    GROUP BY user_id, month_key, template_id
    HAVING cnt > 1
  `).all();

  for (const group of groups) {
    const rows = db.prepare(`
      SELECT id
      FROM entries
      WHERE user_id = ? AND month_key = ? AND template_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(group.user_id, group.month_key, group.template_id);

    const idsToDelete = rows.slice(1).map((row) => row.id);
    if (!idsToDelete.length) {
      continue;
    }

    const placeholders = idsToDelete.map(() => "?").join(",");
    db.prepare(`DELETE FROM entries WHERE id IN (${placeholders})`).run(...idsToDelete);
  }
}

function ensureDefaultAdminUser() {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get("admin");
  if (existing) {
    db.prepare("UPDATE users SET is_admin = 1 WHERE username = ?").run("admin");
    return;
  }

  const now = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const hash = hashPassword("admin123", salt);

  db.prepare(`
    INSERT INTO users (
      id, username, email, display_name, avatar_data_url, is_admin, last_login_at, password_salt, password_hash, created_at
    ) VALUES (?, 'admin', 'admin@local', 'Administrador', '', 1, '', ?, ?, ?)
  `).run(randomUUID(), salt, hash, now);
}

function hasTable(tableName) {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)
  );
}

function hasColumn(tableName, columnName) {
  if (!hasTable(tableName)) {
    return false;
  }

  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

function runInTransaction(callback) {
  try {
    db.exec("BEGIN");
    callback();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = {
  initializeDatabase,
  runInTransaction,
};
