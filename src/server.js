const http = require("node:http");
const { DB_FILE, HOST, PORT } = require("./config");
const { handleApi } = require("./api/handleApi");
const { initializeDatabase } = require("./db/schema");
const { sendJson, serveStatic } = require("./lib/http");

initializeDatabase();

const PUBLIC_AUTH_ROUTES = new Set([
  "/",
  "/login",
  "/cadastro",
  "/esqueci-senha",
  "/redefinir-senha",
  "/visao-geral",
  "/cadastros",
  "/lancamentos",
  "/detalhes",
  "/gastos-fixos",
  "/admin/usuarios",
]);

function normalizeRoutePath(pathname) {
  if (pathname === "/") {
    return pathname;
  }

  return pathname.replace(/\/+$/, "");
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    if (PUBLIC_AUTH_ROUTES.has(normalizeRoutePath(url.pathname))) {
      serveStatic(response, "/auth-app/index.html");
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

module.exports = {
  server,
};
