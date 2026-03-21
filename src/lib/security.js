const { createHash, scryptSync, timingSafeEqual } = require("node:crypto");

function hashPassword(password, salt) {
  return scryptSync(String(password), String(salt), 64).toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashResetToken(rawToken) {
  return createHash("sha256").update(String(rawToken || "")).digest("hex");
}

module.exports = {
  hashPassword,
  verifyPassword,
  hashResetToken,
};
