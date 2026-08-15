const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { after, before, test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");

let serverProcess;
let baseUrl;
let databaseFile;
let temporaryDirectory;
let userA;
let userB;
let entryA;
let templateA;

before(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dindin-test-"));
  databaseFile = path.join(temporaryDirectory, "gastos.sqlite");
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  await startServer(port);
});

after(async () => {
  await stopServer();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("cadastro publico cria sessoes separadas com CSRF", async () => {
  userA = await register("usuario-a", "usuario-a@example.com");
  userB = await register("usuario-b", "usuario-b@example.com");
  assert.ok(userA.cookie.startsWith("dindin_session="));
  assert.ok(userA.csrfToken);
  assert.notEqual(userA.cookie, userB.cookie);
});

test("login aceita nome de usuario ou e-mail", async () => {
  const byUsername = await request("/api/login", {
    method: "POST",
    body: { username: "usuario-a", password: "StrongPassword1!", turnstileToken: "" },
  });
  const byEmail = await request("/api/login", {
    method: "POST",
    body: { username: "usuario-a@example.com", password: "StrongPassword1!", turnstileToken: "" },
  });
  assert.equal(byUsername.status, 200);
  assert.equal(byEmail.status, 200);
  assert.equal(byUsername.payload.user.id, byEmail.payload.user.id);
});

test("CSRF, origem, campos extras, metodo e limite de payload sao validados", async () => {
  const noCsrf = await request("/api/months", {
    method: "POST",
    body: { monthKey: "2026-09", salary: 5000, includeFixedEntries: false },
    cookie: userA.cookie,
    csrfToken: "",
  });
  assert.equal(noCsrf.status, 403);
  assert.equal(noCsrf.payload.error, "invalid_csrf");

  const badOrigin = await request("/api/months", {
    method: "POST",
    body: { monthKey: "2026-09", salary: 5000, includeFixedEntries: false },
    session: userA,
    origin: "https://example.invalid",
  });
  assert.equal(badOrigin.status, 403);
  assert.equal(badOrigin.payload.error, "origin_not_allowed");

  const extraField = await request("/api/months", {
    method: "POST",
    body: { monthKey: "2026-09", salary: 5000, includeFixedEntries: false, isAdmin: true },
    session: userA,
  });
  assert.equal(extraField.status, 400);
  assert.equal(extraField.payload.error, "unexpected_fields");

  const wrongMethod = await request("/api/bootstrap", { method: "POST", body: {}, session: userA });
  assert.equal(wrongMethod.status, 405);

  const oversized = await request("/api/profile", {
    method: "PATCH",
    rawBody: JSON.stringify({ displayName: "Usuario A", filler: "x".repeat(513 * 1024) }),
    session: userA,
  });
  assert.equal(oversized.status, 413);
});

test("mes pode nascer somente com salario e inicializar gastos fixos depois", async () => {
  const created = await request("/api/months", {
    method: "POST",
    body: { monthKey: "2026-09", salary: 5000, includeFixedEntries: false },
    session: userA,
  });
  assert.equal(created.status, 201);
  assert.equal(created.payload.month.salaryDefined, true);
  assert.equal(created.payload.month.fixedEntriesInitialized, false);
  assert.equal(created.payload.month.entries.length, 0);

  const template = await request("/api/templates", {
    method: "POST",
    body: {
      name: "Aluguel",
      amount: 1200,
      cycle: "Inicio Do Mes",
      paymentMethod: "Pix",
      observation: "Vencimento dia 5",
      startMonth: "2026-09",
      isVariable: false,
      monthKey: "2026-09",
    },
    session: userA,
  });
  assert.equal(template.status, 201);
  entryA = template.payload.month.entries[0];
  templateA = template.payload.templates[0];
  assert.ok(entryA?.id);

  const salaryOnly = await request("/api/months", {
    method: "POST",
    body: { monthKey: "2026-10", salary: 5100, includeFixedEntries: false },
    session: userA,
  });
  assert.equal(salaryOnly.payload.month.entries.length, 0);

  const initialized = await request("/api/months/2026-10/initialize-entries", {
    method: "POST", body: {}, session: userA,
  });
  assert.equal(initialized.status, 200);
  assert.equal(initialized.payload.month.fixedEntriesInitialized, true);
  assert.equal(initialized.payload.month.entries.length, 1);

  const withFixed = await request("/api/months", {
    method: "POST",
    body: { monthKey: "2026-11", salary: 5200, includeFixedEntries: true },
    session: userA,
  });
  assert.equal(withFixed.status, 201);
  assert.equal(withFixed.payload.month.entries.length, 1);

  const readOnlyBootstrap = await request("/api/bootstrap?month=2026-12", { session: userA });
  assert.equal(readOnlyBootstrap.status, 200);
  assert.equal(readOnlyBootstrap.payload.month.entries.length, 0);
  assert.equal(readOnlyBootstrap.payload.months.some((month) => month.monthKey === "2026-12"), false);
});

test("BOLA devolve 404 para o ID de outro usuario", async () => {
  const response = await request(`/api/entries/${entryA.id}`, {
    method: "PATCH",
    body: { amount: 999, cycle: "Quinzena", status: "paid" },
    session: userB,
  });
  assert.equal(response.status, 404);
});

test("mes fechado bloqueia mutacoes e reabertura restaura o acesso", async () => {
  const closed = await request("/api/months/2026-09/close", { method: "POST", body: {}, session: userA });
  assert.equal(closed.status, 200);
  assert.equal(closed.payload.month.isClosed, true);

  const blocked = await request("/api/entries/bulk", {
    method: "PATCH",
    body: { monthKey: "2026-09", entries: [{ id: entryA.id, amount: 1250, cycle: "Inicio Do Mes", status: "paid", observation: "Pago" }] },
    session: userA,
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.payload.error, "month_closed");

  const blockedRequests = [
    request("/api/months/2026-09/salary", { method: "PATCH", body: { salary: 6000 }, session: userA }),
    request("/api/salary", { method: "POST", body: { monthKey: "2026-09", salary: 6000 }, session: userA }),
    request(`/api/entries/${entryA.id}`, { method: "PATCH", body: { amount: 1300, cycle: "Quinzena", status: "paid" }, session: userA }),
    request(`/api/entries/${entryA.id}/observation`, { method: "PATCH", body: { observation: "Bloqueada" }, session: userA }),
    request(`/api/entries/${entryA.id}`, { method: "DELETE", session: userA }),
    request("/api/templates", { method: "POST", body: { name: "Novo", amount: 10, cycle: "Quinzena", paymentMethod: "Pix", observation: "", startMonth: "2026-09", isVariable: false, monthKey: "2026-09" }, session: userA }),
    request(`/api/templates/${templateA.id}`, { method: "PATCH", body: { name: "Aluguel alterado", amount: 1300, cycle: "Inicio Do Mes", paymentMethod: "Pix", observation: "", startMonth: "2026-09", isVariable: false, monthKey: "2026-09" }, session: userA }),
    request(`/api/templates/${templateA.id}/observation`, { method: "PATCH", body: { observation: "Bloqueada", monthKey: "2026-09" }, session: userA }),
    request(`/api/templates/${templateA.id}`, { method: "DELETE", body: { monthKey: "2026-09" }, session: userA }),
    request("/api/months/2026-09/initialize-entries", { method: "POST", body: {}, session: userA }),
    request("/api/months/2026-09", { method: "DELETE", session: userA }),
  ];
  for (const response of await Promise.all(blockedRequests)) {
    assert.equal(response.status, 409);
    assert.equal(response.payload.error, "month_closed");
  }

  const reopened = await request("/api/months/2026-09/reopen", { method: "POST", body: {}, session: userA });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.payload.month.isClosed, false);

  const saved = await request("/api/entries/bulk", {
    method: "PATCH",
    body: { monthKey: "2026-09", entries: [{ id: entryA.id, amount: 1250, cycle: "Inicio Do Mes", status: "paid", observation: "Pago" }] },
    session: userA,
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.payload.month.entries[0].amount, 1250);
});

test("falha no segundo item do lote faz rollback da transacao inteira", async () => {
  const secondTemplate = await request("/api/templates", {
    method: "POST",
    body: {
      name: "Energia",
      amount: 50,
      cycle: "Quinzena",
      paymentMethod: "Boleto",
      observation: "",
      startMonth: "2026-09",
      isVariable: true,
      monthKey: "2026-09",
    },
    session: userA,
  });
  const secondEntry = secondTemplate.payload.month.entries.find((entry) => entry.name === "Energia");
  assert.ok(secondEntry?.id);

  const database = new DatabaseSync(databaseFile);
  database.exec(`
    CREATE TRIGGER fail_second_bulk_update
    BEFORE UPDATE ON entries
    WHEN NEW.id = '${secondEntry.id}'
    BEGIN
      SELECT RAISE(ABORT, 'forced bulk failure');
    END;
  `);
  database.close();

  const failed = await request("/api/entries/bulk", {
    method: "PATCH",
    body: {
      monthKey: "2026-09",
      entries: [
        { id: entryA.id, amount: 9999, cycle: "Quinzena", status: "pending", observation: "Nao salvar" },
        { id: secondEntry.id, amount: 10, cycle: "Quinzena", status: "paid", observation: "Nao salvar" },
      ],
    },
    session: userA,
  });
  assert.equal(failed.status, 500);
  assert.equal(failed.payload.error, "internal_error");

  const cleanupDatabase = new DatabaseSync(databaseFile);
  cleanupDatabase.exec("DROP TRIGGER fail_second_bulk_update;");
  cleanupDatabase.close();

  const bootstrap = await request("/api/bootstrap?month=2026-09", { session: userA });
  const unchanged = bootstrap.payload.month.entries.find((entry) => entry.id === entryA.id);
  assert.equal(unchanged.amount, 1250);
  assert.equal(unchanged.status, "paid");
  const unchangedSecond = bootstrap.payload.month.entries.find((entry) => entry.id === secondEntry.id);
  assert.equal(unchangedSecond.amount, 50);
  assert.equal(unchangedSecond.status, "pending");
});

test("troca obrigatoria de senha bloqueia APIs e renova a sessao", async () => {
  const database = new DatabaseSync(databaseFile);
  database.prepare("UPDATE users SET must_change_password = 1 WHERE username = ?").run("usuario-b");
  database.close();

  const blocked = await request("/api/bootstrap?month=2026-09", { session: userB });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.payload.error, "password_change_required");

  const changed = await request("/api/change-password", {
    method: "POST",
    body: {
      currentPassword: "StrongPassword1!",
      newPassword: "ChangedPassword2!",
      passwordConfirmation: "ChangedPassword2!",
      monthKey: "2026-09",
    },
    session: userB,
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.payload.user.mustChangePassword, false);
  userB = { cookie: cookieFromResponse(changed), csrfToken: changed.payload.csrfToken };

  const released = await request("/api/bootstrap?month=2026-09", { session: userB });
  assert.equal(released.status, 200);
});

test("recuperacao nao revela se o e-mail existe", async () => {
  const existing = await request("/api/password-reset/request", {
    method: "POST", body: { email: "usuario-a@example.com", turnstileToken: "" },
  });
  const missing = await request("/api/password-reset/request", {
    method: "POST", body: { email: "nao-existe@example.com", turnstileToken: "" },
  });
  assert.equal(existing.status, 200);
  assert.equal(missing.status, 200);
  assert.equal(existing.payload.message, missing.payload.message);
});

test("rate limiting devolve 429 e Retry-After", async () => {
  let response;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    response = await request("/api/login", {
      method: "POST",
      body: { username: "rate-user", password: "senha-incorreta", turnstileToken: "" },
    });
  }
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
});

test("sessao opaca sobrevive ao reinicio e logout a invalida", async () => {
  const port = Number(new URL(baseUrl).port);
  await stopServer();
  await startServer(port);

  const persisted = await request("/api/session", { cookie: userA.cookie });
  assert.equal(persisted.status, 200);
  assert.equal(persisted.payload.authenticated, true);
  userA.csrfToken = persisted.payload.csrfToken;

  const logout = await request("/api/logout", { method: "POST", body: {}, session: userA });
  assert.equal(logout.status, 200);
  const loggedOut = await request("/api/session", { cookie: userA.cookie });
  assert.equal(loggedOut.payload.authenticated, false);
});

test("sessao expira por inatividade no servidor", async () => {
  const port = Number(new URL(baseUrl).port);
  await stopServer();
  await startServer(port, { SESSION_IDLE_SECONDS: "1", SESSION_ABSOLUTE_SECONDS: "10" });

  const login = await request("/api/login", {
    method: "POST",
    body: { username: "initial-admin", password: "StrongAdminPassword1!", turnstileToken: "" },
  });
  assert.equal(login.status, 200);
  const cookie = cookieFromResponse(login);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const expired = await request("/api/session", { cookie });
  assert.equal(expired.payload.authenticated, false);
});

async function register(username, email) {
  const response = await request("/api/register", {
    method: "POST",
    body: {
      displayName: username,
      username,
      email,
      password: "StrongPassword1!",
      passwordConfirmation: "StrongPassword1!",
      turnstileToken: "",
    },
  });
  assert.equal(response.status, 201);
  return { cookie: cookieFromResponse(response), csrfToken: response.payload.csrfToken };
}

async function request(pathname, options = {}) {
  const method = options.method || "GET";
  const session = options.session || {};
  const headers = { Origin: options.origin === undefined ? baseUrl : options.origin };
  const cookie = options.cookie ?? session.cookie;
  const csrfToken = options.csrfToken ?? session.csrfToken;
  if (cookie) headers.Cookie = cookie;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  let body;
  if (Object.prototype.hasOwnProperty.call(options, "rawBody")) body = options.rawBody;
  else if (Object.prototype.hasOwnProperty.call(options, "body")) body = JSON.stringify(options.body);
  if (body !== undefined) headers["Content-Type"] = options.contentType || "application/json";

  const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, headers: response.headers, payload };
}

function cookieFromResponse(response) {
  return String(response.headers.get("set-cookie") || "").split(";")[0];
}

async function startServer(port, overrides = {}) {
  const environment = {
    ...process.env,
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: String(port),
    DB_FILE: databaseFile,
    PUBLIC_URL: baseUrl,
    ALLOWED_ORIGINS: baseUrl,
    TURNSTILE_REQUIRED: "false",
    INITIAL_ADMIN_USERNAME: "initial-admin",
    INITIAL_ADMIN_EMAIL: "admin@example.com",
    INITIAL_ADMIN_DISPLAY_NAME: "Initial Admin",
    INITIAL_ADMIN_PASSWORD: "StrongAdminPassword1!",
    ...overrides,
  };
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(serverProcess);
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill();
  await Promise.race([once(serverProcess, "exit"), new Promise((resolve) => setTimeout(resolve, 3000))]);
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Servidor nao iniciou. ${output}`)), 8000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes("Servidor iniciado")) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Servidor encerrou com codigo ${code}. ${output}`));
    });
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}
