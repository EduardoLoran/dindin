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
      entries.direction,
      entries.is_salary,
      entries.transaction_date,
      entries.source_type,
      entries.category_id,
      categories.name AS category_name,
      categories.color AS category_color,
      entries.created_at,
      entries.updated_at
    FROM entries
    LEFT JOIN templates ON templates.id = entries.template_id
    LEFT JOIN categories ON categories.id = entries.category_id
    WHERE entries.user_id = ? AND entries.month_key = ?
    ORDER BY
      CASE entries.cycle WHEN 'Inicio Do Mes' THEN 0 ELSE 1 END,
      entries.name COLLATE NOCASE ASC
  `).all(userId, monthKey);
}

function findEntryMonthById(userId, entryId) {
  return db.prepare("SELECT month_key, direction, is_salary FROM entries WHERE id = ? AND user_id = ?").get(entryId, userId);
}

function listOwnedEntryIdsInMonth(userId, monthKey, entryIds) {
  if (!entryIds.length) return [];
  const placeholders = entryIds.map(() => "?").join(",");
  return db.prepare(`
    SELECT id
    FROM entries
    WHERE user_id = ? AND month_key = ? AND id IN (${placeholders})
  `).all(userId, monthKey, ...entryIds).map((row) => row.id);
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
      id, user_id, month_key, template_id, name, amount_cents, cycle, payment_method, observation, status, is_variable,
      direction, transaction_date, source_type, category_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'expense', '', 'fixed', ?, ?, ?)
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
    template.category_id || null,
    now,
    now
  );
}

function listPendingExpenseEntries(userId, monthKey) {
  return db.prepare(`
    SELECT id, name, amount_cents, cycle, payment_method, observation, status, updated_at
    FROM entries
    WHERE user_id = ? AND month_key = ? AND direction = 'expense' AND status = 'pending'
    ORDER BY amount_cents DESC, name COLLATE NOCASE ASC
  `).all(userId, monthKey);
}

function findEntryForImport(userId, entryId, monthKey) {
  return db.prepare(`
    SELECT id, user_id, month_key, template_id, name, amount_cents, cycle, payment_method,
      observation, status, is_variable, direction, is_salary, transaction_date, source_type, category_id, created_at, updated_at
    FROM entries
    WHERE id = ? AND user_id = ? AND month_key = ?
  `).get(entryId, userId, monthKey);
}

function insertImportedEntry(userId, payload) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO entries (
      id, user_id, month_key, template_id, name, amount_cents, cycle, payment_method,
      observation, status, is_variable, direction, is_salary, transaction_date, source_type, category_id, created_at, updated_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'paid', 1, ?, ?, ?, 'ofx', ?, ?, ?)
  `).run(
    id,
    userId,
    payload.monthKey,
    payload.name,
    payload.amountCents,
    payload.cycle,
    payload.paymentMethod,
    payload.observation || "",
    payload.direction,
    payload.isSalary ? 1 : 0,
    payload.transactionDate,
    payload.categoryId || null,
    payload.createdAt,
    payload.createdAt
  );
  return id;
}

function applyImportedExpenseToEntry(userId, entryId, payload) {
  return db.prepare(`
    UPDATE entries
    SET amount_cents = ?, cycle = ?, payment_method = ?, status = 'paid',
      transaction_date = ?, source_type = 'ofx', category_id = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND month_key = ? AND direction = 'expense'
  `).run(
    payload.amountCents,
    payload.cycle,
    payload.paymentMethod,
    payload.transactionDate,
    payload.categoryId || null,
    payload.updatedAt,
    entryId,
    userId,
    payload.monthKey
  );
}

function restoreEntryAfterImport(userId, snapshot, expectedUpdatedAt) {
  return db.prepare(`
    UPDATE entries
    SET name = ?, amount_cents = ?, cycle = ?, payment_method = ?, observation = ?, status = ?,
      is_variable = ?, direction = ?, is_salary = ?, transaction_date = ?, source_type = ?, category_id = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND updated_at = ?
  `).run(
    snapshot.name,
    snapshot.amount_cents,
    snapshot.cycle,
    snapshot.payment_method,
    snapshot.observation,
    snapshot.status,
    snapshot.is_variable,
    snapshot.direction,
    snapshot.is_salary || 0,
    snapshot.transaction_date,
    snapshot.source_type,
    snapshot.category_id || null,
    snapshot.updated_at,
    snapshot.id,
    userId,
    expectedUpdatedAt
  );
}

function deleteImportedEntry(userId, entryId, expectedUpdatedAt) {
  return db.prepare(`
    DELETE FROM entries
    WHERE id = ? AND user_id = ? AND source_type = 'ofx' AND updated_at = ?
  `).run(entryId, userId, expectedUpdatedAt);
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

function updateEntriesBulk(userId, monthKey, entries, updatedAt) {
  const statement = db.prepare(`
    UPDATE entries
    SET amount_cents = ?, cycle = ?, status = ?, observation = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND month_key = ?
  `);
  for (const entry of entries) {
    statement.run(
      entry.amountCents,
      entry.cycle,
      entry.status,
      entry.observation,
      updatedAt,
      entry.id,
      userId,
      monthKey
    );
  }
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
      category_id = ?,
      updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    template.name,
    template.default_amount_cents,
    template.cycle,
    template.payment_method,
    template.is_variable,
    template.category_id || null,
    updatedAt,
    entryId,
    userId
  );
}

function deleteEntry(userId, entryId) {
  db.prepare("DELETE FROM entries WHERE id = ? AND user_id = ?").run(entryId, userId);
}

function updateIncomeClassification(userId, entryId, isSalary, updatedAt) {
  return db.prepare(`
    UPDATE entries
    SET is_salary = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND direction = 'income'
  `).run(isSalary ? 1 : 0, updatedAt, entryId, userId);
}

function deleteEntriesByMonthAndDirections(userId, monthKey, directions) {
  const placeholders = directions.map(() => "?").join(",");
  return db.prepare(`
    DELETE FROM entries
    WHERE user_id = ? AND month_key = ? AND direction IN (${placeholders})
  `).run(userId, monthKey, ...directions);
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
  listOwnedEntryIdsInMonth,
  findEntryByTemplateInMonth,
  listEntryIdsByTemplateInMonth,
  listDuplicateTemplateEntryGroups,
  insertEntryFromTemplate,
  listPendingExpenseEntries,
  findEntryForImport,
  insertImportedEntry,
  applyImportedExpenseToEntry,
  restoreEntryAfterImport,
  deleteImportedEntry,
  updateEntry,
  updateEntryObservation,
  updateEntriesBulk,
  updateEntryFromTemplate,
  deleteEntry,
  updateIncomeClassification,
  deleteEntriesByMonthAndDirections,
  deleteEntriesByIds,
  deleteEntriesByTemplateAndMonth,
  deleteEntriesByMonth,
};
