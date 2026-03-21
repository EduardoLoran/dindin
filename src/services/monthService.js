const { DEFAULT_SALARY_CENTS } = require("../config");
const { runInTransaction } = require("../db/schema");
const { addMonthsToMonthKey, getCurrentMonthKey, normalizeMonthKey } = require("../lib/values");
const {
  listMonths,
  getMonthRecord,
  insertMonth,
  moveTemplateStartMonth,
  deleteMonth,
} = require("../repositories/monthRepository");
const {
  listTemplates,
  findTemplateById,
} = require("../repositories/templateRepository");
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
    const idsToDelete = rows.slice(1).map((row) => row.id);
    deleteEntriesByIds(idsToDelete);
  }
}

function dedupeTemplateEntriesForMonth(userId, templateId, monthKey) {
  const rows = listEntryIdsByTemplateInMonth(userId, templateId, monthKey);
  if (rows.length <= 1) {
    return;
  }
  deleteEntriesByIds(rows.slice(1).map((row) => row.id));
}

function createEntryFromTemplate(userId, templateId, monthKey) {
  const template = findTemplateById(userId, templateId);
  if (!template || normalizeMonthKey(template.start_month) > monthKey) {
    return;
  }

  insertEntryFromTemplate(userId, monthKey, template);
}

function ensureEntryForTemplateInMonth(userId, templateId, monthKey) {
  dedupeTemplateEntriesForMonth(userId, templateId, monthKey);

  const existing = findEntryByTemplateInMonth(userId, templateId, monthKey);
  if (existing) {
    return;
  }

  createEntryFromTemplate(userId, templateId, monthKey);
}

function ensureEntriesFromTemplatesForMonth(userId, monthKey) {
  const templates = listTemplates(userId);
  for (const template of templates) {
    if (Number(template.is_variable) === 1) {
      continue;
    }

    const startMonth = normalizeMonthKey(template.start_month) || getCurrentMonthKey();
    if (startMonth > monthKey) {
      continue;
    }

    ensureEntryForTemplateInMonth(userId, template.id, monthKey);
  }
}

function syncTemplateEntryForMonth(userId, templateId, monthKey) {
  const template = findTemplateById(userId, templateId, { activeOnly: true });
  if (!template) {
    return;
  }

  const startMonth = normalizeMonthKey(template.start_month) || getCurrentMonthKey();
  const shouldExist = startMonth <= monthKey;
  const existingEntry = findEntryByTemplateInMonth(userId, templateId, monthKey);

  if (Number(template.is_variable) === 1 && !existingEntry) {
    return;
  }

  if (!shouldExist) {
    if (existingEntry) {
      deleteEntriesByIds([existingEntry.id]);
    }
    return;
  }

  const now = new Date().toISOString();
  if (existingEntry) {
    updateEntryFromTemplate(userId, existingEntry.id, template, now);
    return;
  }

  createEntryFromTemplate(userId, templateId, monthKey);
}

function ensureMonthExists(userId, monthKey) {
  if (getMonthRecord(userId, monthKey)) {
    return;
  }

  const previousMonth = listMonths(userId).find((item) => item.month_key < monthKey);
  const now = new Date().toISOString();

  insertMonth(userId, monthKey, DEFAULT_SALARY_CENTS, now, previousMonth ? previousMonth.month_key : null);
  ensureEntriesFromTemplatesForMonth(userId, monthKey);
}

function deleteMonthWithEntries(userId, monthKey) {
  runInTransaction(() => {
    const nextMonthKey = addMonthsToMonthKey(monthKey, 1);
    if (nextMonthKey) {
      moveTemplateStartMonth(userId, monthKey, nextMonthKey);
    }

    deleteEntriesByMonth(userId, monthKey);
    deleteMonth(userId, monthKey);
  });
}

module.exports = {
  cleanupDuplicateTemplateEntries,
  ensureEntryForTemplateInMonth,
  ensureEntriesFromTemplatesForMonth,
  syncTemplateEntryForMonth,
  ensureMonthExists,
  deleteMonthWithEntries,
};
