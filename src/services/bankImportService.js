const { runInTransaction } = require("../db/schema");
const { httpError } = require("../lib/errors");
const { fromCents } = require("../lib/values");
const {
  applyImportedExpenseToEntry,
  deleteImportedEntry,
  findEntryForImport,
  insertImportedEntry,
  listPendingExpenseEntries,
  restoreEntryAfterImport,
} = require("../repositories/entryRepository");
const { deleteEmptyImportedMonth, getMonthRecord, restoreSalarySnapshot, syncImportedSalary } = require("../repositories/monthRepository");
const {
  completeBankImportBatch,
  completeBankImportItem,
  deleteExpiredDrafts,
  findActiveDedupeKeys,
  findBankImportBatch,
  insertBankImportBatch,
  listBankImportHistory,
  listBankImportItems,
  markBankImportUndone,
  releaseOrphanedImportItems,
} = require("../repositories/bankImportRepository");
const { ensureMonthExists, assertMonthOpen } = require("./monthService");
const { parseOfx } = require("./ofxParserService");
const {
  categorizeTransaction,
  ensureDefaultCategories,
  learnCategoryChoice,
  requireCategory,
} = require("./categoryService");

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const EXPENSE_ACTIONS = new Set(["create", "match", "ignore"]);
const INCOME_ACTIONS = new Set(["income", "salary", "ignore"]);

async function previewBankImport(userId, buffer, filename, directions = ["expense", "income"]) {
  const now = new Date();
  deleteExpiredDrafts(now.toISOString());
  const parsed = await parseOfx(buffer, filename);
  ensureDefaultCategories(userId);
  releaseOrphanedImportItems(userId, now.toISOString());
  const selectedDirections = new Set(directions);
  const selectedTransactions = parsed.transactions.filter((item) => selectedDirections.has(item.direction));
  if (!selectedTransactions.length) {
    throw httpError(400, "O arquivo nao possui movimentacoes dos tipos selecionados.", "empty_import_selection");
  }
  const activeKeys = findActiveDedupeKeys(userId, selectedTransactions.map((item) => item.dedupeKey));
  const seenInFile = new Set();
  const candidateCache = new Map();

  const items = selectedTransactions.map((item) => {
    const month = getMonthRecord(userId, item.monthKey);
    const duplicate = activeKeys.has(item.dedupeKey) || seenInFile.has(item.dedupeKey);
    seenInFile.add(item.dedupeKey);
    let blockedReason = "";
    if (item.currency !== "BRL") blockedReason = "unsupported_currency";
    else if (month?.closed_at) blockedReason = "month_closed";

    let suggestedEntryId = null;
    if (item.direction === "expense" && !duplicate && !blockedReason) {
      if (!candidateCache.has(item.monthKey)) {
        candidateCache.set(item.monthKey, listPendingExpenseEntries(userId, item.monthKey));
      }
      suggestedEntryId = suggestEntry(item, candidateCache.get(item.monthKey))?.id || null;
    }
    const category = categorizeTransaction(userId, item);
    return {
      ...item,
      duplicate,
      blockedReason,
      suggestedEntryId,
      suggestedCategoryId: category.categoryId,
      categorySource: category.source,
      categoryConfidence: category.confidence,
    };
  });

  const batch = {
    ...parsed,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DRAFT_TTL_MS).toISOString(),
    expenseCents: sumDirection(items, "expense"),
    incomeCents: sumDirection(items, "income"),
  };
  const batchId = runInTransaction(() => insertBankImportBatch(userId, batch, items));
  return getBankImport(userId, batchId);
}

function confirmBankImport(userId, batchId, decisions) {
  const batch = requireDraftBatch(userId, batchId);
  const items = listBankImportItems(userId, batchId);
  const normalized = normalizeDecisions(userId, items, decisions);
  const now = new Date().toISOString();
  const createdMonths = new Set();
  const matchedEntries = new Set();
  const salaryMonths = unique(normalized.filter(({ decision }) => decision.action === "salary").map(({ item }) => item.month_key));
  const salarySnapshot = Object.fromEntries(salaryMonths.map((monthKey) => {
    const month = getMonthRecord(userId, monthKey);
    return [monthKey, month ? {
      salaryCents: Number(month.salary_cents || 0),
      salaryDefined: Boolean(month.salary_defined),
      salarySource: month.salary_source || "manual",
    } : null];
  }));

  const activeKeys = findActiveDedupeKeys(userId, items.map((item) => item.dedupe_key));
  for (const { item, decision } of normalized) {
    if (decision.action === "match") {
      if (matchedEntries.has(decision.entryId)) {
        throw httpError(400, "Um lancamento nao pode conciliar duas movimentacoes do mesmo arquivo.", "duplicate_match");
      }
      matchedEntries.add(decision.entryId);
    }
    if (!item.duplicate && activeKeys.has(item.dedupe_key) && decision.action !== "ignore") {
      throw httpError(409, "Uma movimentacao deste arquivo ja foi importada.", "duplicate_transaction");
    }
    if ((item.blocked_reason || item.duplicate) && decision.action !== "ignore") {
      throw httpError(409, "Movimentacoes bloqueadas ou duplicadas devem ser ignoradas.", "blocked_transaction");
    }
  }

  runInTransaction(() => {
    for (const { item, decision } of normalized) {
      let linkedEntryId = null;
      let previousEntryJson = "";
      let appliedEntryUpdatedAt = "";
      let committedAt = now;

      if (decision.action !== "ignore") {
        if (!getMonthRecord(userId, item.month_key)) {
          ensureMonthExists(userId, item.month_key, { initializeFixedEntries: false });
          createdMonths.add(item.month_key);
        }
        assertMonthOpen(userId, item.month_key);
      }

      if (decision.action === "match") {
        const entry = findEntryForImport(userId, decision.entryId, item.month_key);
        if (!entry || entry.direction !== "expense" || entry.status !== "pending") {
          throw httpError(409, "O lancamento sugerido nao esta mais disponivel para conciliacao.", "match_unavailable");
        }
        previousEntryJson = JSON.stringify(entry);
        const result = applyImportedExpenseToEntry(userId, entry.id, {
          amountCents: item.amount_cents,
          cycle: decision.cycle,
          paymentMethod: decision.paymentMethod,
          transactionDate: item.posted_date,
          monthKey: item.month_key,
          categoryId: decision.categoryId,
          updatedAt: now,
        });
        if (result.changes !== 1) throw httpError(409, "Nao foi possivel conciliar o lancamento.", "match_conflict");
        linkedEntryId = entry.id;
        appliedEntryUpdatedAt = now;
      } else if (["create", "income", "salary"].includes(decision.action)) {
        linkedEntryId = insertImportedEntry(userId, {
          monthKey: item.month_key,
          name: decision.description,
          amountCents: item.amount_cents,
          cycle: decision.cycle,
          paymentMethod: decision.paymentMethod,
          observation: item.memo,
          direction: item.direction,
          isSalary: decision.action === "salary",
          transactionDate: item.posted_date,
          categoryId: decision.categoryId,
          createdAt: now,
        });
        appliedEntryUpdatedAt = now;
      } else if (item.duplicate) {
        committedAt = "";
      }

      completeBankImportItem(userId, item.id, {
        decision: decision.action,
        categoryId: decision.action === "ignore" ? null : decision.categoryId,
        categorySource: decision.rememberCategory
          ? "learned"
          : decision.categoryId !== item.suggested_category_id ? "manual" : item.category_source,
        linkedEntryId,
        previousEntryJson,
        appliedEntryUpdatedAt,
        committedAt,
      });
      if (decision.action !== "ignore" && decision.rememberCategory) {
        learnCategoryChoice(userId, item, decision.categoryId);
      }
    }
    salaryMonths.forEach((monthKey) => syncImportedSalary(userId, monthKey));
    completeBankImportBatch(userId, batch.id, now, [...createdMonths], salarySnapshot);
  });

  return { import: getBankImport(userId, batchId), affectedMonths: unique(items.map((item) => item.month_key)) };
}

function undoBankImport(userId, batchId) {
  const batch = findBankImportBatch(userId, batchId);
  if (!batch) throw httpError(404, "Importacao nao encontrada.", "not_found");
  if (batch.status !== "completed") throw httpError(409, "Esta importacao nao pode ser desfeita.", "import_not_reversible");
  const items = listBankImportItems(userId, batchId).filter((item) => item.committed_at && !item.undone_at);
  const affectedMonths = unique(items.map((item) => item.month_key));
  affectedMonths.forEach((monthKey) => assertMonthOpen(userId, monthKey));

  if (items.some((item) => item.previous_entry_json && !item.linked_entry_id)) {
    throw httpError(409, "Um lancamento conciliado foi removido e impede o desfazer.", "undo_conflict");
  }

  for (const item of items.filter((row) => row.linked_entry_id)) {
    const current = findEntryForImport(userId, item.linked_entry_id, item.month_key);
    if (!current || current.updated_at !== item.applied_entry_updated_at) {
      throw httpError(409, "Um lancamento desta importacao foi alterado depois e impede o desfazer.", "undo_conflict");
    }
  }

  const undoneAt = new Date().toISOString();
  runInTransaction(() => {
    for (const item of items.filter((row) => row.linked_entry_id)) {
      if (item.previous_entry_json) {
        const snapshot = JSON.parse(item.previous_entry_json);
        const result = restoreEntryAfterImport(userId, snapshot, item.applied_entry_updated_at);
        if (result.changes !== 1) throw httpError(409, "Nao foi possivel restaurar um lancamento conciliado.", "undo_conflict");
      } else {
        const result = deleteImportedEntry(userId, item.linked_entry_id, item.applied_entry_updated_at);
        if (result.changes !== 1) throw httpError(409, "Nao foi possivel remover um lancamento importado.", "undo_conflict");
      }
    }
    markBankImportUndone(userId, batchId, undoneAt);
    for (const [monthKey, snapshot] of Object.entries(safeJsonObject(batch.salary_snapshot_json))) {
      restoreSalarySnapshot(userId, monthKey, snapshot);
    }
    for (const monthKey of safeJsonArray(batch.created_months_json)) {
      deleteEmptyImportedMonth(userId, monthKey);
    }
  });
  return { import: getBankImport(userId, batchId), affectedMonths };
}

function getBankImport(userId, batchId) {
  const batch = findBankImportBatch(userId, batchId);
  if (!batch) throw httpError(404, "Importacao nao encontrada.", "not_found");
  const items = listBankImportItems(userId, batchId).map(serializeItem);
  return { ...serializeBatch(batch), items: addSalarySuggestions(items) };
}

function getBankImportHistory(userId, page, pageSize) {
  deleteExpiredDrafts(new Date().toISOString());
  const result = listBankImportHistory(userId, page, pageSize);
  return {
    items: result.rows.map(serializeBatch),
    pagination: { page, pageSize, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / pageSize)) },
  };
}

function normalizeDecisions(userId, items, decisions) {
  if (!Array.isArray(decisions) || decisions.length !== items.length) {
    throw httpError(400, "Revise todas as movimentacoes antes de confirmar.", "incomplete_review");
  }
  const byId = new Map(decisions.map((decision) => [String(decision.itemId || ""), decision]));
  if (byId.size !== items.length) throw httpError(400, "Existem decisoes repetidas ou ausentes.", "invalid_review");

  return items.map((item) => {
    const input = byId.get(item.id);
    if (!input) throw httpError(400, "Revise todas as movimentacoes antes de confirmar.", "incomplete_review");
    const action = String(input.action || "");
    const allowed = item.direction === "expense" ? EXPENSE_ACTIONS : INCOME_ACTIONS;
    if (!allowed.has(action)) throw httpError(400, "Acao de importacao invalida.", "invalid_import_action");
    const decision = { action };
    if (action === "match") {
      decision.entryId = requireId(input.entryId, "Lancamento");
    }
    if (["match", "create", "income", "salary"].includes(action)) {
      decision.description = cleanRequired(input.description || item.description, "Descricao", 100);
      decision.cycle = requireCycle(input.cycle || suggestedCycle(item.posted_date));
      decision.paymentMethod = cleanRequired(input.paymentMethod || item.payment_method, "Forma de pagamento", 40);
    }
    if (action !== "ignore") {
      decision.categoryId = requireCategory(userId, input.categoryId || item.suggested_category_id, item.direction).id;
      decision.rememberCategory = Boolean(input.rememberCategory);
    }
    return { item, decision };
  });
}

function requireDraftBatch(userId, batchId) {
  const batch = findBankImportBatch(userId, batchId);
  if (!batch) throw httpError(404, "Importacao nao encontrada.", "not_found");
  if (batch.status !== "draft") throw httpError(409, "Esta importacao ja foi finalizada.", "import_already_finished");
  if (batch.expires_at < new Date().toISOString()) throw httpError(410, "A conferencia expirou. Envie o arquivo novamente.", "import_expired");
  return batch;
}

function suggestEntry(item, candidates) {
  let best = null;
  for (const candidate of candidates) {
    const amountDifference = Math.abs(Number(candidate.amount_cents) - item.amountCents);
    const amountScore = amountDifference === 0 ? 60 : amountDifference <= Math.max(100, item.amountCents * 0.05) ? 38 : 0;
    const textScore = Math.round(tokenSimilarity(item.description, candidate.name) * 40);
    const score = amountScore + textScore;
    if (score >= 50 && (!best || score > best.score)) best = { ...candidate, score };
  }
  return best;
}

function tokenSimilarity(left, right) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union;
}

function tokens(value) {
  return new Set(String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2));
}

function serializeBatch(batch) {
  return {
    id: batch.id,
    filename: batch.filename,
    status: batch.status,
    bankName: batch.bank_name,
    accountLabel: batch.account_label,
    currency: batch.currency,
    dateFrom: batch.date_from,
    dateTo: batch.date_to,
    expenseTotal: fromCents(batch.expense_cents),
    incomeTotal: fromCents(batch.income_cents),
    itemCount: Number(batch.item_count),
    createdAt: batch.created_at,
    expiresAt: batch.expires_at,
    completedAt: batch.completed_at,
    undoneAt: batch.undone_at,
  };
}

function serializeItem(item) {
  const blocked = Boolean(item.blocked_reason);
  return {
    id: item.id,
    externalId: item.external_id,
    postedDate: item.posted_date,
    monthKey: item.month_key,
    description: item.description,
    memo: item.memo,
    extendedName: item.extended_name,
    payeeId: item.payee_id,
    sic: item.sic,
    amount: fromCents(item.amount_cents),
    direction: item.direction,
    transactionType: item.transaction_type,
    currency: item.currency,
    paymentMethod: item.payment_method,
    accountLabel: item.account_label,
    suggestedEntryId: item.suggested_entry_id,
    suggestedEntryName: item.suggested_entry_name || "",
    suggestedCategoryId: item.suggested_category_id,
    categoryId: item.category_id || item.suggested_category_id,
    categoryName: item.category_name || item.suggested_category_name || "Outros",
    categoryColor: item.category_color || item.suggested_category_color || "#8C8492",
    categorySource: item.category_source || "fallback",
    categoryConfidence: Number(item.category_confidence || 0),
    suggestedCycle: suggestedCycle(item.posted_date),
    defaultAction: item.duplicate || blocked ? "ignore" : item.direction === "income" ? "income" : item.suggested_entry_id ? "match" : "create",
    decision: item.decision,
    linkedEntryId: item.linked_entry_id,
    duplicate: Boolean(item.duplicate),
    blockedReason: item.blocked_reason,
    committed: Boolean(item.committed_at),
    undone: Boolean(item.undone_at),
  };
}

function suggestedCycle(postedDate) {
  return Number(String(postedDate).slice(8, 10)) <= 15 ? "Inicio Do Mes" : "Quinzena";
}

function sumDirection(items, direction) {
  return items.filter((item) => item.direction === direction).reduce((total, item) => total + item.amountCents, 0);
}

function cleanRequired(value, label, maxLength) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) throw httpError(400, `${label} invalida.`, "invalid_import_field");
  return text;
}

function requireCycle(value) {
  if (!["Inicio Do Mes", "Quinzena"].includes(value)) throw httpError(400, "Ciclo invalido.", "invalid_import_field");
  return value;
}

function requireId(value, label) {
  const id = String(value || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw httpError(400, `${label} invalido.`, "invalid_import_field");
  return id;
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function addSalarySuggestions(items) {
  const suggestions = new Map();
  const candidatesByMonth = new Map();
  for (const item of items.filter((row) => row.direction === "income" && !row.duplicate && !row.blockedReason)) {
    const normalized = `${item.description} ${item.memo || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const strongMatch = /\b(salario|folha|provento|remuneracao|ordenado|pagamento salarial)\b/.test(normalized);
    if (strongMatch) suggestions.set(item.id, "Descrição compatível com salário");
    if (!candidatesByMonth.has(item.monthKey)) candidatesByMonth.set(item.monthKey, []);
    candidatesByMonth.get(item.monthKey).push(item);
  }
  for (const candidates of candidatesByMonth.values()) {
    if (candidates.some((item) => suggestions.has(item.id))) continue;
    const largest = [...candidates].sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0))[0];
    if (largest) suggestions.set(largest.id, "Maior receita do período");
  }
  return items.map((item) => ({
    ...item,
    salarySuggested: suggestions.has(item.id),
    salarySuggestionReason: suggestions.get(item.id) || "",
  }));
}

function unique(values) {
  return [...new Set(values)];
}

module.exports = {
  previewBankImport,
  confirmBankImport,
  undoBankImport,
  getBankImport,
  getBankImportHistory,
};
