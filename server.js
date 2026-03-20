const http = require("node:http");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const tls = require("node:tls");
const { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 3030;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "gastos.sqlite");
const DEFAULT_SALARY_CENTS = 0;
const SESSION_COOKIE = "dindin_session";
const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "").trim() === "true" || SMTP_PORT === 465;
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "");
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER).trim();

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
const sessions = new Map();

initializeDatabase();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    serveStatic(response, url.pathname);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    sendJson(response, statusCode, {
      error: statusCode >= 500 ? "internal_error" : "bad_request",
      message: error instanceof Error ? error.message : "Falha inesperada",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Servidor iniciado em http://${HOST}:${PORT}`);
  console.log(`Banco SQLite em ${DB_FILE}`);
});

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/session") {
    const user = getAuthenticatedUser(request);
    sendJson(response, 200, {
      authenticated: Boolean(user),
      user: user ? serializeUser(user) : null,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(request);
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const user = findUserByUsername(username);

    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      sendJson(response, 401, { error: "invalid_credentials", message: "Usuario ou senha invalidos." });
      return;
    }

    db.prepare(`
      UPDATE users
      SET last_login_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), user.id);

    createSession(response, user.id);
    sendJson(response, 200, buildBootstrapPayload(user, getCurrentMonthKey()));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/register") {
    const body = await readJson(request);
    const user = createUser({
      username: body.username,
      email: body.email,
      displayName: body.displayName,
      password: body.password,
      passwordConfirmation: body.passwordConfirmation,
    });

    createSession(response, user.id);
    sendJson(response, 201, buildBootstrapPayload(user, getCurrentMonthKey()));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/password-reset/request") {
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const user = findUserByEmail(email);

    if (!user) {
      sendJson(response, 404, { error: "not_found", message: "E-mail nao encontrado." });
      return;
    }

    deleteActivePasswordResetTokens(user.id);
    const resetLink = createPasswordResetLink(request, createPasswordResetToken(user.id));
    await deliverPasswordResetEmail(user.email, user.display_name, resetLink);

    sendJson(response, 200, {
      ok: true,
      message: `Enviamos um link de redefinicao valido por 60 minutos para ${user.email}.`,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/password-reset/validate") {
    const token = String(url.searchParams.get("token") || "");
    const resetToken = findValidPasswordResetToken(token);

    if (!resetToken) {
      sendJson(response, 404, { error: "not_found", message: "Link invalido ou expirado." });
      return;
    }

    sendJson(response, 200, {
      ok: true,
      email: resetToken.email,
      expiresAt: resetToken.expires_at,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/password-reset/complete") {
    const body = await readJson(request);
    const token = String(body.token || "");
    const newPassword = String(body.newPassword || "");
    const passwordConfirmation = String(body.passwordConfirmation || "");
    const resetToken = findValidPasswordResetToken(token);

    if (!resetToken) {
      sendJson(response, 404, { error: "not_found", message: "Link invalido ou expirado." });
      return;
    }

    validateNewPassword(newPassword, passwordConfirmation);

    const nextSalt = randomBytes(16).toString("hex");
    const nextHash = hashPassword(newPassword, nextSalt);

    runInTransaction(() => {
      db.prepare(`
        UPDATE users
        SET password_salt = ?, password_hash = ?
        WHERE id = ?
      `).run(nextSalt, nextHash, resetToken.user_id);

      db.prepare(`
        UPDATE password_reset_tokens
        SET used_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), resetToken.id);
    });

    clearSessionsForUser(resetToken.user_id);

    sendJson(response, 200, {
      ok: true,
      message: "Senha redefinida com sucesso. Agora voce ja pode entrar.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    const cookies = parseCookies(request.headers.cookie || "");
    if (cookies[SESSION_COOKIE]) {
      sessions.delete(cookies[SESSION_COOKIE]);
    }
    clearSessionCookie(response);
    sendJson(response, 200, { ok: true });
    return;
  }

  const user = getAuthenticatedUser(request);
  if (!user) {
    sendJson(response, 401, { error: "unauthorized", message: "Sessao expirada. Entre novamente." });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/users") {
    assertAdmin(user);
    const users = db.prepare(`
      SELECT id, username, email, display_name, avatar_data_url, is_admin, last_login_at, created_at
      FROM users
      ORDER BY datetime(created_at) DESC
    `).all();

    sendJson(response, 200, {
      ok: true,
      users: users.map((row) => ({
        id: row.id,
        username: row.username,
        email: row.email,
        displayName: row.display_name,
        avatarDataUrl: String(row.avatar_data_url || ""),
        isAdmin: Boolean(row.is_admin),
        lastLoginAt: String(row.last_login_at || ""),
        createdAt: String(row.created_at || ""),
      })),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/users") {
    assertAdmin(user);
    const body = await readJson(request);
    const username = normalizeUsername(body.username);
    const email = normalizeEmail(body.email);
    const displayName = normalizeDisplayName(body.displayName, username);
    validateNewPassword(body.password, body.passwordConfirmation);

    const isAdmin = Boolean(body.isAdmin);
    const now = new Date().toISOString();
    const salt = randomBytes(16).toString("hex");
    const hash = hashPassword(String(body.password || ""), salt);
    const userId = randomUUID();

    try {
      db.prepare(`
        INSERT INTO users (
          id, username, email, display_name, avatar_data_url, is_admin, last_login_at, password_salt, password_hash, created_at
        ) VALUES (?, ?, ?, ?, '', ?, '', ?, ?, ?)
      `).run(userId, username, email, displayName, isAdmin ? 1 : 0, salt, hash, now);
    } catch (error) {
      const message = String(error?.message || "");
      if (message.includes("UNIQUE") && message.includes("users.username")) {
        throw clientError("Usuário já existe.");
      }
      if (message.includes("UNIQUE") && message.includes("users.email")) {
        throw clientError("E-mail já está em uso.");
      }
      throw error;
    }

    sendJson(response, 201, { ok: true });
    return;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/admin/users/")) {
    assertAdmin(user);
    const targetId = String(url.pathname.split("/").pop() || "").trim();
    if (!targetId) {
      throw clientError("Usuário inválido.");
    }

    const body = await readJson(request);
    const target = findUserById(targetId);
    if (!target) {
      sendJson(response, 404, { error: "not_found", message: "Usuário não encontrado." });
      return;
    }

    const nextUsername = normalizeUsername(body.username);
    const nextEmail = normalizeEmail(body.email);
    const nextDisplayName = normalizeDisplayName(body.displayName, nextUsername);
    const nextIsAdmin = Boolean(body.isAdmin);

    // Prevent locking yourself out by removing the last admin.
    if (target.is_admin && !nextIsAdmin) {
      const adminCount = Number(db.prepare("SELECT COUNT(*) AS total FROM users WHERE is_admin = 1").get().total || 0);
      if (adminCount <= 1) {
        throw clientError("Deve existir pelo menos um administrador.");
      }
    }

    try {
      db.prepare(`
        UPDATE users
        SET username = ?, email = ?, display_name = ?, is_admin = ?
        WHERE id = ?
      `).run(nextUsername, nextEmail, nextDisplayName, nextIsAdmin ? 1 : 0, targetId);
    } catch (error) {
      const message = String(error?.message || "");
      if (message.includes("UNIQUE") && message.includes("users.username")) {
        throw clientError("Usuário já existe.");
      }
      if (message.includes("UNIQUE") && message.includes("users.email")) {
        throw clientError("E-mail já está em uso.");
      }
      throw error;
    }

    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const monthKey = normalizeMonthKey(url.searchParams.get("month")) || getCurrentMonthKey();
    if (getMonthRecord(user.id, monthKey)) {
      ensureEntriesFromTemplatesForMonth(user.id, monthKey);
    }
    sendJson(response, 200, buildBootstrapPayload(user, monthKey));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/change-password") {
    const body = await readJson(request);
    const monthKey = normalizeMonthKey(body.monthKey) || getCurrentMonthKey();
    const currentPassword = String(body.currentPassword || "");
    const nextPassword = String(body.newPassword || "");
    const passwordConfirmation = String(body.passwordConfirmation || "");

    if (!verifyPassword(currentPassword, user.password_salt, user.password_hash)) {
      sendJson(response, 400, { error: "invalid_password", message: "A senha atual nao confere." });
      return;
    }

    validatePasswordChange(nextPassword, passwordConfirmation, currentPassword);

    const nextSalt = randomBytes(16).toString("hex");
    const nextHash = hashPassword(nextPassword, nextSalt);

    db.prepare(`
      UPDATE users
      SET password_salt = ?, password_hash = ?
      WHERE id = ?
    `).run(nextSalt, nextHash, user.id);

    clearSessionsForUser(user.id);
    createSession(response, user.id);

    const refreshedUser = findUserById(user.id);
    sendJson(response, 200, {
      ...buildBootstrapPayload(refreshedUser, monthKey),
      message: "Senha alterada com sucesso.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/salary") {
    const body = await readJson(request);
    const monthKey = normalizeMonthKey(body.monthKey) || getCurrentMonthKey();
    const salaryCents = toCents(body.salary);
    ensureMonthExists(user.id, monthKey);

    db.prepare(`
      UPDATE months
      SET salary_cents = ?, salary_defined = 1
      WHERE user_id = ? AND month_key = ?
    `).run(salaryCents, user.id, monthKey);

    sendJson(response, 200, buildBootstrapPayload(user, monthKey));
    return;
  }

  if ((request.method === "PATCH" || request.method === "POST") && url.pathname === "/api/profile") {
    const body = await readJson(request);
    const nextDisplayName = normalizeDisplayName(body.displayName, user.username);
    const hasAvatarDataUrl = Object.prototype.hasOwnProperty.call(body, "avatarDataUrl");
    const nextAvatarDataUrl = hasAvatarDataUrl ? normalizeAvatarDataUrl(body.avatarDataUrl) : String(user.avatar_data_url || "");
    db.prepare(`
      UPDATE users
      SET display_name = ?,
          avatar_data_url = ?
      WHERE id = ?
    `).run(nextDisplayName, nextAvatarDataUrl, user.id);

    const refreshedUser = findUserById(user.id);
    sendJson(response, 200, { ok: true, user: serializeUser(refreshedUser) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/templates") {
    const body = await readJson(request);
    validateTemplatePayload(body);
    const monthKey = normalizeMonthKey(body.monthKey) || getCurrentMonthKey();
    ensureMonthExists(user.id, monthKey);

    const now = new Date().toISOString();
    const sortOrder = Number(
      db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM templates WHERE user_id = ?")
        .get(user.id).next_order
    );
    const templateId = randomUUID();

    db.prepare(`
      INSERT INTO templates (
        id, user_id, name, default_amount_cents, cycle, payment_method, observation, start_month, is_variable, active, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      templateId,
      user.id,
      String(body.name).trim(),
      toCents(body.amount),
      body.cycle,
      String(body.paymentMethod || "").trim(),
      String(body.observation || "").trim(),
      monthKey,
      body.isVariable ? 1 : 0,
      sortOrder,
      now
    );

    // Always create the entry for the current month. For fixed values, also backfill into future saved months.
    ensureEntryForTemplateInMonth(user.id, templateId, monthKey);
    if (!body.isVariable) {
      const existingMonths = listMonths(user.id).map((item) => item.month_key);
      for (const targetMonthKey of existingMonths) {
        if (targetMonthKey > monthKey) {
          ensureEntryForTemplateInMonth(user.id, templateId, targetMonthKey);
        }
      }
    }
    sendJson(response, 201, buildBootstrapPayload(user, monthKey));
    return;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/entries/") && url.pathname.endsWith("/observation")) {
    const entryId = url.pathname.split("/")[3];
    const body = await readJson(request);
    const observation = String(body.observation || "").trim();
    const now = new Date().toISOString();

    const updated = db.prepare(`
      UPDATE entries
      SET observation = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(observation, now, entryId, user.id);

    if (!updated.changes) {
      sendJson(response, 404, { error: "not_found", message: "Lancamento nao encontrado." });
      return;
    }

    const row = db.prepare("SELECT month_key FROM entries WHERE id = ? AND user_id = ?").get(entryId, user.id);
    sendJson(response, 200, buildBootstrapPayload(user, row.month_key));
    return;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/entries/")) {
    const entryId = url.pathname.split("/").pop();
    const body = await readJson(request);
    const amountCents = toCents(body.amount);
    const status = normalizeStatus(body.status);
    const cycle = normalizeCycle(body.cycle);
    const now = new Date().toISOString();

    const updated = db.prepare(`
      UPDATE entries
      SET amount_cents = ?, cycle = ?, status = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(amountCents, cycle, status, now, entryId, user.id);

    if (!updated.changes) {
      sendJson(response, 404, { error: "not_found", message: "Lancamento nao encontrado." });
      return;
    }

    const row = db.prepare("SELECT month_key FROM entries WHERE id = ? AND user_id = ?").get(entryId, user.id);
    sendJson(response, 200, buildBootstrapPayload(user, row.month_key));
    return;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/templates/") && url.pathname.endsWith("/observation")) {
    const templateId = url.pathname.split("/")[3];
    const body = await readJson(request);
    const observation = String(body.observation || "").trim();
    const monthKey = normalizeMonthKey(body.monthKey) || getCurrentMonthKey();

    const updated = db.prepare(`
      UPDATE templates
      SET observation = ?
      WHERE id = ? AND user_id = ?
    `).run(observation, templateId, user.id);

    if (!updated.changes) {
      sendJson(response, 404, { error: "not_found", message: "Cadastro nao encontrado." });
      return;
    }

    sendJson(response, 200, buildBootstrapPayload(user, monthKey));
    return;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/templates/")) {
    const templateId = url.pathname.split("/").pop();
    const body = await readJson(request);
    validateTemplatePayload(body);
    const monthKey = normalizeMonthKey(body.monthKey) || getCurrentMonthKey();
    const startMonth = normalizeMonthKey(body.startMonth) || monthKey;

    const updated = db.prepare(`
      UPDATE templates
      SET
        name = ?,
        default_amount_cents = ?,
        cycle = ?,
        payment_method = ?,
        start_month = ?,
        is_variable = ?
      WHERE id = ? AND user_id = ?
    `).run(
      String(body.name).trim(),
      toCents(body.amount),
      body.cycle,
      String(body.paymentMethod || "").trim(),
      startMonth,
      body.isVariable ? 1 : 0,
      templateId,
      user.id
    );

    if (!updated.changes) {
      sendJson(response, 404, { error: "not_found", message: "Cadastro nao encontrado." });
      return;
    }

    syncTemplateEntryForMonth(user.id, templateId, monthKey);
    sendJson(response, 200, buildBootstrapPayload(user, monthKey));
    return;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/entries/")) {
    const entryId = url.pathname.split("/").pop();
    const row = db.prepare("SELECT month_key FROM entries WHERE id = ? AND user_id = ?").get(entryId, user.id);

    if (!row) {
      sendJson(response, 404, { error: "not_found", message: "Lancamento nao encontrado." });
      return;
    }

    db.prepare("DELETE FROM entries WHERE id = ? AND user_id = ?").run(entryId, user.id);
    sendJson(response, 200, buildBootstrapPayload(user, row.month_key));
    return;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/templates/")) {
    const templateId = url.pathname.split("/").pop();
    const body = await readJson(request);
    const monthKey = normalizeMonthKey(body.monthKey) || getCurrentMonthKey();

    const updated = db.prepare(`
      UPDATE templates
      SET active = 0
      WHERE id = ? AND user_id = ?
    `).run(templateId, user.id);

    if (!updated.changes) {
      sendJson(response, 404, { error: "not_found", message: "Cadastro nao encontrado." });
      return;
    }

    db.prepare(`
      DELETE FROM entries
      WHERE template_id = ? AND user_id = ? AND month_key = ?
    `).run(templateId, user.id, monthKey);

    sendJson(response, 200, buildBootstrapPayload(user, monthKey));
    return;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/months/")) {
    const monthKey = normalizeMonthKey(url.pathname.split("/").pop());

    if (!monthKey) {
      sendJson(response, 400, { error: "invalid_month", message: "Mes invalido." });
      return;
    }

    runInTransaction(() => {
      // If a recurring template started in this month, move its start forward so recreating
      // the month does not bring back previous values.
      const nextMonthKey = addMonthsToMonthKey(monthKey, 1);
      if (nextMonthKey) {
        db.prepare(`
          UPDATE templates
          SET start_month = ?
          WHERE user_id = ? AND start_month = ?
        `).run(nextMonthKey, user.id, monthKey);
      }

      db.prepare("DELETE FROM entries WHERE user_id = ? AND month_key = ?").run(user.id, monthKey);
      db.prepare("DELETE FROM months WHERE user_id = ? AND month_key = ?").run(user.id, monthKey);
    });

    const remainingMonths = listMonths(user.id);
    const fallbackMonth = remainingMonths[0]?.month_key || getCurrentMonthKey();
    sendJson(response, 200, buildBootstrapPayload(user, fallbackMonth));
    return;
  }

  sendJson(response, 404, { error: "not_found", message: "Rota nao encontrada." });
}

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

  // Lightweight migrations for existing databases (avoid destructive rebuilds).
  if (!hasColumn("users", "avatar_data_url")) {
    db.exec("ALTER TABLE users ADD COLUMN avatar_data_url TEXT NOT NULL DEFAULT '';");
  }
  if (!hasColumn("users", "is_admin")) {
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;");
  }
  if (!hasColumn("users", "last_login_at")) {
    db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT NOT NULL DEFAULT '';");
  }

  // Always apply post-schema migrations (indexes, cleanup).
  ensureEntryTemplateUniqueness();

  ensureDefaultAdminUser();
}

function ensureEntryTemplateUniqueness() {
  // If the DB existed before we added the unique index, duplicates may already exist.
  // We dedupe first and then enforce the constraint.
  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_user_month_template_unique
        ON entries(user_id, month_key, template_id)
        WHERE template_id IS NOT NULL;
    `);
    return;
  } catch (error) {
    // Likely duplicate rows; clean and retry.
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
    // Ensure admin keeps admin privileges after migrations.
    db.prepare("UPDATE users SET is_admin = 1 WHERE username = ?").run("admin");
    return;
  }

  const now = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const hash = hashPassword("admin123", salt);

  // Default credentials (local-only app). Recommend changing after first login.
  db.prepare(`
    INSERT INTO users (
      id, username, email, display_name, avatar_data_url, is_admin, last_login_at, password_salt, password_hash, created_at
    ) VALUES (?, 'admin', 'admin@local', 'Administrador', '', 1, '', ?, ?, ?)
  `).run(randomUUID(), salt, hash, now);
}

function createUser({ username, email, displayName, password, passwordConfirmation }) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedEmail = normalizeEmail(email);
  const normalizedDisplayName = normalizeDisplayName(displayName, normalizedUsername);
  validateNewPassword(password, passwordConfirmation);

  if (findUserByUsername(normalizedUsername)) {
    throw clientError("Esse usuario ja existe.");
  }

  if (findUserByEmail(normalizedEmail)) {
    throw clientError("Esse e-mail ja esta em uso.");
  }

  return insertUserRecord(normalizedUsername, normalizedEmail, normalizedDisplayName, String(password || ""));
}

function insertUserRecord(username, email, displayName, password) {
  const now = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  const user = {
    id: randomUUID(),
    username,
    email,
    display_name: displayName,
    avatar_data_url: "",
    is_admin: 0,
    last_login_at: now,
    password_salt: salt,
    password_hash: hash,
    created_at: now,
  };

  db.prepare(`
    INSERT INTO users (
      id, username, email, display_name, avatar_data_url, is_admin, last_login_at, password_salt, password_hash, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id,
    user.username,
    user.email,
    user.display_name,
    user.avatar_data_url,
    user.is_admin,
    user.last_login_at,
    user.password_salt,
    user.password_hash,
    user.created_at
  );

  return user;
}

function findUserByUsername(username) {
  return db.prepare(`
    SELECT id, username, email, display_name, avatar_data_url, is_admin, last_login_at, password_salt, password_hash, created_at
    FROM users
    WHERE username = ?
  `).get(String(username || "").toLowerCase());
}

function findUserByEmail(email) {
  return db.prepare(`
    SELECT id, username, email, display_name, avatar_data_url, is_admin, last_login_at, password_salt, password_hash, created_at
    FROM users
    WHERE email = ?
  `).get(String(email || "").trim().toLowerCase());
}

function findUserById(userId) {
  return db.prepare(`
    SELECT id, username, email, display_name, avatar_data_url, is_admin, last_login_at, password_salt, password_hash, created_at
    FROM users
    WHERE id = ?
  `).get(userId);
}

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

function hashResetToken(rawToken) {
  return createHash("sha256").update(String(rawToken || "")).digest("hex");
}

function createPasswordResetLink(request, rawToken) {
  const host = request.headers.host || `${HOST}:${PORT}`;
  return `http://${host}/redefinir-senha?token=${encodeURIComponent(rawToken)}`;
}

async function deliverPasswordResetEmail(email, displayName, resetLink) {
  if (!isSmtpConfigured()) {
    throw clientError("Envio de e-mail ainda nao configurado no servidor. Defina SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM.");
  }

  const subject = "Redefinicao de senha do Dindin";
  const body = [
    `Oi, ${displayName || "usuario"}.`,
    ``,
    `Recebemos um pedido para redefinir sua senha no Dindin.`,
    `Use o link abaixo em ate 60 minutos:`,
    resetLink,
    ``,
    `Se voce nao pediu essa alteracao, ignore este e-mail.`,
  ].join("\r\n");

  await sendSmtpMail({
    to: email,
    subject,
    text: body,
  });
}

function isSmtpConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

async function sendSmtpMail({ to, subject, text }) {
  let socket = await openSmtpSocket();

  try {
    await readSmtpResponse(socket);
    let ehloResponse = await sendSmtpCommand(socket, `EHLO localhost`);

    if (!SMTP_SECURE && /STARTTLS/i.test(ehloResponse)) {
      await sendSmtpCommand(socket, "STARTTLS");
      socket = await upgradeSocketToTls(socket);
      ehloResponse = await sendSmtpCommand(socket, "EHLO localhost");
    }

    await sendSmtpCommand(socket, "AUTH LOGIN");
    await sendSmtpCommand(socket, Buffer.from(SMTP_USER, "utf8").toString("base64"));
    await sendSmtpCommand(socket, Buffer.from(SMTP_PASS, "utf8").toString("base64"));
    await sendSmtpCommand(socket, `MAIL FROM:<${SMTP_FROM}>`);
    await sendSmtpCommand(socket, `RCPT TO:<${to}>`);
    await sendSmtpCommand(socket, "DATA");

    const payload = buildSmtpMessage({ to, subject, text });
    socket.write(`${payload}\r\n.\r\n`);
    await readSmtpResponse(socket);
    await sendSmtpCommand(socket, "QUIT");
  } finally {
    socket.end();
  }
}

function openSmtpSocket() {
  return new Promise((resolve, reject) => {
    const socket = SMTP_SECURE
      ? tls.connect(SMTP_PORT, SMTP_HOST, { servername: SMTP_HOST })
      : net.createConnection(SMTP_PORT, SMTP_HOST);

    socket.setEncoding("utf8");
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.removeListener("error", reject);
      resolve(socket);
    });
    socket.once("secureConnect", () => {
      socket.removeListener("error", reject);
      resolve(socket);
    });
  });
}

function upgradeSocketToTls(socket) {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({
      socket,
      servername: SMTP_HOST,
    });

    secureSocket.setEncoding("utf8");
    secureSocket.once("error", reject);
    secureSocket.once("secureConnect", () => {
      secureSocket.removeListener("error", reject);
      resolve(secureSocket);
    });
  });
}

function sendSmtpCommand(socket, command) {
  socket.write(`${command}\r\n`);
  return readSmtpResponse(socket);
}

function readSmtpResponse(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";

    function cleanup() {
      socket.off("data", onData);
      socket.off("error", onError);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onData(chunk) {
      buffer += chunk;
      const lines = buffer.split("\r\n").filter(Boolean);
      const lastLine = lines[lines.length - 1] || "";

      if (!/^\d{3} /.test(lastLine)) {
        return;
      }

      cleanup();

      if (!/^[23]/.test(lastLine)) {
        reject(new Error(lastLine));
        return;
      }

      resolve(buffer);
    }

    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function buildSmtpMessage({ to, subject, text }) {
  const escapedText = String(text || "").replace(/\r?\n/g, "\r\n");
  return [
    `From: Dindin <${SMTP_FROM}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    escapedText,
  ].join("\r\n");
}

function buildBootstrapPayload(user, monthKey) {
  const month = getMonthRecord(user.id, monthKey);
  const entries = month ? listEntries(user.id, monthKey) : [];
  const templates = listTemplates(user.id);
  const months = listMonths(user.id);
  const effectiveSalaryCents = month && Number(month.salary_defined) === 1 ? month.salary_cents : 0;
  const resolvedMonthKey = month ? monthKey : normalizeMonthKey(monthKey) || getCurrentMonthKey();

  return {
    user: serializeUser(user),
    activeMonth: resolvedMonthKey,
    databaseFile: DB_FILE,
    lastAutoRolloverAt: month?.created_at || "",
    month: {
      monthKey: resolvedMonthKey,
      salary: fromCents(effectiveSalaryCents),
      summary: buildSummary(entries, effectiveSalaryCents),
      entries: entries.map(serializeEntry),
    },
    months: months.map((item) => ({
      monthKey: item.month_key,
      salary: fromCents(Number(item.salary_defined) === 1 ? item.salary_cents : 0),
      createdAt: item.created_at,
    })),
    templates: templates.map(serializeTemplate),
  };
}

function buildSummary(entries, salaryCents) {
  const total = sumCents(entries.map((entry) => entry.amount_cents));
  const paid = sumCents(entries.filter((entry) => entry.status !== "pending").map((entry) => entry.amount_cents));
  const pending = sumCents(entries.filter((entry) => entry.status === "pending").map((entry) => entry.amount_cents));
  const monthStartProjection = sumCents(entries.filter((entry) => entry.cycle === "Inicio Do Mes").map((entry) => entry.amount_cents));
  const quinzenaProjection = sumCents(entries.filter((entry) => entry.cycle === "Quinzena").map((entry) => entry.amount_cents));

  return {
    salary: fromCents(salaryCents),
    total: fromCents(total),
    paid: fromCents(paid),
    pending: fromCents(pending),
    balance: fromCents(salaryCents - total),
    monthStartProjection: fromCents(monthStartProjection),
    quinzenaProjection: fromCents(quinzenaProjection),
  };
}

function listTemplates(userId) {
  return db.prepare(`
    SELECT id, user_id, name, default_amount_cents, cycle, payment_method, observation, start_month, is_variable, sort_order, created_at
    FROM templates
    WHERE user_id = ? AND active = 1
    ORDER BY sort_order ASC, name COLLATE NOCASE ASC
  `).all(userId);
}

function listMonths(userId) {
  return db.prepare(`
    SELECT month_key, salary_cents, salary_defined, created_at
    FROM months
    WHERE user_id = ?
    ORDER BY month_key DESC
  `).all(userId);
}

function listEntries(userId, monthKey) {
  return db.prepare(`
    SELECT
      entries.id,
      entries.month_key,
      entries.template_id,
      entries.name,
      entries.amount_cents,
      entries.cycle,
      entries.payment_method,
      COALESCE(NULLIF(entries.observation, ''), templates.observation, '') AS observation,
      entries.status,
      entries.is_variable,
      entries.created_at,
      entries.updated_at
    FROM entries
    LEFT JOIN templates ON templates.id = entries.template_id
    WHERE entries.user_id = ? AND entries.month_key = ?
    ORDER BY
      CASE entries.cycle WHEN 'Inicio Do Mes' THEN 0 ELSE 1 END,
      entries.name COLLATE NOCASE ASC
  `).all(userId, monthKey);
}

function getMonthRecord(userId, monthKey) {
  return db.prepare(`
    SELECT id, user_id, month_key, salary_cents, salary_defined, created_at
    FROM months
    WHERE user_id = ? AND month_key = ?
  `).get(userId, monthKey);
}

function createEntryFromTemplate(userId, templateId, monthKey) {
  const template = db.prepare(`
    SELECT id, user_id, name, default_amount_cents, cycle, payment_method, observation, start_month, is_variable
    FROM templates
    WHERE id = ? AND user_id = ?
  `).get(templateId, userId);

  if (!template || normalizeMonthKey(template.start_month) > monthKey) {
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO entries (
      id, user_id, month_key, template_id, name, amount_cents, cycle, payment_method, observation, status, is_variable, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    userId,
    monthKey,
    template.id,
    template.name,
    template.default_amount_cents,
    template.cycle,
    template.payment_method,
    template.observation || "",
    "pending",
    template.is_variable,
    now,
    now
  );
}

function ensureEntryForTemplateInMonth(userId, templateId, monthKey) {
  // If this DB existed before the unique index, duplicates may still be present. Keep it clean.
  dedupeTemplateEntriesForMonth(userId, templateId, monthKey);

  const existing = db.prepare(`
    SELECT id
    FROM entries
    WHERE user_id = ? AND template_id = ? AND month_key = ?
  `).get(userId, templateId, monthKey);

  if (existing) {
    return;
  }

  createEntryFromTemplate(userId, templateId, monthKey);
}

function dedupeTemplateEntriesForMonth(userId, templateId, monthKey) {
  const rows = db.prepare(`
    SELECT id
    FROM entries
    WHERE user_id = ? AND month_key = ? AND template_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(userId, monthKey, templateId);

  if (rows.length <= 1) {
    return;
  }

  const idsToDelete = rows.slice(1).map((row) => row.id);
  const placeholders = idsToDelete.map(() => "?").join(",");
  db.prepare(`DELETE FROM entries WHERE id IN (${placeholders})`).run(...idsToDelete);
}

function ensureEntriesFromTemplatesForMonth(userId, monthKey) {
  const templates = listTemplates(userId);
  for (const template of templates) {
    // Variable templates should not be auto-copied to future months.
    if (Number(template.is_variable) === 1) {
      continue;
    }
    const startMonth = normalizeMonthKey(template.start_month) || getCurrentMonthKey();
    if (startMonth > monthKey) {
      continue;
    }

    ensureEntryForTemplateInMonth(userId, template.id, monthKey);
  }
}

function syncTemplateEntryForMonth(userId, templateId, monthKey) {
  const template = db.prepare(`
    SELECT id, user_id, name, default_amount_cents, cycle, payment_method, observation, start_month, is_variable
    FROM templates
    WHERE id = ? AND user_id = ? AND active = 1
  `).get(templateId, userId);

  if (!template) {
    return;
  }

  const startMonth = normalizeMonthKey(template.start_month) || getCurrentMonthKey();
  const shouldExist = startMonth <= monthKey;
  const existingEntry = db.prepare(`
    SELECT id
    FROM entries
    WHERE user_id = ? AND template_id = ? AND month_key = ?
  `).get(userId, templateId, monthKey);

  // Variable templates are not auto-created outside their original month; only update if it exists.
  if (Number(template.is_variable) === 1 && !existingEntry) {
    return;
  }

  if (!shouldExist) {
    if (existingEntry) {
      db.prepare("DELETE FROM entries WHERE id = ? AND user_id = ?").run(existingEntry.id, userId);
    }
    return;
  }

  const now = new Date().toISOString();

  if (existingEntry) {
    db.prepare(`
      UPDATE entries
      SET
        name = ?,
        amount_cents = ?,
        cycle = ?,
        payment_method = ?,
        is_variable = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      template.name,
      template.default_amount_cents,
      template.cycle,
      template.payment_method,
      template.is_variable,
      now,
      existingEntry.id,
      userId
    );
    return;
  }

  createEntryFromTemplate(userId, templateId, monthKey);
}

function ensureMonthExists(userId, monthKey) {
  if (getMonthRecord(userId, monthKey)) {
    return;
  }

  const previousMonth = listMonths(userId).find((item) => item.month_key < monthKey);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO months (id, user_id, month_key, salary_cents, salary_defined, created_at, rolled_over_from)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).run(randomUUID(), userId, monthKey, DEFAULT_SALARY_CENTS, now, previousMonth ? previousMonth.month_key : null);

  // New persisted months should start with all fixed templates that are already valid for it.
  ensureEntriesFromTemplatesForMonth(userId, monthKey);
}

function serializeEntry(entry) {
  return {
    id: entry.id,
    monthKey: entry.month_key,
    templateId: entry.template_id,
    name: entry.name,
    amount: fromCents(entry.amount_cents),
    cycle: entry.cycle,
    paymentMethod: entry.payment_method,
    observation: entry.observation,
    status: entry.status,
    isVariable: Boolean(entry.is_variable),
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

function serializeTemplate(template) {
  return {
    id: template.id,
    name: template.name,
    amount: fromCents(template.default_amount_cents),
    cycle: template.cycle,
    paymentMethod: template.payment_method,
    observation: template.observation,
    startMonth: normalizeMonthKey(template.start_month) || getCurrentMonthKey(),
    isVariable: Boolean(template.is_variable),
    createdAt: template.created_at,
  };
}

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    avatarDataUrl: String(user.avatar_data_url || ""),
    isAdmin: Boolean(user.is_admin),
    lastLoginAt: String(user.last_login_at || ""),
    createdAt: String(user.created_at || ""),
  };
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

function hashPassword(password, salt) {
  return scryptSync(String(password), String(salt), 64).toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    throw clientError("Usuario deve ter entre 3 e 24 caracteres e usar apenas letras, numeros, ponto, traco ou underline.");
  }
  return username;
}

function normalizeDisplayName(value, fallbackUsername) {
  const displayName = String(value || "").trim() || fallbackUsername;
  if (displayName.length < 3 || displayName.length > 40) {
    throw clientError("Nome de exibicao deve ter entre 3 e 40 caracteres.");
  }
  return displayName;
}

function assertAdmin(user) {
  if (!user || !user.is_admin) {
    const error = new Error("Sem acesso.");
    error.statusCode = 403;
    throw error;
  }
}

function normalizeAvatarDataUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  // Keep the DB small and avoid abuse. This is a local app, but still worth bounding.
  if (raw.length > 320_000) {
    throw clientError("Avatar muito grande. Use uma imagem menor (ate ~250 KB).");
  }

  if (!raw.startsWith("data:image/")) {
    throw clientError("Avatar invalido.");
  }

  const mime = raw.slice("data:".length).split(";")[0];
  const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  if (!allowed.has(mime)) {
    throw clientError("Formato de avatar nao suportado. Use PNG, JPG, WEBP ou GIF.");
  }

  if (!raw.includes(";base64,")) {
    throw clientError("Avatar invalido.");
  }

  return raw;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw clientError("Informe um e-mail valido.");
  }
  if (email.length > 120) {
    throw clientError("E-mail muito longo.");
  }
  return email;
}

function validateNewPassword(password, passwordConfirmation) {
  const normalizedPassword = String(password || "");
  if (normalizedPassword.length < 6) {
    throw clientError("Senha deve ter pelo menos 6 caracteres.");
  }
  if (normalizedPassword !== String(passwordConfirmation || "")) {
    throw clientError("A confirmacao da senha nao confere.");
  }
}

function validatePasswordChange(newPassword, passwordConfirmation, currentPassword) {
  validateNewPassword(newPassword, passwordConfirmation);
  if (String(newPassword || "") === String(currentPassword || "")) {
    throw clientError("A nova senha precisa ser diferente da senha atual.");
  }
}

function clientError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path
    .normalize(requestedPath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(response, 403, "Acesso negado.");
    return;
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      if (!path.extname(safePath)) {
        const indexPath = path.join(PUBLIC_DIR, "index.html");
        fs.readFile(indexPath, (indexError, indexBuffer) => {
          if (indexError) {
            sendText(response, 404, "Arquivo nao encontrado.");
            return;
          }

          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          response.end(indexBuffer);
        });
        return;
      }

      sendText(response, 404, "Arquivo nao encontrado.");
      return;
    }

    response.writeHead(200, { "Content-Type": getContentType(filePath) });
    response.end(buffer);
  });
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  };
  return map[extension] || "text/plain; charset=utf-8";
}

function sendJson(response, statusCode, payload) {
  if (!response.hasHeader("Content-Type")) {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  response.writeHead(statusCode);
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validateTemplatePayload(body) {
  if (!body || !String(body.name || "").trim()) {
    throw clientError("Nome do gasto e obrigatorio.");
  }

  normalizeCycle(body.cycle);
}

function normalizeCycle(cycle) {
  if (!["Inicio Do Mes", "Quinzena"].includes(cycle)) {
    throw clientError("Ciclo invalido.");
  }
  return cycle;
}

function normalizeStatus(status) {
  if (!["pending", "paid", "saved"].includes(status)) {
    throw clientError("Status invalido.");
  }
  return status;
}

function normalizeMonthKey(value) {
  return /^\d{4}-\d{2}$/.test(String(value || "")) ? String(value) : null;
}

function addMonthsToMonthKey(monthKey, offset) {
  const normalized = normalizeMonthKey(monthKey);
  if (!normalized) {
    return null;
  }

  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }

  const baseIndex = year * 12 + (month - 1);
  const nextIndex = baseIndex + Number(offset || 0);
  if (!Number.isFinite(nextIndex) || nextIndex < 0) {
    return null;
  }

  const nextYear = Math.floor(nextIndex / 12);
  const nextMonth = (nextIndex % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function toCents(value) {
  // JSON numbers use "." as decimal separator (e.g. 219.83). Only apply pt-BR string normalization
  // when the incoming value is not a number.
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  const raw = String(value ?? "").trim();
  let normalized = raw.replace(/[^\d,.-]/g, "");

  // pt-BR: 1.234,56 -> 1234.56
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    // pt-BR without thousands: 219,83 -> 219.83
    normalized = normalized.replace(",", ".");
  }

  normalized = normalized.replace(/[^\d.-]/g, "");
  const number = Number(normalized) || 0;
  return Math.round(number * 100);
}

function fromCents(value) {
  return Number(value || 0) / 100;
}

function sumCents(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function getCurrentMonthKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
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
