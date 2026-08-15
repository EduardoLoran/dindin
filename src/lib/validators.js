const { clientError, httpError } = require("./errors");
const { normalizeCycle, normalizeMonthKey, normalizeStatus, toCents } = require("./values");

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) {
    throw clientError("Usuario deve ter entre 3 e 24 caracteres e usar apenas letras, numeros, ponto, traco ou underline.");
  }
  return username;
}

function normalizeDisplayName(value, fallbackUsername) {
  const displayName = String(value || "").trim() || fallbackUsername;
  if (displayName.length < 3 || displayName.length > 60) {
    throw clientError("Nome de exibicao deve ter entre 3 e 60 caracteres.");
  }
  return displayName;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw clientError("Informe um e-mail valido.");
  }
  if (email.length > 120) throw clientError("E-mail muito longo.");
  return email;
}

function normalizeAvatarDataUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length > 320000) throw clientError("Avatar muito grande. Use uma imagem menor (ate ~250 KB).");
  if (!raw.startsWith("data:image/")) throw clientError("Avatar invalido.");
  const mime = raw.slice("data:".length).split(";")[0];
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime) || !raw.includes(";base64,")) {
    throw clientError("Formato de avatar nao suportado. Use PNG, JPG, WEBP ou GIF.");
  }
  return raw;
}

function validateNewPassword(password, passwordConfirmation) {
  const normalizedPassword = String(password || "");
  if (normalizedPassword.length < 12 || normalizedPassword.length > 128) {
    throw clientError("Senha deve ter entre 12 e 128 caracteres.");
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

function validateTemplatePayload(body) {
  assertObject(body);
  const name = normalizeText(body.name, "Nome do gasto", 1, 100);
  const amountCents = normalizeMoney(body.amount, "Valor", { minCents: 1 });
  const cycle = normalizeCycle(body.cycle);
  const paymentMethod = normalizeText(body.paymentMethod, "Forma de pagamento", 1, 40);
  const startMonth = body.startMonth ? requireMonthKey(body.startMonth) : null;
  return {
    name,
    amountCents,
    cycle,
    paymentMethod,
    startMonth,
    isVariable: normalizeBoolean(body.isVariable, "Tipo variavel"),
  };
}

function normalizeEntryUpdate(body) {
  assertObject(body);
  return {
    amountCents: normalizeMoney(body.amount, "Valor"),
    status: normalizeStatus(body.status),
    cycle: normalizeCycle(body.cycle),
    observation: normalizeText(body.observation || "", "Observacao", 0, 500),
  };
}

function normalizeMoney(value, label, { minCents = 0, maxCents = 100_000_000_00 } = {}) {
  const cents = toCents(value);
  if (!Number.isInteger(cents) || cents < minCents || cents > maxCents) {
    throw clientError(`${label} invalido.`);
  }
  return cents;
}

function normalizeText(value, label, minLength = 0, maxLength = 500) {
  const text = String(value ?? "").trim();
  if (text.length < minLength || text.length > maxLength) {
    throw clientError(`${label} deve ter entre ${minLength} e ${maxLength} caracteres.`);
  }
  return text;
}

function normalizeBoolean(value, label) {
  if (typeof value !== "boolean") throw clientError(`${label} invalido.`);
  return value;
}

function requireMonthKey(value) {
  const monthKey = normalizeMonthKey(value);
  if (!monthKey) throw clientError("Mes invalido.", "invalid_month");
  return monthKey;
}

function requireUuid(value, label = "Identificador") {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw clientError(`${label} invalido.`);
  }
  return id;
}

function assertAllowedFields(body, allowedFields) {
  assertObject(body);
  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(body).filter((field) => !allowed.has(field));
  if (unexpected.length) {
    throw clientError(`Campos nao permitidos: ${unexpected.join(", ")}.`, "unexpected_fields");
  }
}

function assertObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw clientError("Corpo da requisicao invalido.");
  }
}

function assertAdmin(user) {
  if (!user || !user.is_admin) throw httpError(403, "Sem acesso.", "forbidden");
}

module.exports = {
  normalizeUsername,
  normalizeDisplayName,
  normalizeEmail,
  normalizeAvatarDataUrl,
  validateNewPassword,
  validatePasswordChange,
  validateTemplatePayload,
  normalizeEntryUpdate,
  normalizeMoney,
  normalizeText,
  normalizeBoolean,
  requireMonthKey,
  requireUuid,
  assertAllowedFields,
  assertObject,
  assertAdmin,
};
