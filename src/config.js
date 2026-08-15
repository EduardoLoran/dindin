const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.join(__dirname, "..");
const NODE_ENV = String(process.env.NODE_ENV || "development").trim().toLowerCase();
const IS_PRODUCTION = NODE_ENV === "production";
const HOST = String(process.env.HOST || "127.0.0.1").trim();
const PORT = Number(process.env.PORT) || 3030;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_FILE = path.resolve(String(process.env.DB_FILE || path.join(DATA_DIR, "gastos.sqlite")));
const DEFAULT_SALARY_CENTS = 0;
const SESSION_COOKIE = IS_PRODUCTION ? "__Host-dindin_session" : "dindin_session";
const SESSION_IDLE_SECONDS = positiveInteger(process.env.SESSION_IDLE_SECONDS, 30 * 60);
const SESSION_ABSOLUTE_SECONDS = positiveInteger(process.env.SESSION_ABSOLUTE_SECONDS, 24 * 60 * 60);
const JSON_BODY_LIMIT_BYTES = positiveInteger(process.env.JSON_BODY_LIMIT_BYTES, 512 * 1024);
const PUBLIC_URL = String(process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
const ALLOWED_ORIGINS = csvValues(process.env.ALLOWED_ORIGINS || PUBLIC_URL);
const TRUST_PROXY = String(process.env.TRUST_PROXY ?? (IS_PRODUCTION ? "true" : "false")) === "true";
const TURNSTILE_SITE_KEY = String(process.env.TURNSTILE_SITE_KEY || "").trim();
const TURNSTILE_SECRET_KEY = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
const TURNSTILE_ALLOWED_HOSTS = csvValues(process.env.TURNSTILE_ALLOWED_HOSTS || hostnameFromUrl(PUBLIC_URL));
const TURNSTILE_REQUIRED = String(process.env.TURNSTILE_REQUIRED ?? (IS_PRODUCTION ? "true" : "false")) === "true";
const TURNSTILE_VERIFY_URL = IS_PRODUCTION
  ? "https://challenges.cloudflare.com/turnstile/v0/siteverify"
  : String(process.env.TURNSTILE_VERIFY_URL || "https://challenges.cloudflare.com/turnstile/v0/siteverify");
const INITIAL_ADMIN_USERNAME = String(process.env.INITIAL_ADMIN_USERNAME || "").trim().toLowerCase();
const INITIAL_ADMIN_EMAIL = String(process.env.INITIAL_ADMIN_EMAIL || "").trim().toLowerCase();
const INITIAL_ADMIN_DISPLAY_NAME = String(process.env.INITIAL_ADMIN_DISPLAY_NAME || "Administrador").trim();
const INITIAL_ADMIN_PASSWORD = String(process.env.INITIAL_ADMIN_PASSWORD || "");
const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "").trim() === "true" || SMTP_PORT === 465;
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "");
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER).trim();

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function csvValues(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function validateProductionConfig() {
  if (!IS_PRODUCTION) return;

  if (!PUBLIC_URL || !PUBLIC_URL.startsWith("https://")) {
    throw new Error("PUBLIC_URL deve usar HTTPS em producao.");
  }

  if (!ALLOWED_ORIGINS.length) {
    throw new Error("ALLOWED_ORIGINS deve conter ao menos a origem publica em producao.");
  }

  if (TURNSTILE_REQUIRED && (!TURNSTILE_SITE_KEY || !TURNSTILE_SECRET_KEY)) {
    throw new Error("TURNSTILE_SITE_KEY e TURNSTILE_SECRET_KEY sao obrigatorias em producao.");
  }

  if (isTurnstileTestKey(TURNSTILE_SITE_KEY) || isTurnstileTestKey(TURNSTILE_SECRET_KEY)) {
    throw new Error("As chaves de teste do Cloudflare Turnstile nao podem ser usadas em producao.");
  }
}

function isTurnstileTestKey(value) {
  return /^[123]x0{20,}/.test(String(value || ""));
}

module.exports = {
  ROOT_DIR,
  NODE_ENV,
  IS_PRODUCTION,
  HOST,
  PORT,
  PUBLIC_DIR,
  DATA_DIR,
  DB_FILE,
  DEFAULT_SALARY_CENTS,
  SESSION_COOKIE,
  SESSION_IDLE_SECONDS,
  SESSION_ABSOLUTE_SECONDS,
  JSON_BODY_LIMIT_BYTES,
  PUBLIC_URL,
  ALLOWED_ORIGINS,
  TRUST_PROXY,
  TURNSTILE_SITE_KEY,
  TURNSTILE_SECRET_KEY,
  TURNSTILE_ALLOWED_HOSTS,
  TURNSTILE_REQUIRED,
  TURNSTILE_VERIFY_URL,
  isTurnstileTestKey,
  INITIAL_ADMIN_USERNAME,
  INITIAL_ADMIN_EMAIL,
  INITIAL_ADMIN_DISPLAY_NAME,
  INITIAL_ADMIN_PASSWORD,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  validateProductionConfig,
};
