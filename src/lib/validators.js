const { clientError } = require("./errors");
const { normalizeCycle } = require("./values");

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

function normalizeAvatarDataUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (raw.length > 320000) {
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

function validateTemplatePayload(body) {
  if (!body || !String(body.name || "").trim()) {
    throw clientError("Nome do gasto e obrigatorio.");
  }

  normalizeCycle(body.cycle);
}

function assertAdmin(user) {
  if (!user || !user.is_admin) {
    const error = new Error("Sem acesso.");
    error.statusCode = 403;
    throw error;
  }
}

module.exports = {
  normalizeUsername,
  normalizeDisplayName,
  normalizeEmail,
  normalizeAvatarDataUrl,
  validateNewPassword,
  validatePasswordChange,
  validateTemplatePayload,
  assertAdmin,
};
