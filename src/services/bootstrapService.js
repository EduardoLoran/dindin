const { DB_FILE } = require("../config");
const { serializeEntry, serializeTemplate, serializeUser } = require("../lib/serializers");
const { fromCents, getCurrentMonthKey, normalizeMonthKey, sumCents } = require("../lib/values");
const { listEntries } = require("../repositories/entryRepository");
const { getMonthRecord, listMonths } = require("../repositories/monthRepository");
const { listTemplates } = require("../repositories/templateRepository");

function buildSummary(entries, salaryCents) {
  const total = sumCents(entries.map((entry) => entry.amount_cents));
  const paid = sumCents(entries.filter((entry) => entry.status !== "pending").map((entry) => entry.amount_cents));
  const pending = sumCents(entries.filter((entry) => entry.status === "pending").map((entry) => entry.amount_cents));
  const monthStartProjection = sumCents(entries.filter((entry) => entry.cycle === "Inicio Do Mes").map((entry) => entry.amount_cents));
  const quinzenaProjection = sumCents(entries.filter((entry) => entry.cycle === "Quinzena").map((entry) => entry.amount_cents));

  return {
    salary: fromCents(salaryCents),
    total: fromCents(total),
    paid: fromCents(paid),
    pending: fromCents(pending),
    balance: fromCents(salaryCents - total),
    monthStartProjection: fromCents(monthStartProjection),
    quinzenaProjection: fromCents(quinzenaProjection),
  };
}

function buildBootstrapPayload(user, monthKey) {
  const month = getMonthRecord(user.id, monthKey);
  const entries = month ? listEntries(user.id, monthKey) : [];
  const templates = listTemplates(user.id);
  const months = listMonths(user.id);
  const effectiveSalaryCents = month && Number(month.salary_defined) === 1 ? month.salary_cents : 0;
  const resolvedMonthKey = month ? monthKey : normalizeMonthKey(monthKey) || getCurrentMonthKey();

  return {
    user: serializeUser(user),
    activeMonth: resolvedMonthKey,
    databaseFile: DB_FILE,
    lastAutoRolloverAt: month?.created_at || "",
    month: {
      monthKey: resolvedMonthKey,
      salary: fromCents(effectiveSalaryCents),
      summary: buildSummary(entries, effectiveSalaryCents),
      entries: entries.map(serializeEntry),
    },
    months: months.map((item) => ({
      monthKey: item.month_key,
      salary: fromCents(Number(item.salary_defined) === 1 ? item.salary_cents : 0),
      createdAt: item.created_at,
    })),
    templates: templates.map(serializeTemplate),
  };
}

module.exports = {
  buildBootstrapPayload,
};
