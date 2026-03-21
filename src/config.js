const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.join(__dirname, "..");
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 3030;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
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

module.exports = {
  ROOT_DIR,
  HOST,
  PORT,
  PUBLIC_DIR,
  DATA_DIR,
  DB_FILE,
  DEFAULT_SALARY_CENTS,
  SESSION_COOKIE,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
};
