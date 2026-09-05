const { randomUUID } = require("node:crypto");
const { db } = require("../db/connection");

function listTemplates(userId, monthKey = "") {
  const monthClause = monthKey ? "AND (start_month = '' OR start_month <= ?)" : "";
  return db.prepare(`
    SELECT id, user_id, name, default_amount_cents, cycle, payment_method, observation, start_month, is_variable, category_id, sort_order, created_at
    FROM templates
    WHERE user_id = ? AND active = 1 ${monthClause}
    ORDER BY sort_order ASC, name COLLATE NOCASE ASC
  `).all(...(monthKey ? [userId, monthKey] : [userId]));
}

function findTemplateById(userId, templateId, { activeOnly = false } = {}) {
  const activeClause = activeOnly ? "AND active = 1" : "";
  return db.prepare(`
    SELECT id, user_id, name, default_amount_cents, cycle, payment_method, observation, start_month, is_variable, category_id, active, sort_order, created_at
    FROM templates
    WHERE id = ? AND user_id = ? ${activeClause}
  `).get(templateId, userId);
}

function getNextTemplateSortOrder(userId) {
  return Number(
    db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM templates WHERE user_id = ?")
      .get(userId).next_order
  );
}

function insertTemplate(userId, payload) {
  const templateId = randomUUID();
  db.prepare(`
    INSERT INTO templates (
      id, user_id, name, default_amount_cents, cycle, payment_method, observation, start_month, is_variable, category_id, active, sort_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    templateId,
    userId,
    payload.name,
    payload.amountCents,
    payload.cycle,
    payload.paymentMethod,
    payload.observation,
    payload.startMonth,
    payload.isVariable ? 1 : 0,
    payload.categoryId || null,
    payload.sortOrder,
    payload.createdAt
  );

  return templateId;
}

function updateTemplate(userId, templateId, payload) {
  return db.prepare(`
    UPDATE templates
    SET
      name = ?,
      default_amount_cents = ?,
      cycle = ?,
      payment_method = ?,
      observation = ?,
      start_month = ?,
      is_variable = ?,
      category_id = ?
    WHERE id = ? AND user_id = ?
  `).run(
    payload.name,
    payload.amountCents,
    payload.cycle,
    payload.paymentMethod,
    payload.observation,
    payload.startMonth,
    payload.isVariable ? 1 : 0,
    payload.categoryId || null,
    templateId,
    userId
  );
}

function updateTemplateObservation(userId, templateId, observation) {
  return db.prepare(`
    UPDATE templates
    SET observation = ?
    WHERE id = ? AND user_id = ?
  `).run(observation, templateId, userId);
}

function deactivateTemplate(userId, templateId) {
  return db.prepare(`
    UPDATE templates
    SET active = 0
    WHERE id = ? AND user_id = ?
  `).run(templateId, userId);
}

module.exports = {
  listTemplates,
  findTemplateById,
  getNextTemplateSortOrder,
  insertTemplate,
  updateTemplate,
  updateTemplateObservation,
  deactivateTemplate,
};
