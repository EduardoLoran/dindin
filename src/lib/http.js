const fs = require("node:fs");
const path = require("node:path");
const {
  IS_PRODUCTION,
  JSON_BODY_LIMIT_BYTES,
  PUBLIC_DIR,
} = require("../config");
const { httpError } = require("./errors");

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
    ].join("; ")
  );
  if (IS_PRODUCTION) {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function sendJson(response, statusCode, payload) {
  setSecurityHeaders(response);
  response.setHeader("Cache-Control", "no-store");
  if (!response.hasHeader("Content-Type")) {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  response.writeHead(statusCode);
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, body) {
  setSecurityHeaders(response);
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > JSON_BODY_LIMIT_BYTES) {
      throw httpError(413, "Corpo da requisicao excede o limite permitido.", "payload_too_large");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "JSON invalido.", "invalid_json");
  }
}

async function readBuffer(request, limitBytes) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > limitBytes) {
      throw httpError(413, "Arquivo excede o limite permitido.", "payload_too_large");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) throw httpError(400, "Selecione um arquivo OFX.", "empty_file");
  return Buffer.concat(chunks);
}

function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "/auth-app/index.html" : pathname;
  const safePath = path.normalize(requestedPath).replace(/^[/\\]+/, "");
  const filePath = path.resolve(PUBLIC_DIR, safePath);
  const relative = path.relative(PUBLIC_DIR, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    sendText(response, 403, "Acesso negado.");
    return;
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      if (!path.extname(safePath)) {
        serveIndex(response);
        return;
      }
      sendText(response, 404, "Arquivo nao encontrado.");
      return;
    }

    setSecurityHeaders(response);
    setStaticCacheHeader(response, filePath);
    response.writeHead(200, { "Content-Type": getContentType(filePath) });
    response.end(buffer);
  });
}

function serveIndex(response) {
  const indexPath = path.join(PUBLIC_DIR, "auth-app", "index.html");
  fs.readFile(indexPath, (error, buffer) => {
    if (error) {
      sendText(response, 404, "Arquivo nao encontrado.");
      return;
    }
    setSecurityHeaders(response);
    response.setHeader("Cache-Control", "no-store");
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(buffer);
  });
}

function setStaticCacheHeader(response, filePath) {
  if (path.basename(filePath) === "index.html") {
    response.setHeader("Cache-Control", "no-store");
    return;
  }
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
}

function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return map[extension] || "application/octet-stream";
}

module.exports = {
  sendJson,
  sendText,
  readJson,
  readBuffer,
  serveStatic,
  setSecurityHeaders,
};
