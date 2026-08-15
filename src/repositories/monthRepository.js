const { randomUUID } = require("node:crypto");
const { db } = require("../db/connection");

function listMonths(userId, limit = 120) {
  return db.prepare(`
    SELECT month_key, salary_cents, salary_defined, fixed_entries_initialized, closed_at, created_at
    FROM months
    WHERE user_id = ?
    ORDER BY month_key DESC
    LIMIT ?
  `).all(userId, limit);
}

function getMonthRecord(userId, monthKey) {
  return db.prepare(`
    SELECT id, user_id, month_key, salary_cents, salary_defined, fixed_entries_initialized, closed_at, created_at
    FROM months
    WHERE user_id = ? AND month_key = ?
  `).get(userId, monthKey);
}

function insertMonth(userId, monthKey, salaryCents, createdAt, rolledOverFrom, options = {}) {
  const salaryDefined = options.salaryDefined ? 1 : 0;
  const fixedEntriesInitialized = options.fixedEntriesInitialized ? 1 : 0;
  db.prepare(`
    INSERT INTO months (
      id, user_id, month_key, salary_cents, salary_defined, fixed_entries_initialized,
      closed_at, created_at, rolled_over_from
    ) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)
  `).run(
    randomUUID(),
    userId,
    monthKey,
    salaryCents,
    salaryDefined,
    fixedEntriesInitialized,
    createdAt,
    rolledOverFrom
  );
}

function updateMonthSalary(userId, monthKey, salaryCents) {
  return db.prepare(`
    UPDATE months
    SET salary_cents = ?, salary_defined = 1
    WHERE user_id = ? AND month_key = ? AND closed_at = ''
  `).run(salaryCents, userId, monthKey);
}

function markFixedEntriesInitialized(userId, monthKey) {
  return db.prepare(`
    UPDATE months
    SET fixed_entries_initialized = 1
    WHERE user_id = ? AND month_key = ? AND closed_at = ''
  `).run(userId, monthKey);
}

function closeMonth(userId, monthKey, closedAt) {
  return db.prepare(`
    UPDATE months
    SET closed_at = ?
    WHERE user_id = ? AND month_key = ? AND closed_at = ''
  `).run(closedAt, userId, monthKey);
}

function reopenMonth(userId, monthKey) {
  return db.prepare(`
    UPDATE months
    SET closed_at = ''
    WHERE user_id = ? AND month_key = ? AND closed_at <> ''
  `).run(userId, monthKey);
}

function moveTemplateStartMonth(userId, monthKey, nextMonthKey) {
  db.prepare(`
    UPDATE templates
    SET start_month = ?
    WHERE user_id = ? AND start_month = ?
  `).run(nextMonthKey, userId, monthKey);
}

function deleteMonth(userId, monthKey) {
  return db.prepare("DELETE FROM months WHERE user_id = ? AND month_key = ? AND closed_at = ''").run(userId, monthKey);
}

module.exports = {
  listMonths,
  getMonthRecord,
  insertMonth,
  updateMonthSalary,
  markFixedEntriesInitialized,
  closeMonth,
  reopenMonth,
  moveTemplateStartMonth,
  deleteMonth,
};
