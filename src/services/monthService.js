const { DEFAULT_SALARY_CENTS } = require("../config");
const { runInTransaction } = require("../db/schema");
const { httpError } = require("../lib/errors");
const { addMonthsToMonthKey, getCurrentMonthKey, normalizeMonthKey } = require("../lib/values");
const {
  listMonths,
  getMonthRecord,
  insertMonth,
  markFixedEntriesInitialized,
  closeMonth,
  reopenMonth,
  moveTemplateStartMonth,
  deleteMonth,
} = require("../repositories/monthRepository");
const { listTemplates, findTemplateById } = require("../repositories/templateRepository");
const {
  deleteEntriesByIds,
  deleteEntriesByMonth,
  findEntryByTemplateInMonth,
  insertEntryFromTemplate,
  listDuplicateTemplateEntryGroups,
  listEntryIdsByTemplateInMonth,
  updateEntryFromTemplate,
} = require("../repositories/entryRepository");

function cleanupDuplicateTemplateEntries() {
  const groups = listDuplicateTemplateEntryGroups();
  for (const group of groups) {
    const rows = listEntryIdsByTemplateInMonth(group.user_id, group.template_id, group.month_key);
    deleteEntriesByIds(rows.slice(1).map((row) => row.id));
  }
}

function ensureEntryForTemplateInMonth(userId, templateId, monthKey) {
  const rows = listEntryIdsByTemplateInMonth(userId, templateId, monthKey);
  if (rows.length > 1) deleteEntriesByIds(rows.slice(1).map((row) => row.id));
  if (findEntryByTemplateInMonth(userId, templateId, monthKey)) return;

  const template = findTemplateById(userId, templateId);
  if (!template || normalizeMonthKey(template.start_month) > monthKey) return;
  insertEntryFromTemplate(userId, monthKey, template);
}

function ensureEntriesFromTemplatesForMonth(userId, monthKey) {
  for (const template of listTemplates(userId)) {
    if (Number(template.is_variable) === 1) continue;
    const startMonth = normalizeMonthKey(template.start_month) || getCurrentMonthKey();
    if (startMonth <= monthKey) ensureEntryForTemplateInMonth(userId, template.id, monthKey);
  }
}

function createMonthForUser(userId, monthKey, salaryCents, includeFixedEntries) {
  if (getMonthRecord(userId, monthKey)) {
    throw httpError(409, "Este mes ja existe. Use a opcao de editar salario.", "month_exists");
  }

  runInTransaction(() => {
    const previousMonth = listMonths(userId).find((item) => item.month_key < monthKey);
    insertMonth(userId, monthKey, salaryCents, new Date().toISOString(), previousMonth?.month_key || null, {
      salaryDefined: true,
      fixedEntriesInitialized: includeFixedEntries,
    });
    if (includeFixedEntries) ensureEntriesFromTemplatesForMonth(userId, monthKey);
  });
}

function ensureMonthExists(userId, monthKey, { initializeFixedEntries = true } = {}) {
  if (getMonthRecord(userId, monthKey)) return;
  const previousMonth = listMonths(userId).find((item) => item.month_key < monthKey);
  insertMonth(userId, monthKey, DEFAULT_SALARY_CENTS, new Date().toISOString(), previousMonth?.month_key || null, {
    salaryDefined: false,
    fixedEntriesInitialized: initializeFixedEntries,
  });
  if (initializeFixedEntries) ensureEntriesFromTemplatesForMonth(userId, monthKey);
}

function initializeFixedEntriesForMonth(userId, monthKey) {
  const month = assertMonthOpen(userId, monthKey);
  if (Number(month.fixed_entries_initialized) === 1) return;
  runInTransaction(() => {
    ensureEntriesFromTemplatesForMonth(userId, monthKey);
    markFixedEntriesInitialized(userId, monthKey);
  });
}

function assertMonthOpen(userId, monthKey) {
  const month = getMonthRecord(userId, monthKey);
  if (!month) throw httpError(404, "Mes nao encontrado.", "not_found");
  if (month.closed_at) {
    throw httpError(409, "Este mes esta fechado e nao permite alteracoes.", "month_closed");
  }
  return month;
}

function closeMonthForUser(userId, monthKey) {
  const month = assertMonthOpen(userId, monthKey);
  closeMonth(userId, month.month_key, new Date().toISOString());
}

function reopenMonthForUser(userId, monthKey) {
  const month = getMonthRecord(userId, monthKey);
  if (!month) throw httpError(404, "Mes nao encontrado.", "not_found");
  if (!month.closed_at) throw httpError(409, "Este mes ja esta aberto.", "month_open");
  reopenMonth(userId, monthKey);
}

function syncTemplateEntryForMonth(userId, templateId, monthKey) {
  const template = findTemplateById(userId, templateId, { activeOnly: true });
  if (!template) return;
  const startMonth = normalizeMonthKey(template.start_month) || getCurrentMonthKey();
  const existingEntry = findEntryByTemplateInMonth(userId, templateId, monthKey);

  if (Number(template.is_variable) === 1 && !existingEntry) return;
  if (startMonth > monthKey) {
    if (existingEntry) deleteEntriesByIds([existingEntry.id]);
    return;
  }
  if (existingEntry) {
    updateEntryFromTemplate(userId, existingEntry.id, template, new Date().toISOString());
  } else {
    ensureEntryForTemplateInMonth(userId, templateId, monthKey);
  }
}

function deleteMonthWithEntries(userId, monthKey) {
  assertMonthOpen(userId, monthKey);
  runInTransaction(() => {
    const nextMonthKey = addMonthsToMonthKey(monthKey, 1);
    if (nextMonthKey) moveTemplateStartMonth(userId, monthKey, nextMonthKey);
    deleteEntriesByMonth(userId, monthKey);
    deleteMonth(userId, monthKey);
  });
}

module.exports = {
  cleanupDuplicateTemplateEntries,
  createMonthForUser,
  ensureEntryForTemplateInMonth,
  ensureEntriesFromTemplatesForMonth,
  ensureMonthExists,
  initializeFixedEntriesForMonth,
  assertMonthOpen,
  closeMonthForUser,
  reopenMonthForUser,
  syncTemplateEntryForMonth,
  deleteMonthWithEntries,
};
