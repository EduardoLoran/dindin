const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, test } = require("node:test");

let verifier;
let verifierUrl;

before(async () => {
  verifier = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const token = new URLSearchParams(body).get("response");
    const payload = token === "valid-token"
      ? { success: true, hostname: "dindin.example", action: "login", "error-codes": [] }
      : token === "XXXX.DUMMY.TOKEN.XXXX"
        ? { success: true, hostname: "example.com", action: "test", "error-codes": [] }
        : { success: false, "error-codes": [token === "expired-token" ? "timeout-or-duplicate" : "invalid-input-response"] };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => verifier.listen(0, "127.0.0.1", resolve));
  verifierUrl = `http://127.0.0.1:${verifier.address().port}/verify`;

  process.env.NODE_ENV = "test";
  process.env.TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
  process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
  process.env.TURNSTILE_REQUIRED = "true";
  process.env.TURNSTILE_ALLOWED_HOSTS = "dindin.example,localhost";
  process.env.TURNSTILE_VERIFY_URL = verifierUrl;
});

after(async () => {
  if (verifier?.listening) await new Promise((resolve) => verifier.close(resolve));
});

test("Turnstile aceita token valido e hostname permitido", async () => {
  const { assertTurnstile } = require("../src/services/turnstileService");
  await assert.doesNotReject(assertTurnstile(fakeRequest(), "valid-token", "login"));
});

test("Turnstile rejeita token emitido para outra acao", async () => {
  const { assertTurnstile } = require("../src/services/turnstileService");
  await assert.rejects(assertTurnstile(fakeRequest(), "valid-token", "register"), (error) => error.code === "turnstile_invalid");
});

test("Turnstile aceita as chaves oficiais de teste em ambiente local", async () => {
  const { assertTurnstile } = require("../src/services/turnstileService");
  await assert.doesNotReject(assertTurnstile(fakeRequest(), "XXXX.DUMMY.TOKEN.XXXX"));
});

test("Turnstile rejeita token invalido ou expirado", async () => {
  const { assertTurnstile } = require("../src/services/turnstileService");
  await assert.rejects(assertTurnstile(fakeRequest(), "invalid-token"), (error) => error.code === "turnstile_invalid");
  await assert.rejects(assertTurnstile(fakeRequest(), "expired-token"), (error) => error.code === "turnstile_invalid");
});

test("Turnstile indisponivel devolve erro controlado", async () => {
  const { assertTurnstile } = require("../src/services/turnstileService");
  await new Promise((resolve) => verifier.close(resolve));
  await assert.rejects(assertTurnstile(fakeRequest(), "valid-token"), (error) => error.code === "turnstile_unavailable" && error.statusCode === 503);
});

function fakeRequest() {
  return { headers: {}, socket: { remoteAddress: "127.0.0.1" } };
}
