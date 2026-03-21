const { randomUUID } = require("node:crypto");
const { db } = require("../db/connection");

function listEntries(userId, monthKey) {
  return db.prepare(`
    SELECT
      entries.id,
      entries.month_key,
      entries.template_id,
      entries.name,
      entries.amount_cents,
      entries.cycle,
      entries.payment_method,
      COALESCE(NULLIF(entries.observation, ''), templates.observation, '') AS observation,
      entries.status,
      entries.is_variable,
      entries.created_at,
      entries.updated_at
    FROM entries
    LEFT JOIN templates ON templates.id = entries.template_id
    WHERE entries.user_id = ? AND entries.month_key = ?
    ORDER BY
      CASE entries.cycle WHEN 'Inicio Do Mes' THEN 0 ELSE 1 END,
      entries.name COLLATE NOCASE ASC
  `).all(userId, monthKey);
}

function findEntryMonthById(userId, entryId) {
  return db.prepare("SELECT month_key FROM entries WHERE id = ? AND user_id = ?").get(entryId, userId);
}

function findEntryByTemplateInMonth(userId, templateId, monthKey) {
  return db.prepare(`
    SELECT id
    FROM entries
    WHERE user_id = ? AND template_id = ? AND month_key = ?
  `).get(userId, templateId, monthKey);
}

function listEntryIdsByTemplateInMonth(userId, templateId, monthKey) {
  return db.prepare(`
    SELECT id
    FROM entries
    WHERE user_id = ? AND month_key = ? AND template_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(userId, monthKey, templateId);
}

function listDuplicateTemplateEntryGroups() {
  return db.prepare(`
    SELECT user_id, month_key, template_id, COUNT(*) AS cnt
    FROM entries
    WHERE template_id IS NOT NULL
    GROUP BY user_id, month_key, template_id
    HAVING cnt > 1
  `).all();
}

function insertEntryFromTemplate(userId, monthKey, template) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO entries (
      id, user_id, month_key, template_id, name, amount_cents, cycle, payment_method, observation, status, is_variable, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    userId,
    monthKey,
    template.id,
    template.name,
    template.default_amount_cents,
    template.cycle,
    template.payment_method,
    template.observation || "",
    "pending",
    template.is_variable,
    now,
    now
  );
}

function updateEntry(userId, entryId, payload) {
  return db.prepare(`
    UPDATE entries
    SET amount_cents = ?, cycle = ?, status = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(payload.amountCents, payload.cycle, payload.status, payload.updatedAt, entryId, userId);
}

function updateEntryObservation(userId, entryId, observation, updatedAt) {
  return db.prepare(`
    UPDATE entries
    SET observation = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(observation, updatedAt, entryId, userId);
}

function updateEntryFromTemplate(userId, entryId, template, updatedAt) {
  db.prepare(`
    UPDATE entries
    SET
      name = ?,
      amount_cents = ?,
      cycle = ?,
      payment_method = ?,
      is_variable = ?,
      updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    template.name,
    template.default_amount_cents,
    template.cycle,
    template.payment_method,
    template.is_variable,
    updatedAt,
    entryId,
    userId
  );
}

function deleteEntry(userId, entryId) {
  db.prepare("DELETE FROM entries WHERE id = ? AND user_id = ?").run(entryId, userId);
}

function deleteEntriesByIds(ids) {
  if (!ids.length) {
    return;
  }
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM entries WHERE id IN (${placeholders})`).run(...ids);
}

function deleteEntriesByTemplateAndMonth(userId, templateId, monthKey) {
  db.prepare(`
    DELETE FROM entries
    WHERE template_id = ? AND user_id = ? AND month_key = ?
  `).run(templateId, userId, monthKey);
}

function deleteEntriesByMonth(userId, monthKey) {
  db.prepare("DELETE FROM entries WHERE user_id = ? AND month_key = ?").run(userId, monthKey);
}

module.exports = {
  listEntries,
  findEntryMonthById,
  findEntryByTemplateInMonth,
  listEntryIdsByTemplateInMonth,
  listDuplicateTemplateEntryGroups,
  insertEntryFromTemplate,
  updateEntry,
  updateEntryObservation,
  updateEntryFromTemplate,
  deleteEntry,
  deleteEntriesByIds,
  deleteEntriesByTemplateAndMonth,
  deleteEntriesByMonth,
};
