const { runInTransaction } = require("../db/schema");
const { clientError } = require("../lib/errors");
const { readJson, sendJson } = require("../lib/http");
const { serializeUser } = require("../lib/serializers");
const { verifyPassword } = require("../lib/security");
const {
  addMonthsToMonthKey,
  getCurrentMonthKey,
  normalizeCycle,
  normalizeMonthKey,
  normalizeStatus,
  toCents,
} = require("../lib/values");
const {
  assertAdmin,
  normalizeAvatarDataUrl,
  normalizeDisplayName,
  normalizeEmail,
  normalizeUsername,
  validateNewPassword,
  validatePasswordChange,
  validateTemplatePayload,
} = require("../lib/validators");
const { buildBootstrapPayload } = require("../services/bootstrapService");
const { createPasswordResetLink, deliverPasswordResetEmail } = require("../services/emailService");
const {
  deleteMonthWithEntries,
  ensureEntriesFromTemplatesForMonth,
  ensureEntryForTemplateInMonth,
  ensureMonthExists,
  syncTemplateEntryForMonth,
} = require("../services/monthService");
const {
  clearSessionsForUser,
  createSession,
  destroySessionFromRequest,
  getAuthenticatedUser,
} = require("../services/sessionService");
const {
  countAdmins,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  insertUserRecord,
  listUsersForAdmin,
  updateLastLogin,
  updatePassword,
  updateProfile,
  updateUserByAdmin,
} = require("../repositories/userRepository");
const {
  createPasswordResetToken,
  deleteActivePasswordResetTokens,
  findValidPasswordResetToken,
  markPasswordResetTokenUsed,
} = require("../repositories/passwordResetRepository");
const {
  deleteEntry,
  deleteEntriesByTemplateAndMonth,
  findEntryMonthById,
  updateEntry,
  updateEntryObservation,
} = require("../repositories/entryRepository");
const { getMonthRecord, listMonths, updateMonthSalary } = require("../repositories/monthRepository");
const {
  deactivateTemplate,
  getNextTemplateSortOrder,
  insertTemplate,
  updateTemplate,
  updateTemplateObservation,
} = require("../repositories/templateRepository");

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

    updateLastLogin(user.id, new Date().toISOString());
    createSession(response, user.id);
    sendJson(response, 200, buildBootstrapPayload(user, getCurrentMonthKey()));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/register") {
    const body = await readJson(request);
    const user = createUser(body);

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

    runInTransaction(() => {
      updatePassword(resetToken.user_id, newPassword);
      markPasswordResetTokenUsed(resetToken.id, new Date().toISOString());
    });

    clearSessionsForUser(resetToken.user_id);

    sendJson(response, 200, {
      ok: true,
      message: "Senha redefinida com sucesso. Agora voce ja pode entrar.",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    destroySessionFromRequest(request, response);
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
    const users = listUsersForAdmin();
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

    insertUserRecord(username, email, displayName, String(body.password || ""), Boolean(body.isAdmin));
    sendJson(response, 201, { ok: true });
    return;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/admin/users/")) {
    assertAdmin(user);
    const targetId = String(url.pathname.split("/").pop() || "").trim();
    if (!targetId) {
      throw clientError("Usuario invalido.");
    }

    const body = await readJson(request);
    const target = findUserById(targetId);
    if (!target) {
      sendJson(response, 404, { error: "not_found", message: "Usuario nao encontrado." });
      return;
    }

    const nextUsername = normalizeUsername(body.username);
    const nextEmail = normalizeEmail(body.email);
    const nextDisplayName = normalizeDisplayName(body.displayName, nextUsername);
    const nextIsAdmin = Boolean(body.isAdmin);

    if (target.is_admin && !nextIsAdmin && countAdmins() <= 1) {
      throw clientError("Deve existir pelo menos um administrador.");
    }

    updateUserByAdmin(targetId, nextUsername, nextEmail, nextDisplayName, nextIsAdmin);
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
    updatePassword(user.id, nextPassword);
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
    updateMonthSalary(user.id, monthKey, salaryCents);
    sendJson(response, 200, buildBootstrapPayload(user, monthKey));
    return;
  }

  if ((request.method === "PATCH" || request.method === "POST") && url.pathname === "/api/profile") {
    const body = await readJson(request);
    const nextDisplayName = normalizeDisplayName(body.displayName, user.username);
    const hasAvatarDataUrl = Object.prototype.hasOwnProperty.call(body, "avatarDataUrl");
    const nextAvatarDataUrl = hasAvatarDataUrl ? normalizeAvatarDataUrl(body.avatarDataUrl) : String(user.avatar_data_url || "");
    updateProfile(user.id, nextDisplayName, nextAvatarDataUrl);

    const refreshedUser = findUserById(user.id);
    sendJson(response, 200, { ok: true, user: serializeUser(refreshedUser) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/templates") {
    const body = await readJson(request);
    validateTemplatePayload(body);
    const monthKey = normalizeMonthKey(body.monthKey) || getCurrentMonthKey();
    ensureMonthExists(user.id, monthKey);

    const templateId = insertTemplate(user.id, {
      name: String(body.name).trim(),
      amountCents: toCents(body.amount),
      cycle: body.cycle,
      paymentMethod: String(body.paymentMethod || "").trim(),
      observation: String(body.observation || "").trim(),
      startMonth: monthKey,
      isVariable: Boolean(body.isVariable),
      sortOrder: getNextTemplateSortOrder(user.id),
      createdAt: new Date().toISOString(),
    });

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
    const updated = updateEntryObservation(user.id, entryId, observation, new Date().toISOString());

    if (!updated.changes) {
      sendJson(response, 404, { error: "not_found", message: "Lancamento nao encontrado." });
      return;
    }

    const row = findEntryMonthById(user.id, entryId);
    sendJson(response, 200, buildBootstrapPayload(user, row.month_key));
    return;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/entries/")) {
    const entryId = url.pathname.split("/").pop();
    const body = await readJson(request);
    const updated = updateEntry(user.id, entryId, {
      amountCents: toCents(body.amount),
      status: normalizeStatus(body.status),
      cycle: normalizeCycle(body.cycle),
      updatedAt: new Date().toISOString(),
    });

    if (!updated.changes) {
      sendJson(response, 404, { error: "not_found", message: "Lancamento nao encontrado." });
      return;
    }

    const row = findEntryMonthById(user.id, entryId);
    sendJson(response, 200, buildBootstrapPayload(user, row.month_key));
    return;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/templates/") && url.pathname.endsWith("/observation")) {
    const templateId = url.pathname.split("/")[3];
    const body = await readJson(request);
    const observation = String(body.observation || "").trim();
    const monthKey = normalizeMonthKey(body.monthKey) || getCurrentMonthKey();
    const updated = updateTemplateObservation(user.id, templateId, observation);

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

    const updated = updateTemplate(user.id, templateId, {
      name: String(body.name).trim(),
      amountCents: toCents(body.amount),
      cycle: body.cycle,
      paymentMethod: String(body.paymentMethod || "").trim(),
      startMonth,
      isVariable: Boolean(body.isVariable),
    });

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
    const row = findEntryMonthById(user.id, entryId);

    if (!row) {
      sendJson(response, 404, { error: "not_found", message: "Lancamento nao encontrado." });
      return;
    }

    deleteEntry(user.id, entryId);
    sendJson(response, 200, buildBootstrapPayload(user, row.month_key));
    return;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/templates/")) {
    const templateId = url.pathname.split("/").pop();
    const body = await readJson(request);
    const monthKey = normalizeMonthKey(body.monthKey) || getCurrentMonthKey();
    const updated = deactivateTemplate(user.id, templateId);

    if (!updated.changes) {
      sendJson(response, 404, { error: "not_found", message: "Cadastro nao encontrado." });
      return;
    }

    deleteEntriesByTemplateAndMonth(user.id, templateId, monthKey);
    sendJson(response, 200, buildBootstrapPayload(user, monthKey));
    return;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/months/")) {
    const monthKey = normalizeMonthKey(url.pathname.split("/").pop());
    if (!monthKey) {
      sendJson(response, 400, { error: "invalid_month", message: "Mes invalido." });
      return;
    }

    deleteMonthWithEntries(user.id, monthKey);
    const remainingMonths = listMonths(user.id);
    const fallbackMonth = remainingMonths[0]?.month_key || getCurrentMonthKey();
    sendJson(response, 200, buildBootstrapPayload(user, fallbackMonth));
    return;
  }

  sendJson(response, 404, { error: "not_found", message: "Rota nao encontrada." });
}

module.exports = {
  handleApi,
};
