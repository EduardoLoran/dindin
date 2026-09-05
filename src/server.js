const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { DB_FILE, HOST, PORT, validateProductionConfig } = require("./config");
const { handleApi } = require("./api/handleApi");
const { initializeDatabase } = require("./db/schema");
const { sendJson, serveStatic } = require("./lib/http");
const { cleanupRateLimits } = require("./services/rateLimitService");
const { cleanupExpiredSessions } = require("./services/sessionService");

validateProductionConfig();
initializeDatabase();

const APP_ROUTES = new Set([
  "/",
  "/login",
  "/cadastro",
  "/esqueci-senha",
  "/redefinir-senha",
  "/trocar-senha",
  "/visao-geral",
  "/cadastros",
  "/lancamentos",
  "/detalhes",
  "/gastos-fixos",
  "/importacao-bancaria",
  "/admin/usuarios",
]);

const maintenanceTimer = setInterval(() => {
  cleanupExpiredSessions();
  cleanupRateLimits();
}, 5 * 60 * 1000);
maintenanceTimer.unref();

const server = http.createServer(async (request, response) => {
  const requestId = randomUUID();
  response.setHeader("X-Request-Id", requestId);

  try {
    const url = new URL(request.url || "/", "http://localhost");

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    if (APP_ROUTES.has(normalizeRoutePath(url.pathname))) {
      serveStatic(response, "/auth-app/index.html");
      return;
    }

    serveStatic(response, url.pathname);
  } catch (error) {
    if (response.headersSent) {
      response.destroy();
      return;
    }

    const statusCode = normalizeStatusCode(error?.statusCode);
    if (error?.retryAfter) response.setHeader("Retry-After", String(error.retryAfter));
    if (error?.allow) response.setHeader("Allow", String(error.allow));
    if (statusCode >= 500) console.error(`[${requestId}]`, error);

    sendJson(response, statusCode, {
      error: statusCode >= 500 ? "internal_error" : String(error?.code || "bad_request"),
      message: statusCode >= 500
        ? "Nao foi possivel concluir a solicitacao. Tente novamente."
        : String(error?.message || "Solicitacao invalida."),
      requestId,
    });
  }
});

server.requestTimeout = 20_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;

server.listen(PORT, HOST, () => {
  console.log(`Servidor iniciado em http://${HOST}:${server.address().port}`);
  console.log(`Banco SQLite configurado em ${DB_FILE}`);
});

function normalizeRoutePath(pathname) {
  return pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
}

function normalizeStatusCode(value) {
  const statusCode = Number(value);
  return Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
}

module.exports = { server };
