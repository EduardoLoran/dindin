const { createHash } = require("node:crypto");
const { TRUST_PROXY } = require("../config");
const { httpError } = require("../lib/errors");

const buckets = new Map();

function getClientIp(request) {
  if (TRUST_PROXY) {
    const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded.slice(0, 80);
  }
  return String(request.socket?.remoteAddress || "unknown").slice(0, 80);
}

function assertRateLimit(request, scope, identifier, maxAttempts, windowMs) {
  const now = Date.now();
  const identityHash = createHash("sha256")
    .update(`${getClientIp(request)}:${String(identifier || "")}`)
    .digest("hex");
  const key = `${scope}:${identityHash}`;
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
  }
  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > maxAttempts) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    const error = httpError(429, "Muitas tentativas. Aguarde antes de tentar novamente.", "rate_limited");
    error.retryAfter = retryAfter;
    throw error;
  }
}

function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

module.exports = { assertRateLimit, cleanupRateLimits, getClientIp };
