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

  const beforeTemplateStart = await request("/api/bootstrap?month=2026-08", { session: userA });
  assert.equal(beforeTemplateStart.status, 200);
  assert.equal(beforeTemplateStart.payload.templates.some((item) => item.id === templateA.id), false);
  assert.equal(template.payload.templates.some((item) => item.id === templateA.id), true);

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
    request("/api/months/2026-09/entries", { method: "DELETE", body: { directions: ["expense"] }, session: userA }),
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

test("exclusao em massa permite selecionar gastos e receitas do mes", async () => {
  const bulkUser = await register("usuario-limpeza", "usuario-limpeza@example.com");
  await request("/api/months", {
    method: "POST",
    body: { monthKey: "2026-08", salary: 4000, includeFixedEntries: false },
    session: bulkUser,
  });

  await request("/api/templates", {
    method: "POST",
    body: {
      name: "Internet",
      amount: 120,
      cycle: "Inicio Do Mes",
      paymentMethod: "Pix",
      observation: "",
      startMonth: "2026-08",
      isVariable: false,
      monthKey: "2026-08",
    },
    session: bulkUser,
  });

  const ofx = buildBankOfx([{ type: "CREDIT", date: "20260805120000", amount: "850.00", fitId: "income-cleanup-1", name: "Freelance" }]);
  const preview = await request("/api/bank-imports/ofx/preview", {
    method: "POST",
    rawBody: ofx,
    contentType: "application/x-ofx",
    headers: { "X-File-Name": encodeURIComponent("receita-agosto.ofx"), "X-Import-Directions": "income" },
    session: bulkUser,
  });
  assert.equal(preview.status, 201);
  const incomeItem = preview.payload.import.items[0];
  const imported = await request(`/api/bank-imports/${preview.payload.import.id}/confirm`, {
    method: "POST",
    body: {
      decisions: [{
        itemId: incomeItem.id,
        action: "salary",
        description: incomeItem.description,
        cycle: incomeItem.suggestedCycle,
        paymentMethod: incomeItem.paymentMethod,
        categoryId: incomeItem.suggestedCategoryId,
      }],
    },
    session: bulkUser,
  });
  assert.equal(imported.status, 200);

  const expensesDeleted = await request("/api/months/2026-08/entries", {
    method: "DELETE", body: { directions: ["expense"] }, session: bulkUser,
  });
  assert.equal(expensesDeleted.status, 200);
  assert.equal(expensesDeleted.payload.month.entries.filter((entry) => entry.direction !== "income").length, 0);
  assert.equal(expensesDeleted.payload.month.entries.filter((entry) => entry.direction === "income").length, 1);
  assert.equal(expensesDeleted.payload.templates.some((template) => template.name === "Internet"), true);

  await request("/api/templates", {
    method: "POST",
    body: {
      name: "Streaming",
      amount: 45,
      cycle: "Quinzena",
      paymentMethod: "Cartao",
      observation: "",
      startMonth: "2026-08",
      isVariable: false,
      monthKey: "2026-08",
    },
    session: bulkUser,
  });

  const allDeleted = await request("/api/months/2026-08/entries", {
    method: "DELETE", body: { directions: ["expense", "income"] }, session: bulkUser,
  });
  assert.equal(allDeleted.status, 200);
  assert.equal(allDeleted.payload.month.entries.length, 0);
  assert.equal(allDeleted.payload.templates.some((template) => template.name === "Internet"), true);
  assert.equal(allDeleted.payload.templates.some((template) => template.name === "Streaming"), true);

  const reimportPreview = await request("/api/bank-imports/ofx/preview", {
    method: "POST",
    rawBody: ofx,
    contentType: "application/x-ofx",
    headers: { "X-File-Name": encodeURIComponent("receita-agosto.ofx"), "X-Import-Directions": "income" },
    session: bulkUser,
  });
  assert.equal(reimportPreview.status, 201);
  assert.equal(reimportPreview.payload.import.items[0].duplicate, false);
  assert.equal(reimportPreview.payload.import.items[0].salarySuggested, true);
});

test("importacao OFX concilia, distribui meses, evita duplicidade e pode ser desfeita", async () => {
  const bankUser = await register("usuario-ofx", "usuario-ofx@example.com");
  const month = await request("/api/months", {
    method: "POST",
    body: { monthKey: "2026-08", salary: 5000, includeFixedEntries: false },
    session: bankUser,
  });
  assert.equal(month.status, 201);

  const template = await request("/api/templates", {
    method: "POST",
    body: {
      name: "Mercado Teste",
      amount: 150.75,
      cycle: "Inicio Do Mes",
      paymentMethod: "Pix",
      observation: "Compra mensal",
      startMonth: "2026-08",
      isVariable: false,
      monthKey: "2026-08",
    },
    session: bankUser,
  });
  const existingEntry = template.payload.month.entries.find((entry) => entry.name === "Mercado Teste");
  assert.ok(existingEntry?.id);

  const ofx = buildBankOfx([
    { type: "DEBIT", date: "20260805", amount: "-150.75", fitId: "expense-match", name: "Mercado Teste" },
    { type: "CREDIT", date: "20260810", amount: "2500.00", fitId: "salary", name: "Salario" },
    { type: "CREDIT", date: "20260820", amount: "300.00", fitId: "extra-income", name: "Freelance" },
    { type: "DEBIT", date: "20260918", amount: "-50.00", fitId: "expense-new", name: "Farmacia" },
  ]);
  const preview = await request("/api/bank-imports/ofx/preview", {
    method: "POST",
    rawBody: Buffer.from(ofx, "latin1"),
    contentType: "application/x-ofx",
    session: bankUser,
  });
  assert.equal(preview.status, 201);
  assert.equal(preview.payload.import.status, "draft");
  assert.equal(preview.payload.import.items.length, 4);
  const previewByExternalId = Object.fromEntries(preview.payload.import.items.map((item) => [item.externalId, item]));
  assert.equal(previewByExternalId["expense-match"].suggestedEntryId, existingEntry.id);
  assert.equal(previewByExternalId["expense-new"].monthKey, "2026-09");
  assert.equal(previewByExternalId["expense-match"].categoryName, "Mercado");
  assert.equal(previewByExternalId["expense-new"].categoryName, "Saúde");
  assert.equal(previewByExternalId.salary.salarySuggested, true);
  assert.equal(previewByExternalId["extra-income"].salarySuggested, false);

  const categories = await request("/api/categories", { session: bankUser });
  const transportCategory = categories.payload.categories.find((category) => category.slug === "transporte");
  assert.ok(transportCategory?.id);

  const decisions = preview.payload.import.items.map((item) => {
    const base = {
      itemId: item.id,
      description: item.description,
      cycle: item.suggestedCycle,
      paymentMethod: item.paymentMethod,
      categoryId: item.suggestedCategoryId,
    };
    if (item.externalId === "expense-match") return { ...base, action: "match", entryId: existingEntry.id, categoryId: transportCategory.id, rememberCategory: true };
    if (item.externalId === "salary") return { ...base, action: "salary" };
    if (item.externalId === "extra-income") return { ...base, action: "income" };
    return { ...base, action: "create" };
  });
  const confirmed = await request(`/api/bank-imports/${preview.payload.import.id}/confirm`, {
    method: "POST",
    body: { decisions },
    session: bankUser,
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.payload.import.status, "completed");

  const august = await request("/api/bootstrap?month=2026-08", { session: bankUser });
  assert.equal(august.payload.month.summary.salary, 2500);
  assert.equal(august.payload.month.summary.salaryReceived, 2500);
  assert.equal(august.payload.month.summary.extraIncome, 300);
  assert.equal(august.payload.month.summary.available, 2800);
  const reconciled = august.payload.month.entries.find((entry) => entry.id === existingEntry.id);
  assert.equal(reconciled.status, "paid");
  assert.equal(reconciled.sourceType, "ofx");
  assert.equal(reconciled.transactionDate, "2026-08-05");
  assert.equal(reconciled.categoryName, "Transporte");
  assert.ok(august.payload.month.entries.some((entry) => entry.direction === "income" && entry.name === "Freelance"));
  const salaryEntry = august.payload.month.entries.find((entry) => entry.direction === "income" && entry.name === "Salario");
  assert.equal(salaryEntry.isSalary, true);

  const asExtraIncome = await request(`/api/entries/${salaryEntry.id}/income-classification`, {
    method: "PATCH", body: { isSalary: false }, session: bankUser,
  });
  assert.equal(asExtraIncome.status, 200);
  assert.equal(asExtraIncome.payload.month.summary.salary, 0);
  assert.equal(asExtraIncome.payload.month.summary.salaryReceived, 0);
  assert.equal(asExtraIncome.payload.month.summary.extraIncome, 2800);

  const asSalaryAgain = await request(`/api/entries/${salaryEntry.id}/income-classification`, {
    method: "PATCH", body: { isSalary: true }, session: bankUser,
  });
  assert.equal(asSalaryAgain.status, 200);
  assert.equal(asSalaryAgain.payload.month.summary.salary, 2500);
  assert.equal(asSalaryAgain.payload.month.summary.salaryReceived, 2500);
  assert.equal(asSalaryAgain.payload.month.summary.extraIncome, 300);

  const september = await request("/api/bootstrap?month=2026-09", { session: bankUser });
  assert.equal(september.payload.month.salaryDefined, false);
  assert.equal(september.payload.month.fixedEntriesInitialized, false);
  assert.ok(september.payload.month.entries.some((entry) => entry.name === "Farmacia" && entry.sourceType === "ofx"));

  const learnedPreview = await request("/api/bank-imports/ofx/preview", {
    method: "POST",
    rawBody: Buffer.from(buildBankOfx([
      { type: "DEBIT", date: "20261005", amount: "-75.00", fitId: "learned-category", name: "Mercado Teste Loja 2" },
    ]), "latin1"),
    contentType: "application/x-ofx",
    session: bankUser,
  });
  assert.equal(learnedPreview.status, 201);
  assert.equal(learnedPreview.payload.import.items[0].categoryName, "Transporte");
  assert.equal(learnedPreview.payload.import.items[0].categorySource, "learned");

  const duplicatePreview = await request("/api/bank-imports/ofx/preview", {
    method: "POST",
    rawBody: Buffer.from(ofx, "latin1"),
    contentType: "application/x-ofx",
    session: bankUser,
  });
  assert.equal(duplicatePreview.status, 201);
  assert.ok(duplicatePreview.payload.import.items.every((item) => item.duplicate));

  const undone = await request(`/api/bank-imports/${preview.payload.import.id}/undo`, {
    method: "POST",
    body: {},
    session: bankUser,
  });
  assert.equal(undone.status, 200);
  assert.equal(undone.payload.import.status, "undone");

  const restoredAugust = await request("/api/bootstrap?month=2026-08", { session: bankUser });
  const restoredEntry = restoredAugust.payload.month.entries.find((entry) => entry.id === existingEntry.id);
  assert.equal(restoredEntry.status, "pending");
  assert.equal(restoredEntry.sourceType, "fixed");
  assert.equal(restoredAugust.payload.month.summary.salary, 5000);
  assert.equal(restoredAugust.payload.month.summary.salaryReceived, 0);
  assert.equal(restoredAugust.payload.month.summary.extraIncome, 0);
  const removedSeptember = await request("/api/bootstrap?month=2026-09", { session: bankUser });
  assert.equal(removedSeptember.payload.months.some((item) => item.monthKey === "2026-09"), false);
});

test("importacao OFX permite escolher somente gastos ou receitas", async () => {
  const bankUser = await register("usuario-ofx-filtro", "usuario-ofx-filtro@example.com");
  const ofx = buildBankOfx([
    { type: "DEBIT", date: "20260805", amount: "-25.00", fitId: "only-expense", name: "Uber" },
    { type: "CREDIT", date: "20260810", amount: "100.00", fitId: "only-income", name: "Freelance" },
  ]);
  const response = await request("/api/bank-imports/ofx/preview", {
    method: "POST",
    rawBody: Buffer.from(ofx, "latin1"),
    contentType: "application/x-ofx",
    headers: { "X-Import-Directions": "expense" },
    session: bankUser,
  });
  assert.equal(response.status, 201);
  assert.equal(response.payload.import.items.length, 1);
  assert.equal(response.payload.import.items[0].direction, "expense");
  assert.equal(response.payload.import.items[0].categoryName, "Transporte");
  assert.equal(response.payload.import.incomeTotal, 0);
});

test("importacao OFX preserva lancamentos manuais e nao repete conciliacoes sugeridas", async () => {
  const bankUser = await register("usuario-ofx-manual", "usuario-ofx-manual@example.com");
  await request("/api/months", {
    method: "POST",
    body: { monthKey: "2026-08", salary: 4200, includeFixedEntries: false },
    session: bankUser,
  });

  const academy = await request("/api/templates", {
    method: "POST",
    body: {
      name: "Academia",
      amount: 100,
      cycle: "Inicio Do Mes",
      paymentMethod: "Pix",
      observation: "",
      startMonth: "2026-08",
      isVariable: false,
      monthKey: "2026-08",
    },
    session: bankUser,
  });
  const academyEntry = academy.payload.month.entries.find((entry) => entry.name === "Academia");

  await request("/api/templates", {
    method: "POST",
    body: {
      name: "Internet",
      amount: 80,
      cycle: "Inicio Do Mes",
      paymentMethod: "Boleto",
      observation: "",
      startMonth: "2026-08",
      isVariable: false,
      monthKey: "2026-08",
    },
    session: bankUser,
  });

  const ofx = buildBankOfx([
    { type: "DEBIT", date: "20260805", amount: "-100.00", fitId: "manual-match-1", name: "Academia" },
    { type: "DEBIT", date: "20260806", amount: "-100.00", fitId: "manual-match-2", name: "Academia mensalidade" },
    { type: "DEBIT", date: "20260807", amount: "-80.00", fitId: "manual-unrelated", name: "Farmacia" },
    { type: "DEBIT", date: "20260808", amount: "-12.00", fitId: "manual-unselected", name: "Padaria" },
  ]);
  const preview = await request("/api/bank-imports/ofx/preview", {
    method: "POST",
    rawBody: Buffer.from(ofx, "latin1"),
    contentType: "application/x-ofx",
    headers: { "X-Import-Directions": "expense" },
    session: bankUser,
  });
  assert.equal(preview.status, 201);
  assert.equal(preview.payload.import.items.filter((item) => item.suggestedEntryId === academyEntry.id).length, 1);
  assert.equal(preview.payload.import.items.find((item) => item.externalId === "manual-unrelated").suggestedEntryId, null);

  const decisions = preview.payload.import.items.map((item) => ({
    itemId: item.id,
    action: item.externalId === "manual-unselected" ? "ignore" : item.suggestedEntryId ? "match" : "create",
    entryId: item.suggestedEntryId || undefined,
    description: item.description,
    cycle: item.suggestedCycle,
    paymentMethod: item.paymentMethod,
    categoryId: item.suggestedCategoryId,
  }));
  const confirmed = await request(`/api/bank-imports/${preview.payload.import.id}/confirm`, {
    method: "POST",
    body: { decisions },
    session: bankUser,
  });
  assert.equal(confirmed.status, 200);

  const month = await request("/api/bootstrap?month=2026-08", { session: bankUser });
  assert.equal(month.payload.month.entries.filter((entry) => entry.name.toLowerCase().includes("academia")).length, 2);
  assert.ok(month.payload.month.entries.some((entry) => entry.name === "Internet" && entry.sourceType === "fixed"));
  assert.ok(month.payload.month.entries.some((entry) => entry.name === "Farmacia" && entry.sourceType === "ofx"));
  assert.equal(month.payload.month.entries.some((entry) => entry.name === "Padaria"), false);

  // Versões antigas gravavam a data de confirmação até para itens ignorados.
  const legacyDatabase = new DatabaseSync(databaseFile);
  const ignoredItem = preview.payload.import.items.find((item) => item.externalId === "manual-unselected");
  legacyDatabase.prepare("UPDATE bank_import_items SET committed_at = ? WHERE id = ?")
    .run(new Date().toISOString(), ignoredItem.id);
  legacyDatabase.close();

  const nextPreview = await request("/api/bank-imports/ofx/preview", {
    method: "POST",
    rawBody: Buffer.from(ofx, "latin1"),
    contentType: "application/x-ofx",
    headers: { "X-Import-Directions": "expense" },
    session: bankUser,
  });
  assert.equal(nextPreview.payload.import.items.find((item) => item.externalId === "manual-unselected").duplicate, false);
  assert.equal(nextPreview.payload.import.items.find((item) => item.externalId === "manual-unrelated").duplicate, true);
});

test("salarios selecionados no OFX preenchem o salario de um mes novo", async () => {
  const salaryUser = await register("usuario-salario-ofx", "usuario-salario-ofx@example.com");
  const ofx = buildBankOfx([
    { type: "CREDIT", date: "20260805", amount: "2100.00", fitId: "salary-part-1", name: "Adiantamento salario" },
    { type: "CREDIT", date: "20260820", amount: "2900.00", fitId: "salary-part-2", name: "Pagamento salario" },
    { type: "CREDIT", date: "20260825", amount: "250.00", fitId: "income-extra", name: "Reembolso" },
  ]);
  const preview = await request("/api/bank-imports/ofx/preview", {
    method: "POST", rawBody: Buffer.from(ofx, "latin1"), contentType: "application/x-ofx",
    headers: { "X-Import-Directions": "income" }, session: salaryUser,
  });
  assert.equal(preview.status, 201);
  const decisions = preview.payload.import.items.map((item) => ({
    itemId: item.id,
    action: item.externalId.startsWith("salary-part") ? "salary" : "income",
    description: item.description,
    cycle: item.suggestedCycle,
    paymentMethod: item.paymentMethod,
    categoryId: item.suggestedCategoryId,
  }));
  const confirmed = await request(`/api/bank-imports/${preview.payload.import.id}/confirm`, {
    method: "POST", body: { decisions }, session: salaryUser,
  });
  assert.equal(confirmed.status, 200);

  const august = await request("/api/bootstrap?month=2026-08", { session: salaryUser });
  assert.equal(august.payload.month.salary, 5000);
  assert.equal(august.payload.month.summary.salaryReceived, 5000);
  assert.equal(august.payload.month.summary.extraIncome, 250);
  assert.equal(august.payload.month.summary.available, 5250);
  assert.equal(august.payload.month.entries.filter((entry) => entry.isSalary).length, 2);
});

test("reclassificar receita como salario preserva o salario anterior ao desfazer", async () => {
  const user = await register("usuario-reclassifica", "usuario-reclassifica@example.com");
  await request("/api/months", {
    method: "POST", body: { monthKey: "2026-08", salary: 4000, includeFixedEntries: false }, session: user,
  });
  const ofx = buildBankOfx([{ type: "CREDIT", date: "20260810", amount: "850.00", fitId: "late-salary", name: "Credito empresa" }]);
  const preview = await request("/api/bank-imports/ofx/preview", {
    method: "POST", rawBody: Buffer.from(ofx, "latin1"), contentType: "application/x-ofx",
    headers: { "X-Import-Directions": "income" }, session: user,
  });
  const item = preview.payload.import.items[0];
  await request(`/api/bank-imports/${preview.payload.import.id}/confirm`, {
    method: "POST",
    body: { decisions: [{ itemId: item.id, action: "income", description: item.description, cycle: item.suggestedCycle, paymentMethod: item.paymentMethod, categoryId: item.suggestedCategoryId }] },
    session: user,
  });
  const imported = await request("/api/bootstrap?month=2026-08", { session: user });
  const entry = imported.payload.month.entries.find((row) => row.direction === "income");

  const classified = await request(`/api/entries/${entry.id}/income-classification`, {
    method: "PATCH", body: { isSalary: true }, session: user,
  });
  assert.equal(classified.payload.month.salary, 850);

  const undone = await request(`/api/bank-imports/${preview.payload.import.id}/undo`, {
    method: "POST", body: {}, session: user,
  });
  assert.equal(undone.status, 200);
  const restored = await request("/api/bootstrap?month=2026-08", { session: user });
  assert.equal(restored.payload.month.salary, 4000);
  assert.equal(restored.payload.month.entries.length, 0);
});

test("categorias personalizadas podem ser criadas, editadas e inativadas", async () => {
  const categoryUser = await register("usuario-categorias", "usuario-categorias@example.com");
  const initial = await request("/api/categories", { session: categoryUser });
  assert.ok(initial.payload.categories.some((category) => category.slug === "mercado"));

  const created = await request("/api/categories", {
    method: "POST",
    body: { name: "Pets", color: "#AA55CC", direction: "expense" },
    session: categoryUser,
  });
  assert.equal(created.status, 201);
  assert.equal(created.payload.category.name, "Pets");

  const updated = await request(`/api/categories/${created.payload.category.id}`, {
    method: "PATCH",
    body: { name: "Animais", color: "#BB66DD", direction: "expense" },
    session: categoryUser,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.category.name, "Animais");

  const removed = await request(`/api/categories/${created.payload.category.id}`, {
    method: "DELETE",
    session: categoryUser,
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.payload.categories.some((category) => category.id === created.payload.category.id), false);
});

test("importacao bancaria rejeita arquivo OFX invalido", async () => {
  const bankUser = await register("usuario-ofx-erro", "usuario-ofx-erro@example.com");
  const response = await request("/api/bank-imports/ofx/preview", {
    method: "POST",
    rawBody: Buffer.from("arquivo invalido"),
    contentType: "application/x-ofx",
    session: bankUser,
  });
  assert.equal(response.status, 400);
  assert.equal(response.payload.error, "invalid_ofx");
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
  Object.assign(headers, options.headers || {});
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

function buildBankOfx(transactions) {
  const statementTransactions = transactions.map((item) => [
    "<STMTTRN>",
    `<TRNTYPE>${item.type}`,
    `<DTPOSTED>${item.date}120000[-3:BRT]`,
    `<TRNAMT>${item.amount}`,
    `<FITID>${item.fitId}`,
    `<NAME>${item.name}`,
    "</STMTTRN>",
  ].join("\n")).join("\n");

  return [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "VERSION:102",
    "SECURITY:NONE",
    "ENCODING:USASCII",
    "CHARSET:1252",
    "COMPRESSION:NONE",
    "OLDFILEUID:NONE",
    "NEWFILEUID:NONE",
    "",
    "<OFX>",
    "<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20260903120000[-3:BRT]<LANGUAGE>POR<FI><ORG>Banco Teste<FID>001</FI></SONRS></SIGNONMSGSRSV1>",
    "<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>001<ACCTID>12345678<ACCTTYPE>CHECKING</BANKACCTFROM><BANKTRANLIST><DTSTART>20260801000000[-3:BRT]<DTEND>20260930235959[-3:BRT]",
    statementTransactions,
    "</BANKTRANLIST><LEDGERBAL><BALAMT>1000<DTASOF>20260930235959[-3:BRT]</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1>",
    "</OFX>",
  ].join("\n");
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
