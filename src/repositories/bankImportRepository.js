const { randomUUID } = require("node:crypto");
const { db } = require("../db/connection");

function deleteExpiredDrafts(now) {
  return db.prepare(`
    DELETE FROM bank_import_batches
    WHERE status = 'draft' AND expires_at < ?
  `).run(now);
}

function insertBankImportBatch(userId, batch, items) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO bank_import_batches (
      id, user_id, filename, file_hash, status, bank_name, account_label, currency,
      date_from, date_to, expense_cents, income_cents, item_count, created_at, expires_at
    ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    batch.filename,
    batch.fileHash,
    batch.bankName,
    batch.accountLabel,
    batch.currency,
    batch.dateFrom,
    batch.dateTo,
    batch.expenseCents,
    batch.incomeCents,
    items.length,
    batch.createdAt,
    batch.expiresAt
  );

  const insertItem = db.prepare(`
    INSERT INTO bank_import_items (
      id, batch_id, user_id, external_id, dedupe_key, account_fingerprint, account_label, posted_date,
      month_key, description, memo, amount_cents, direction, transaction_type, currency, payment_method,
      sic, payee_id, extended_name, suggested_entry_id, suggested_category_id, category_source,
      category_confidence, duplicate, blocked_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of items) {
    insertItem.run(
      randomUUID(),
      id,
      userId,
      item.externalId,
      item.dedupeKey,
      item.accountFingerprint,
      item.accountLabel,
      item.postedDate,
      item.monthKey,
      item.description,
      item.memo,
      item.amountCents,
      item.direction,
      item.transactionType,
      item.currency,
      item.paymentMethod,
      item.sic || "",
      item.payeeId || "",
      item.extendedName || "",
      item.suggestedEntryId || null,
      item.suggestedCategoryId || null,
      item.categorySource || "",
      item.categoryConfidence || 0,
      item.duplicate ? 1 : 0,
      item.blockedReason || "",
      batch.createdAt
    );
  }
  return id;
}

function findBankImportBatch(userId, batchId) {
  return db.prepare(`
    SELECT * FROM bank_import_batches WHERE id = ? AND user_id = ?
  `).get(batchId, userId);
}

function listBankImportItems(userId, batchId) {
  return db.prepare(`
    SELECT items.*, entries.name AS suggested_entry_name,
      suggested_category.name AS suggested_category_name,
      suggested_category.color AS suggested_category_color,
      selected_category.name AS category_name,
      selected_category.color AS category_color
    FROM bank_import_items AS items
    LEFT JOIN entries ON entries.id = items.suggested_entry_id AND entries.user_id = items.user_id
    LEFT JOIN categories AS suggested_category ON suggested_category.id = items.suggested_category_id
    LEFT JOIN categories AS selected_category ON selected_category.id = items.category_id
    WHERE items.batch_id = ? AND items.user_id = ?
    ORDER BY items.posted_date ASC, items.id ASC
  `).all(batchId, userId);
}

function listBankImportHistory(userId, page, pageSize) {
  const offset = (page - 1) * pageSize;
  const rows = db.prepare(`
    SELECT * FROM bank_import_batches
    WHERE user_id = ? AND status <> 'draft'
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(userId, pageSize, offset);
  const total = Number(db.prepare(`
    SELECT COUNT(*) AS total FROM bank_import_batches
    WHERE user_id = ? AND status <> 'draft'
  `).get(userId).total || 0);
  return { rows, total };
}

function findActiveDedupeKeys(userId, keys) {
  const found = new Set();
  for (let index = 0; index < keys.length; index += 500) {
    const part = keys.slice(index, index + 500);
    if (!part.length) continue;
    const placeholders = part.map(() => "?").join(",");
    const rows = db.prepare(`
      SELECT dedupe_key FROM bank_import_items
      WHERE user_id = ? AND dedupe_key IN (${placeholders})
        AND committed_at <> '' AND undone_at = ''
        AND decision IN ('create', 'match', 'income', 'salary')
    `).all(userId, ...part);
    rows.forEach((row) => found.add(row.dedupe_key));
  }
  return found;
}

function completeBankImportItem(userId, itemId, payload) {
  return db.prepare(`
    UPDATE bank_import_items
    SET decision = ?, category_id = ?, category_source = ?, linked_entry_id = ?,
      previous_entry_json = ?, applied_entry_updated_at = ?, committed_at = ?
    WHERE id = ? AND user_id = ? AND committed_at = ''
  `).run(
    payload.decision,
    payload.categoryId || null,
    payload.categorySource || "",
    payload.linkedEntryId || null,
    payload.previousEntryJson || "",
    payload.appliedEntryUpdatedAt || "",
    payload.committedAt || "",
    itemId,
    userId
  );
}

function completeBankImportBatch(userId, batchId, completedAt, createdMonths, salarySnapshot = {}) {
  return db.prepare(`
    UPDATE bank_import_batches
    SET status = 'completed', completed_at = ?, created_months_json = ?, salary_snapshot_json = ?
    WHERE id = ? AND user_id = ? AND status = 'draft'
  `).run(completedAt, JSON.stringify(createdMonths), JSON.stringify(salarySnapshot), batchId, userId);
}

function getImportedSalaryReceived(userId, monthKey) {
  return Number(db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS total
    FROM entries
    WHERE user_id = ? AND month_key = ? AND direction = 'income' AND is_salary = 1
  `).get(userId, monthKey).total || 0);
}

function updateImportDecisionForEntry(userId, entryId, decision, updatedAt) {
  return db.prepare(`
    UPDATE bank_import_items
    SET decision = ?, applied_entry_updated_at = ?
    WHERE user_id = ? AND linked_entry_id = ? AND committed_at <> '' AND undone_at = ''
  `).run(decision, updatedAt, userId, entryId);
}

function ensureImportSalarySnapshotForEntry(userId, entryId, monthKey, month) {
  const batch = db.prepare(`
    SELECT batches.id, batches.salary_snapshot_json
    FROM bank_import_batches AS batches
    JOIN bank_import_items AS items ON items.batch_id = batches.id
    WHERE items.user_id = ? AND items.linked_entry_id = ?
      AND items.committed_at <> '' AND items.undone_at = ''
    LIMIT 1
  `).get(userId, entryId);
  if (!batch) return;

  let snapshot = {};
  try {
    snapshot = JSON.parse(batch.salary_snapshot_json || "{}");
  } catch {
    snapshot = {};
  }
  if (Object.prototype.hasOwnProperty.call(snapshot, monthKey)) return;
  snapshot[monthKey] = month ? {
    salaryCents: Number(month.salary_cents || 0),
    salaryDefined: Boolean(month.salary_defined),
    salarySource: month.salary_source || "manual",
  } : null;
  db.prepare(`
    UPDATE bank_import_batches SET salary_snapshot_json = ?
    WHERE id = ? AND user_id = ?
  `).run(JSON.stringify(snapshot), batch.id, userId);
}

function releaseOrphanedImportItems(userId, now) {
  const result = db.prepare(`
    UPDATE bank_import_items
    SET undone_at = ?
    WHERE user_id = ? AND committed_at <> '' AND undone_at = ''
      AND decision IN ('create', 'income', 'salary', 'match') AND linked_entry_id IS NULL
  `).run(now, userId);

  db.prepare(`
    UPDATE bank_import_batches
    SET status = 'undone', undone_at = ?
    WHERE user_id = ? AND status = 'completed'
      AND EXISTS (
        SELECT 1 FROM bank_import_items
        WHERE bank_import_items.batch_id = bank_import_batches.id AND committed_at <> ''
      )
      AND NOT EXISTS (
        SELECT 1 FROM bank_import_items
        WHERE bank_import_items.batch_id = bank_import_batches.id
          AND committed_at <> '' AND undone_at = ''
      )
  `).run(now, userId);
  return result;
}

function markBankImportUndone(userId, batchId, undoneAt) {
  db.prepare(`
    UPDATE bank_import_items SET undone_at = ?
    WHERE batch_id = ? AND user_id = ? AND committed_at <> '' AND undone_at = ''
  `).run(undoneAt, batchId, userId);
  return db.prepare(`
    UPDATE bank_import_batches SET status = 'undone', undone_at = ?
    WHERE id = ? AND user_id = ? AND status = 'completed'
  `).run(undoneAt, batchId, userId);
}

module.exports = {
  deleteExpiredDrafts,
  insertBankImportBatch,
  findBankImportBatch,
  listBankImportItems,
  listBankImportHistory,
  findActiveDedupeKeys,
  completeBankImportItem,
  completeBankImportBatch,
  markBankImportUndone,
  getImportedSalaryReceived,
  updateImportDecisionForEntry,
  ensureImportSalarySnapshotForEntry,
  releaseOrphanedImportItems,
};
