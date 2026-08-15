const { ALLOWED_ORIGINS, IS_PRODUCTION, PUBLIC_URL, TURNSTILE_REQUIRED, TURNSTILE_SITE_KEY } = require("../config");
const { runInTransaction } = require("../db/schema");
const { httpError } = require("../lib/errors");
const { readJson, sendJson } = require("../lib/http");
const { serializeUser } = require("../lib/serializers");
const { verifyPassword } = require("../lib/security");
const { getCurrentMonthKey } = require("../lib/values");
const {
  assertAdmin,
  assertAllowedFields,
  assertObject,
  normalizeAvatarDataUrl,
  normalizeBoolean,
  normalizeDisplayName,
  normalizeEmail,
  normalizeEntryUpdate,
  normalizeMoney,
  normalizeText,
  normalizeUsername,
  requireMonthKey,
  requireUuid,
  validateNewPassword,
  validatePasswordChange,
  validateTemplatePayload,
} = require("../lib/validators");
const { insertAuditEvent } = require("../repositories/auditRepository");
const {
  deleteEntry,
  deleteEntriesByTemplateAndMonth,
  findEntryMonthById,
  listOwnedEntryIdsInMonth,
  updateEntriesBulk,
  updateEntry,
  updateEntryObservation,
} = require("../repositories/entryRepository");
const { getMonthRecord, listMonths, updateMonthSalary } = require("../repositories/monthRepository");
const {
  createPasswordResetToken,
  deleteActivePasswordResetTokens,
  findValidPasswordResetToken,
  markPasswordResetTokenUsed,
} = require("../repositories/passwordResetRepository");
const {
  deactivateTemplate,
  findTemplateById,
  getNextTemplateSortOrder,
  insertTemplate,
  updateTemplate,
  updateTemplateObservation,
} = require("../repositories/templateRepository");
const {
  countAdmins,
  countUsers,
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
const { buildBootstrapPayload } = require("../services/bootstrapService");
const { assertTurnstile, isTurnstileEnabled } = require("../services/turnstileService");
const { createPasswordResetLink, deliverPasswordResetEmail } = require("../services/emailService");
const {
  assertMonthOpen,
  closeMonthForUser,
  createMonthForUser,
  deleteMonthWithEntries,
  ensureEntryForTemplateInMonth,
  ensureMonthExists,
  initializeFixedEntriesForMonth,
  reopenMonthForUser,
  syncTemplateEntryForMonth,
} = require("../services/monthService");
const { assertRateLimit, getClientIp } = require("../services/rateLimitService");
const {
  assertCsrfToken,
  clearSessionsForUser,
  createSession,
  destroySessionFromRequest,
  getAuthenticatedSession,
} = require("../services/sessionService");

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);
const PASSWORD_RESET_RESPONSE = "Se o e-mail estiver cadastrado, enviaremos um link valido por 60 minutos.";

async function handleApi(request, response, url) {
  assertHttpMethod(request.method);
  assertRouteMethod(request.method, url.pathname);
  assertAllowedOrigin(request);
  assertJsonContentType(request);

  if (request.method === "GET" && url.pathname === "/api/public-config") {
    const turnstileEnabled = isTurnstileEnabled();
    sendJson(response, 200, {
      turnstile: {
        enabled: turnstileEnabled,
        required: TURNSTILE_REQUIRED,
        siteKey: turnstileEnabled ? TURNSTILE_SITE_KEY : "",
      },
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/session") {
    const session = getAuthenticatedSession(request, { rotateCsrf: true });
    sendJson(response, 200, {
      authenticated: Boolean(session),
      user: session ? serializeUser(session.user) : null,
      csrfToken: session?.csrfToken || "",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    await handleLogin(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/register") {
    await handleRegistration(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/password-reset/request") {
    await handlePasswordResetRequest(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/password-reset/validate") {
    const token = normalizeResetToken(url.searchParams.get("token"));
    const resetToken = findValidPasswordResetToken(token);
    if (!resetToken) throw httpError(404, "Link invalido ou expirado.", "not_found");
    sendJson(response, 200, { ok: true, expiresAt: resetToken.expires_at });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/password-reset/complete") {
    await handlePasswordResetComplete(request, response);
    return;
  }

  const session = getAuthenticatedSession(request);
  if (!session) throw httpError(401, "Sessao expirada. Entre novamente.", "unauthorized");

  if (MUTATION_METHODS.has(request.method)) {
    assertCsrfToken(request, session);
    assertRateLimit(request, "authenticated_mutation", session.user.id, 120, 60 * 1000);
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    destroySessionFromRequest(request, response);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (session.user.must_change_password && url.pathname !== "/api/change-password") {
    throw httpError(403, "Altere sua senha antes de continuar.", "password_change_required");
  }

  await handleAuthenticatedApi(request, response, url, session);
}

async function handleLogin(request, response) {
  const body = await readJson(request);
  assertAllowedFields(body, ["username", "password", "turnstileToken"]);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  assertRateLimit(request, "login", username, 10, 15 * 60 * 1000);
  await assertTurnstile(request, body.turnstileToken, "login");

  const user = findUserByUsername(username) || findUserByEmail(username);
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    insertAuditEvent({
      eventType: "login_failed",
      targetType: "user",
      ipAddress: getClientIp(request),
      metadata: { username: username.slice(0, 24) },
    });
    throw httpError(401, "Usuario ou senha invalidos.", "invalid_credentials");
  }

  updateLastLogin(user.id, new Date().toISOString());
  const { csrfToken } = createSession(response, user.id);
  insertAuditEvent({ userId: user.id, eventType: "login_succeeded", ipAddress: getClientIp(request) });
  const refreshedUser = findUserById(user.id);
  sendJson(response, 200, { ...buildBootstrapPayload(refreshedUser, getCurrentMonthKey()), csrfToken });
}

async function handleRegistration(request, response) {
  const body = await readJson(request);
  assertAllowedFields(body, [
    "username", "email", "displayName", "password", "passwordConfirmation", "turnstileToken",
  ]);
  assertRateLimit(request, "registration", String(body.email || ""), 5, 60 * 60 * 1000);
  await assertTurnstile(request, body.turnstileToken, "register");

  const user = createUser(body);
  const { csrfToken } = createSession(response, user.id);
  insertAuditEvent({ userId: user.id, eventType: "user_registered", ipAddress: getClientIp(request) });
  sendJson(response, 201, { ...buildBootstrapPayload(user, getCurrentMonthKey()), csrfToken });
}

async function handlePasswordResetRequest(request, response) {
  const body = await readJson(request);
  assertAllowedFields(body, ["email", "turnstileToken"]);
  const email = normalizeEmail(body.email);
  assertRateLimit(request, "password_reset_request", email, 5, 60 * 60 * 1000);
  await assertTurnstile(request, body.turnstileToken, "password-recovery");

  const user = findUserByEmail(email);
  if (user) {
    try {
      deleteActivePasswordResetTokens(user.id);
      const resetLink = createPasswordResetLink(createPasswordResetToken(user.id));
      await deliverPasswordResetEmail(user.email, user.display_name, resetLink);
      insertAuditEvent({
        userId: user.id,
        eventType: "password_reset_requested",
        ipAddress: getClientIp(request),
      });
    } catch (error) {
      console.error("Falha ao enviar recuperacao de senha:", error);
    }
  }

  sendJson(response, 200, { ok: true, message: PASSWORD_RESET_RESPONSE });
}

async function handlePasswordResetComplete(request, response) {
  const body = await readJson(request);
  assertAllowedFields(body, ["token", "newPassword", "passwordConfirmation", "turnstileToken"]);
  assertRateLimit(request, "password_reset_complete", String(body.token || ""), 5, 60 * 60 * 1000);
  await assertTurnstile(request, body.turnstileToken, "password-reset");

  const token = normalizeResetToken(body.token);
  const resetToken = findValidPasswordResetToken(token);
  if (!resetToken) throw httpError(404, "Link invalido ou expirado.", "not_found");
  validateNewPassword(body.newPassword, body.passwordConfirmation);

  runInTransaction(() => {
    updatePassword(resetToken.user_id, String(body.newPassword));
    markPasswordResetTokenUsed(resetToken.id, new Date().toISOString());
    clearSessionsForUser(resetToken.user_id);
  });
  insertAuditEvent({
    userId: resetToken.user_id,
    eventType: "password_reset_completed",
    ipAddress: getClientIp(request),
  });
  sendJson(response, 200, { ok: true, message: "Senha redefinida com sucesso. Agora voce ja pode entrar." });
}

async function handleAuthenticatedApi(request, response, url, session) {
  const user = session.user;

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    const monthKey = optionalQueryMonth(url.searchParams.get("month"));
    sendJson(response, 200, buildBootstrapPayload(user, monthKey));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/users") {
    assertAdmin(user);
    const page = normalizePage(url.searchParams.get("page"));
    const pageSize = normalizePageSize(url.searchParams.get("pageSize"));
    const total = countUsers();
    const users = listUsersForAdmin(pageSize, (page - 1) * pageSize);
    sendJson(response, 200, {
      ok: true,
      users: users.map(serializeUser),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/users") {
    assertAdmin(user);
    const body = await readJson(request);
    assertAllowedFields(body, ["username", "email", "displayName", "password", "passwordConfirmation", "isAdmin"]);
    const username = normalizeUsername(body.username);
    const email = normalizeEmail(body.email);
    const displayName = normalizeDisplayName(body.displayName, username);
    const isAdmin = normalizeBoolean(body.isAdmin, "Perfil administrador");
    validateNewPassword(body.password, body.passwordConfirmation);
    insertUserRecord(username, email, displayName, String(body.password), isAdmin);
    sendJson(response, 201, { ok: true });
    return;
  }

  const adminUserMatch = matchUuidPath(url.pathname, /^\/api\/admin\/users\/([^/]+)$/);
  if (request.method === "PATCH" && adminUserMatch) {
    assertAdmin(user);
    const target = findUserById(adminUserMatch);
    if (!target) throw httpError(404, "Usuario nao encontrado.", "not_found");
    const body = await readJson(request);
    assertAllowedFields(body, ["username", "email", "displayName", "isAdmin"]);
    const username = normalizeUsername(body.username);
    const email = normalizeEmail(body.email);
    const displayName = normalizeDisplayName(body.displayName, username);
    const isAdmin = normalizeBoolean(body.isAdmin, "Perfil administrador");
    if (target.is_admin && !isAdmin && countAdmins() <= 1) {
      throw httpError(409, "Deve existir pelo menos um administrador.", "last_admin");
    }
    updateUserByAdmin(target.id, username, email, displayName, isAdmin);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/change-password") {
    const body = await readJson(request);
    assertAllowedFields(body, ["currentPassword", "newPassword", "passwordConfirmation", "monthKey"]);
    const currentPassword = String(body.currentPassword || "");
    if (!verifyPassword(currentPassword, user.password_salt, user.password_hash)) {
      throw httpError(400, "A senha atual nao confere.", "invalid_password");
    }
    validatePasswordChange(body.newPassword, body.passwordConfirmation, currentPassword);
    const monthKey = body.monthKey ? requireMonthKey(body.monthKey) : getCurrentMonthKey();
    runInTransaction(() => {
      updatePassword(user.id, String(body.newPassword));
      clearSessionsForUser(user.id);
    });
    const { csrfToken } = createSession(response, user.id);
    const refreshedUser = findUserById(user.id);
    insertAuditEvent({ userId: user.id, eventType: "password_changed", ipAddress: getClientIp(request) });
    sendJson(response, 200, {
      ...buildBootstrapPayload(refreshedUser, monthKey),
      csrfToken,
      message: "Senha alterada com sucesso.",
    });
    return;
  }

  if ((request.method === "PATCH" || request.method === "POST") && url.pathname === "/api/profile") {
    const body = await readJson(request);
    assertAllowedFields(body, ["displayName", "avatarDataUrl"]);
    const displayName = normalizeDisplayName(body.displayName, user.username);
    const avatarDataUrl = Object.hasOwn(body, "avatarDataUrl")
      ? normalizeAvatarDataUrl(body.avatarDataUrl)
      : String(user.avatar_data_url || "");
    updateProfile(user.id, displayName, avatarDataUrl);
    sendJson(response, 200, { ok: true, user: serializeUser(findUserById(user.id)) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/months") {
    const body = await readJson(request);
    assertAllowedFields(body, ["monthKey", "salary", "includeFixedEntries"]);
    const monthKey = requireMonthKey(body.monthKey);
    const salaryCents = normalizeMoney(body.salary, "Salario");
    const includeFixedEntries = normalizeBoolean(body.includeFixedEntries, "Inclusao de gastos fixos");
    createMonthForUser(user.id, monthKey, salaryCents, includeFixedEntries);
    sendJson(response, 201, buildBootstrapPayload(user, monthKey));
    return;
  }

  const monthSalaryMatch = matchMonthPath(url.pathname, /^\/api\/months\/([^/]+)\/salary$/);
  if (request.method === "PATCH" && monthSalaryMatch) {
    const body = await readJson(request);
    assertAllowedFields(body, ["salary"]);
    assertMonthOpen(user.id, monthSalaryMatch);
    updateMonthSalary(user.id, monthSalaryMatch, normalizeMoney(body.salary, "Salario"));
    sendJson(response, 200, buildBootstrapPayload(user, monthSalaryMatch));
    return;
  }

  const initializeEntriesMatch = matchMonthPath(url.pathname, /^\/api\/months\/([^/]+)\/initialize-entries$/);
  if (request.method === "POST" && initializeEntriesMatch) {
    const body = await readJson(request);
    assertAllowedFields(body, []);
    initializeFixedEntriesForMonth(user.id, initializeEntriesMatch);
    sendJson(response, 200, buildBootstrapPayload(user, initializeEntriesMatch));
    return;
  }

  const closeMonthMatch = matchMonthPath(url.pathname, /^\/api\/months\/([^/]+)\/close$/);
  if (request.method === "POST" && closeMonthMatch) {
    const body = await readJson(request);
    assertAllowedFields(body, []);
    closeMonthForUser(user.id, closeMonthMatch);
    insertAuditEvent({ userId: user.id, eventType: "month_closed", targetType: "month", targetId: closeMonthMatch });
    sendJson(response, 200, buildBootstrapPayload(user, closeMonthMatch));
    return;
  }

  const reopenMonthMatch = matchMonthPath(url.pathname, /^\/api\/months\/([^/]+)\/reopen$/);
  if (request.method === "POST" && reopenMonthMatch) {
    const body = await readJson(request);
    assertAllowedFields(body, []);
    reopenMonthForUser(user.id, reopenMonthMatch);
    insertAuditEvent({ userId: user.id, eventType: "month_reopened", targetType: "month", targetId: reopenMonthMatch });
    sendJson(response, 200, buildBootstrapPayload(user, reopenMonthMatch));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/salary") {
    const body = await readJson(request);
    assertAllowedFields(body, ["monthKey", "salary"]);
    const monthKey = body.monthKey ? requireMonthKey(body.monthKey) : getCurrentMonthKey();
    const salaryCents = normalizeMoney(body.salary, "Salario");
    if (!getMonthRecord(user.id, monthKey)) ensureMonthExists(user.id, monthKey, { initializeFixedEntries: true });
    assertMonthOpen(user.id, monthKey);
    updateMonthSalary(user.id, monthKey, salaryCents);
    sendJson(response, 200, buildBootstrapPayload(user, monthKey));
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/entries/bulk") {
    await handleBulkEntryUpdate(request, response, user);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/templates") {
    await handleTemplateCreate(request, response, user);
    return;
  }

  const entryObservationMatch = matchUuidPath(url.pathname, /^\/api\/entries\/([^/]+)\/observation$/);
  if (request.method === "PATCH" && entryObservationMatch) {
    const row = requireOwnedEntry(user.id, entryObservationMatch);
    assertMonthOpen(user.id, row.month_key);
    const body = await readJson(request);
    assertAllowedFields(body, ["observation"]);
    const observation = normalizeText(body.observation || "", "Observacao", 0, 500);
    updateEntryObservation(user.id, entryObservationMatch, observation, new Date().toISOString());
    sendJson(response, 200, buildBootstrapPayload(user, row.month_key));
    return;
  }

  const entryMatch = matchUuidPath(url.pathname, /^\/api\/entries\/([^/]+)$/);
  if (request.method === "PATCH" && entryMatch) {
    const row = requireOwnedEntry(user.id, entryMatch);
    assertMonthOpen(user.id, row.month_key);
    const body = await readJson(request);
    assertAllowedFields(body, ["amount", "status", "cycle"]);
    const payload = normalizeEntryUpdate({ ...body, observation: "" });
    updateEntry(user.id, entryMatch, { ...payload, updatedAt: new Date().toISOString() });
    sendJson(response, 200, buildBootstrapPayload(user, row.month_key));
    return;
  }

  if (request.method === "DELETE" && entryMatch) {
    const row = requireOwnedEntry(user.id, entryMatch);
    assertMonthOpen(user.id, row.month_key);
    deleteEntry(user.id, entryMatch);
    sendJson(response, 200, buildBootstrapPayload(user, row.month_key));
    return;
  }

  const templateObservationMatch = matchUuidPath(url.pathname, /^\/api\/templates\/([^/]+)\/observation$/);
  if (request.method === "PATCH" && templateObservationMatch) {
    requireOwnedTemplate(user.id, templateObservationMatch);
    const body = await readJson(request);
    assertAllowedFields(body, ["observation", "monthKey"]);
    const monthKey = body.monthKey ? requireMonthKey(body.monthKey) : getCurrentMonthKey();
    assertMonthOpen(user.id, monthKey);
    const observation = normalizeText(body.observation || "", "Observacao", 0, 500);
    updateTemplateObservation(user.id, templateObservationMatch, observation);
    sendJson(response, 200, buildBootstrapPayload(user, monthKey));
    return;
  }

  const templateMatch = matchUuidPath(url.pathname, /^\/api\/templates\/([^/]+)$/);
  if (request.method === "PATCH" && templateMatch) {
    requireOwnedTemplate(user.id, templateMatch);
    const body = await readJson(request);
    assertAllowedFields(body, [
      "name", "amount", "cycle", "paymentMethod", "observation", "startMonth", "isVariable", "monthKey",
    ]);
    const monthKey = body.monthKey ? requireMonthKey(body.monthKey) : getCurrentMonthKey();
    assertMonthOpen(user.id, monthKey);
    const template = validateTemplatePayload(body);
    updateTemplate(user.id, templateMatch, {
      ...template,
      observation: normalizeText(body.observation || "", "Observacao", 0, 500),
      startMonth: template.startMonth || monthKey,
    });
    syncTemplateEntryForMonth(user.id, templateMatch, monthKey);
    sendJson(response, 200, buildBootstrapPayload(user, monthKey));
    return;
  }

  if (request.method === "DELETE" && templateMatch) {
    requireOwnedTemplate(user.id, templateMatch);
    const body = await readJson(request);
    assertAllowedFields(body, ["monthKey"]);
    const monthKey = body.monthKey ? requireMonthKey(body.monthKey) : getCurrentMonthKey();
    assertMonthOpen(user.id, monthKey);
    deactivateTemplate(user.id, templateMatch);
    deleteEntriesByTemplateAndMonth(user.id, templateMatch, monthKey);
    sendJson(response, 200, buildBootstrapPayload(user, monthKey));
    return;
  }

  const deleteMonthMatch = matchMonthPath(url.pathname, /^\/api\/months\/([^/]+)$/);
  if (request.method === "DELETE" && deleteMonthMatch) {
    deleteMonthWithEntries(user.id, deleteMonthMatch);
    const fallbackMonth = listMonths(user.id)[0]?.month_key || getCurrentMonthKey();
    sendJson(response, 200, buildBootstrapPayload(user, fallbackMonth));
    return;
  }

  throw httpError(404, "Rota nao encontrada.", "not_found");
}

async function handleBulkEntryUpdate(request, response, user) {
  const body = await readJson(request);
  assertAllowedFields(body, ["monthKey", "entries"]);
  const monthKey = requireMonthKey(body.monthKey);
  assertMonthOpen(user.id, monthKey);
  if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > 500) {
    throw httpError(400, "O lote deve conter entre 1 e 500 lancamentos.", "invalid_batch");
  }

  const entries = body.entries.map((item) => {
    assertAllowedFields(item, ["id", "amount", "cycle", "status", "observation"]);
    return { id: requireUuid(item.id, "Lancamento"), ...normalizeEntryUpdate(item) };
  });
  const uniqueIds = new Set(entries.map((entry) => entry.id));
  if (uniqueIds.size !== entries.length) throw httpError(400, "O lote contem lancamentos repetidos.", "duplicate_entries");

  const ownedIds = listOwnedEntryIdsInMonth(user.id, monthKey, [...uniqueIds]);
  if (ownedIds.length !== entries.length) {
    throw httpError(404, "Um ou mais lancamentos nao foram encontrados.", "not_found");
  }

  runInTransaction(() => updateEntriesBulk(user.id, monthKey, entries, new Date().toISOString()));
  sendJson(response, 200, buildBootstrapPayload(user, monthKey));
}

async function handleTemplateCreate(request, response, user) {
  const body = await readJson(request);
  assertAllowedFields(body, [
    "name", "amount", "cycle", "paymentMethod", "observation", "startMonth", "isVariable", "monthKey",
  ]);
  const monthKey = body.monthKey ? requireMonthKey(body.monthKey) : getCurrentMonthKey();
  const template = validateTemplatePayload(body);
  if (!getMonthRecord(user.id, monthKey)) ensureMonthExists(user.id, monthKey, { initializeFixedEntries: false });
  assertMonthOpen(user.id, monthKey);

  const templateId = insertTemplate(user.id, {
    ...template,
    observation: normalizeText(body.observation || "", "Observacao", 0, 500),
    startMonth: template.startMonth || monthKey,
    sortOrder: getNextTemplateSortOrder(user.id),
    createdAt: new Date().toISOString(),
  });
  ensureEntryForTemplateInMonth(user.id, templateId, monthKey);

  if (!template.isVariable) {
    for (const month of listMonths(user.id)) {
      if (month.month_key > monthKey && !month.closed_at && Number(month.fixed_entries_initialized) === 1) {
        ensureEntryForTemplateInMonth(user.id, templateId, month.month_key);
      }
    }
  }
  sendJson(response, 201, buildBootstrapPayload(user, monthKey));
}

function createUser(body) {
  const username = normalizeUsername(body.username);
  const email = normalizeEmail(body.email);
  const displayName = normalizeDisplayName(body.displayName, username);
  validateNewPassword(body.password, body.passwordConfirmation);
  if (findUserByUsername(username)) throw httpError(409, "Esse usuario ja existe.", "username_in_use");
  if (findUserByEmail(email)) throw httpError(409, "Esse e-mail ja esta em uso.", "email_in_use");
  return insertUserRecord(username, email, displayName, String(body.password));
}

function requireOwnedEntry(userId, entryId) {
  const row = findEntryMonthById(userId, entryId);
  if (!row) throw httpError(404, "Lancamento nao encontrado.", "not_found");
  return row;
}

function requireOwnedTemplate(userId, templateId) {
  const template = findTemplateById(userId, templateId, { activeOnly: true });
  if (!template) throw httpError(404, "Cadastro nao encontrado.", "not_found");
  return template;
}

function assertHttpMethod(method) {
  if (!ALLOWED_METHODS.has(method)) {
    const error = httpError(405, "Metodo HTTP nao permitido.", "method_not_allowed");
    error.allow = [...ALLOWED_METHODS].join(", ");
    throw error;
  }
}

function assertAllowedOrigin(request) {
  const origin = String(request.headers.origin || "");
  if (!origin) return;
  const configuredOrigins = new Set([...ALLOWED_ORIGINS, PUBLIC_URL].filter(Boolean));
  if (configuredOrigins.has(origin)) return;
  if (!IS_PRODUCTION && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return;
  throw httpError(403, "Origem nao permitida.", "origin_not_allowed");
}

function assertJsonContentType(request) {
  if (!MUTATION_METHODS.has(request.method)) return;
  const contentLength = Number(request.headers["content-length"] || 0);
  if (request.method === "DELETE" && contentLength === 0) return;
  const contentType = String(request.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw httpError(415, "Use Content-Type application/json.", "unsupported_media_type");
  }
}

function assertRouteMethod(method, pathname) {
  const allowed = allowedMethodsForPath(pathname);
  if (!allowed || allowed.includes(method)) return;
  const error = httpError(405, "Metodo HTTP nao permitido para esta rota.", "method_not_allowed");
  error.allow = allowed.join(", ");
  throw error;
}

function allowedMethodsForPath(pathname) {
  const exactRoutes = {
    "/api/public-config": ["GET"],
    "/api/session": ["GET"],
    "/api/login": ["POST"],
    "/api/register": ["POST"],
    "/api/password-reset/request": ["POST"],
    "/api/password-reset/validate": ["GET"],
    "/api/password-reset/complete": ["POST"],
    "/api/logout": ["POST"],
    "/api/bootstrap": ["GET"],
    "/api/admin/users": ["GET", "POST"],
    "/api/change-password": ["POST"],
    "/api/profile": ["PATCH", "POST"],
    "/api/months": ["POST"],
    "/api/salary": ["POST"],
    "/api/entries/bulk": ["PATCH"],
    "/api/templates": ["POST"],
  };
  if (exactRoutes[pathname]) return exactRoutes[pathname];
  if (/^\/api\/admin\/users\/[^/]+$/.test(pathname)) return ["PATCH"];
  if (/^\/api\/months\/[^/]+\/salary$/.test(pathname)) return ["PATCH"];
  if (/^\/api\/months\/[^/]+\/(initialize-entries|close|reopen)$/.test(pathname)) return ["POST"];
  if (/^\/api\/months\/[^/]+$/.test(pathname)) return ["DELETE"];
  if (/^\/api\/entries\/[^/]+\/observation$/.test(pathname)) return ["PATCH"];
  if (/^\/api\/entries\/[^/]+$/.test(pathname)) return ["PATCH", "DELETE"];
  if (/^\/api\/templates\/[^/]+\/observation$/.test(pathname)) return ["PATCH"];
  if (/^\/api\/templates\/[^/]+$/.test(pathname)) return ["PATCH", "DELETE"];
  return null;
}

function matchUuidPath(pathname, expression) {
  const match = pathname.match(expression);
  return match ? requireUuid(match[1]) : null;
}

function matchMonthPath(pathname, expression) {
  const match = pathname.match(expression);
  return match ? requireMonthKey(decodeURIComponent(match[1])) : null;
}

function normalizeResetToken(value) {
  const token = String(value || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(token)) throw httpError(404, "Link invalido ou expirado.", "not_found");
  return token;
}

function optionalQueryMonth(value) {
  return value ? requireMonthKey(value) : getCurrentMonthKey();
}

function normalizePage(value) {
  const page = Number(value || 1);
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000) throw httpError(400, "Pagina invalida.", "invalid_page");
  return page;
}

function normalizePageSize(value) {
  const pageSize = Number(value || 25);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw httpError(400, "O limite por pagina deve estar entre 1 e 100.", "invalid_page_size");
  }
  return pageSize;
}

module.exports = { handleApi };
