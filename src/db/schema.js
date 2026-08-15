const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, randomUUID } = require("node:crypto");
const { db } = require("./connection");
const {
  DB_FILE,
  INITIAL_ADMIN_DISPLAY_NAME,
  INITIAL_ADMIN_EMAIL,
  INITIAL_ADMIN_PASSWORD,
  INITIAL_ADMIN_USERNAME,
} = require("../config");
const { hashPassword } = require("../lib/security");

const MIGRATION_ID = "2026-08-security-month-locks";

function initializeDatabase() {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");

  const hasExistingApplicationTables = hasTable("users") || hasTable("months") || hasTable("entries");
  const migrationAlreadyApplied = hasTable("schema_migrations") && Boolean(
    db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)
  );

  if (hasExistingApplicationTables && !migrationAlreadyApplied) {
    backupDatabaseBeforeMigration();
  }

  createTables();
  migrateExistingTables();
  ensureIndexes();

  if (!migrationAlreadyApplied && hasExistingApplicationTables) {
    db.prepare("UPDATE users SET must_change_password = 1").run();
  }

  db.prepare(`
    INSERT OR IGNORE INTO schema_migrations (id, applied_at)
    VALUES (?, ?)
  `).run(MIGRATION_ID, new Date().toISOString());

  ensureInitialAdminUser();
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      avatar_data_url TEXT NOT NULL DEFAULT '',
      is_admin INTEGER NOT NULL DEFAULT 0,
      must_change_password INTEGER NOT NULL DEFAULT 0,
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
      fixed_entries_initialized INTEGER NOT NULL DEFAULT 1,
      closed_at TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      csrf_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      idle_expires_at TEXT NOT NULL,
      absolute_expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      event_type TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
}

function migrateExistingTables() {
  assertRequiredColumns("users", ["id", "username", "email", "display_name", "password_salt", "password_hash"]);
  assertRequiredColumns("months", ["id", "user_id", "month_key", "salary_cents", "salary_defined"]);
  assertRequiredColumns("templates", ["id", "user_id", "name", "default_amount_cents"]);
  assertRequiredColumns("entries", ["id", "user_id", "month_key", "name", "amount_cents"]);

  ensureColumn("users", "avatar_data_url", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("users", "is_admin", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("users", "must_change_password", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("users", "last_login_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("months", "fixed_entries_initialized", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("months", "closed_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn("templates", "observation", "TEXT NOT NULL DEFAULT ''");
}

function ensureIndexes() {
  removeDuplicateTemplateEntries();

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_months_user_month ON months(user_id, month_key);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_lookup ON password_reset_tokens(token_hash, expires_at, used_at);
    CREATE INDEX IF NOT EXISTS idx_templates_user_active ON templates(user_id, active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_entries_user_month ON entries(user_id, month_key);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(idle_expires_at, absolute_expires_at);
    CREATE INDEX IF NOT EXISTS idx_audit_events_user_date ON audit_events(user_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_user_month_template_unique
      ON entries(user_id, month_key, template_id)
      WHERE template_id IS NOT NULL;
  `);
}

function removeDuplicateTemplateEntries() {
  const duplicateGroups = db.prepare(`
    SELECT user_id, month_key, template_id
    FROM entries
    WHERE template_id IS NOT NULL
    GROUP BY user_id, month_key, template_id
    HAVING COUNT(*) > 1
  `).all();

  const listRows = db.prepare(`
    SELECT id
    FROM entries
    WHERE user_id = ? AND month_key = ? AND template_id = ?
    ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, id DESC
  `);
  const deleteRow = db.prepare("DELETE FROM entries WHERE id = ?");

  for (const group of duplicateGroups) {
    const [, ...duplicates] = listRows.all(group.user_id, group.month_key, group.template_id);
    for (const duplicate of duplicates) {
      deleteRow.run(duplicate.id);
    }
  }
}

function ensureInitialAdminUser() {
  const totalUsers = Number(db.prepare("SELECT COUNT(*) AS total FROM users").get().total || 0);
  if (totalUsers > 0) return;

  if (!INITIAL_ADMIN_USERNAME || !INITIAL_ADMIN_EMAIL || INITIAL_ADMIN_PASSWORD.length < 12) {
    throw new Error(
      "Banco sem usuarios. Defina INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD com pelo menos 12 caracteres."
    );
  }

  if (!/^[a-z0-9._-]{3,24}$/.test(INITIAL_ADMIN_USERNAME)) {
    throw new Error("INITIAL_ADMIN_USERNAME invalido.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(INITIAL_ADMIN_EMAIL)) {
    throw new Error("INITIAL_ADMIN_EMAIL invalido.");
  }

  const now = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const hash = hashPassword(INITIAL_ADMIN_PASSWORD, salt);
  db.prepare(`
    INSERT INTO users (
      id, username, email, display_name, avatar_data_url, is_admin, must_change_password,
      last_login_at, password_salt, password_hash, created_at
    ) VALUES (?, ?, ?, ?, '', 1, 0, '', ?, ?, ?)
  `).run(
    randomUUID(),
    INITIAL_ADMIN_USERNAME,
    INITIAL_ADMIN_EMAIL,
    INITIAL_ADMIN_DISPLAY_NAME || INITIAL_ADMIN_USERNAME,
    salt,
    hash,
    now
  );
}

function backupDatabaseBeforeMigration() {
  if (!fs.existsSync(DB_FILE) || fs.statSync(DB_FILE).size === 0) return;

  const backupDirectory = path.join(path.dirname(DB_FILE), "backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDirectory, `gastos-before-${stamp}.sqlite`);
  const escapedPath = backupPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escapedPath}'`);
}

function assertRequiredColumns(tableName, columns) {
  if (!hasTable(tableName)) return;
  const missing = columns.filter((column) => !hasColumn(tableName, column));
  if (missing.length) {
    throw new Error(`O banco requer migracao manual: ${tableName}.${missing.join(", ")}. Nenhum dado foi apagado.`);
  }
}

function ensureColumn(tableName, columnName, definition) {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function hasTable(tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function hasColumn(tableName, columnName) {
  if (!hasTable(tableName)) return false;
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

function runInTransaction(callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = {
  initializeDatabase,
  runInTransaction,
};
