const { randomUUID } = require("node:crypto");
const { db } = require("../db/connection");

function listMonths(userId) {
  return db.prepare(`
    SELECT month_key, salary_cents, salary_defined, created_at
    FROM months
    WHERE user_id = ?
    ORDER BY month_key DESC
  `).all(userId);
}

function getMonthRecord(userId, monthKey) {
  return db.prepare(`
    SELECT id, user_id, month_key, salary_cents, salary_defined, created_at
    FROM months
    WHERE user_id = ? AND month_key = ?
  `).get(userId, monthKey);
}

function insertMonth(userId, monthKey, salaryCents, createdAt, rolledOverFrom) {
  db.prepare(`
    INSERT INTO months (id, user_id, month_key, salary_cents, salary_defined, created_at, rolled_over_from)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).run(randomUUID(), userId, monthKey, salaryCents, createdAt, rolledOverFrom);
}

function updateMonthSalary(userId, monthKey, salaryCents) {
  db.prepare(`
    UPDATE months
    SET salary_cents = ?, salary_defined = 1
    WHERE user_id = ? AND month_key = ?
  `).run(salaryCents, userId, monthKey);
}

function moveTemplateStartMonth(userId, monthKey, nextMonthKey) {
  db.prepare(`
    UPDATE templates
    SET start_month = ?
    WHERE user_id = ? AND start_month = ?
  `).run(nextMonthKey, userId, monthKey);
}

function deleteMonth(userId, monthKey) {
  db.prepare("DELETE FROM months WHERE user_id = ? AND month_key = ?").run(userId, monthKey);
}

module.exports = {
  listMonths,
  getMonthRecord,
  insertMonth,
  updateMonthSalary,
  moveTemplateStartMonth,
  deleteMonth,
};
