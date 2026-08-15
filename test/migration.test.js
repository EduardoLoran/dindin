const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");
const { hashPassword } = require("../src/lib/security");

test("migracao cria backup integro e preserva os dados legados", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dindin-migration-"));
  const databaseFile = path.join(temporaryDirectory, "gastos.sqlite");

  try {
    createLegacyDatabase(databaseFile);
    const migration = spawnSync(process.execPath, [
      "-e",
      "require('./src/db/schema').initializeDatabase()",
    ], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, NODE_ENV: "test", DB_FILE: databaseFile },
      encoding: "utf8",
    });
    assert.equal(migration.status, 0, migration.stderr);

    const database = new DatabaseSync(databaseFile);
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM entries").get().total, 1);
    assert.equal(database.prepare("SELECT must_change_password FROM users WHERE id = 'legacy-user'").get().must_change_password, 1);
    assert.ok(hasColumn(database, "months", "closed_at"));
    assert.ok(hasColumn(database, "months", "fixed_entries_initialized"));
    assert.ok(database.prepare("SELECT id FROM schema_migrations WHERE id = '2026-08-security-month-locks'").get());
    database.close();

    const backups = fs.readdirSync(path.join(temporaryDirectory, "backups"));
    assert.equal(backups.length, 1);
    const backup = new DatabaseSync(path.join(temporaryDirectory, "backups", backups[0]));
    assert.equal(backup.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.equal(backup.prepare("SELECT COUNT(*) AS total FROM entries").get().total, 1);
    backup.close();
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

function createLegacyDatabase(databaseFile) {
  const database = new DatabaseSync(databaseFile);
  const salt = "0123456789abcdef0123456789abcdef";
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE months (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, month_key TEXT NOT NULL,
      salary_cents INTEGER NOT NULL DEFAULT 0, salary_defined INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, rolled_over_from TEXT, UNIQUE (user_id, month_key)
    );
    CREATE TABLE templates (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
      default_amount_cents INTEGER NOT NULL DEFAULT 0, cycle TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT '', start_month TEXT NOT NULL DEFAULT '',
      is_variable INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE entries (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, month_key TEXT NOT NULL, template_id TEXT,
      name TEXT NOT NULL, amount_cents INTEGER NOT NULL DEFAULT 0, cycle TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT '', observation TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL, is_variable INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  database.prepare(`
    INSERT INTO users (id, username, email, display_name, password_salt, password_hash, created_at)
    VALUES ('legacy-user', 'legado', 'legado@example.com', 'Usuario legado', ?, ?, '2026-01-01T00:00:00.000Z')
  `).run(salt, hashPassword("LegacyPassword1!", salt));
  database.exec(`
    INSERT INTO months (id, user_id, month_key, salary_cents, salary_defined, created_at)
    VALUES ('legacy-month', 'legacy-user', '2026-07', 500000, 1, '2026-07-01T00:00:00.000Z');
    INSERT INTO templates (id, user_id, name, default_amount_cents, cycle, payment_method, start_month, is_variable, active, sort_order, created_at)
    VALUES ('legacy-template', 'legacy-user', 'Aluguel', 120000, 'Inicio Do Mes', 'Pix', '2026-07', 0, 1, 1, '2026-07-01T00:00:00.000Z');
    INSERT INTO entries (id, user_id, month_key, template_id, name, amount_cents, cycle, payment_method, observation, status, is_variable, created_at, updated_at)
    VALUES ('legacy-entry', 'legacy-user', '2026-07', 'legacy-template', 'Aluguel', 120000, 'Inicio Do Mes', 'Pix', '', 'pending', 0, '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z');
  `);
  database.close();
}

function hasColumn(database, tableName, columnName) {
  return database.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}
