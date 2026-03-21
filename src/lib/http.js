const fs = require("node:fs");
const path = require("node:path");
const { PUBLIC_DIR } = require("../config");

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

module.exports = {
  sendJson,
  sendText,
  readJson,
  serveStatic,
};
