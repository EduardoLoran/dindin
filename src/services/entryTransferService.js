const { runInTransaction } = require("../db/schema");
const { httpError } = require("../lib/errors");
const { fromCents } = require("../lib/values");
const { insertAuditEvent } = require("../repositories/auditRepository");
const { deleteEntry, listEntries, movePendingEntryToMonth } = require("../repositories/entryRepository");
const { getMonthRecord } = require("../repositories/monthRepository");
const { moveTemplateStartMonthIfMatches } = require("../repositories/templateRepository");
const { assertMonthOpen, ensureMonthExists } = require("./monthService");

const TRANSFERABLE_SOURCES = new Set(["manual", "fixed"]);

function previewPendingEntryTransfer(userId, sourceMonth, targetMonth) {
  validateMonthOrder(sourceMonth, targetMonth);
  assertMonthOpen(userId, sourceMonth);
  const target = getMonthRecord(userId, targetMonth);
  if (target?.closed_at) throw httpError(409, "O mes de destino esta fechado.", "target_month_closed");

  const targetByTemplate = new Map(
    (target ? listEntries(userId, targetMonth) : [])
      .filter((entry) => entry.template_id)
      .map((entry) => [entry.template_id, entry])
  );
  const items = listEntries(userId, sourceMonth)
    .filter(isTransferable)
    .map((entry) => serializeTransferItem(entry, targetByTemplate.get(entry.template_id)));

  return {
    sourceMonth,
    targetMonth,
    targetExists: Boolean(target),
    items,
    itemCount: items.length,
    total: fromCents(items.reduce((sum, item) => sum + item.amountCents, 0)),
    conflictCount: items.filter((item) => item.conflict).length,
    blockedConflictCount: items.filter((item) => item.conflict && !item.conflict.canReplace).length,
    adjustableTemplateCount: items.filter((item) => item.adjustableTemplateStart).length,
  };
}

function transferPendingEntries(userId, payload) {
  const uniqueIds = [...new Set(payload.entryIds)];
  if (uniqueIds.length !== payload.entryIds.length) {
    throw httpError(400, "A selecao contem lancamentos repetidos.", "duplicate_entries");
  }

  const preview = previewPendingEntryTransfer(userId, payload.sourceMonth, payload.targetMonth);
  const byId = new Map(preview.items.map((item) => [item.id, item]));
  const selected = uniqueIds.map((entryId) => byId.get(entryId));
  if (selected.some((item) => !item)) {
    throw httpError(409, "Um ou mais lancamentos nao estao mais disponiveis para transferencia.", "transfer_selection_changed");
  }

  const skipped = [];
  const movable = [];
  for (const item of selected) {
    if (!item.conflict) movable.push(item);
    else if (payload.conflictPolicy === "replace" && item.conflict.canReplace) movable.push(item);
    else skipped.push(item);
  }
  if (!movable.length) {
    throw httpError(409, "Nenhum lancamento pode ser transferido com as opcoes selecionadas.", "nothing_to_transfer");
  }

  const updatedAt = new Date().toISOString();
  const adjustedTemplates = new Set();
  runInTransaction(() => {
    if (!getMonthRecord(userId, payload.targetMonth)) {
      ensureMonthExists(userId, payload.targetMonth, { initializeFixedEntries: false });
    }
    assertMonthOpen(userId, payload.sourceMonth);
    assertMonthOpen(userId, payload.targetMonth);

    for (const item of movable) {
      if (item.conflict) {
        const deleted = deleteEntry(userId, item.conflict.targetEntryId);
        if (deleted.changes !== 1) throw httpError(409, "O conflito no mes de destino foi alterado. Revise novamente.", "transfer_conflict_changed");
      }
      const moved = movePendingEntryToMonth(userId, item.id, payload.sourceMonth, payload.targetMonth, updatedAt);
      if (moved.changes !== 1) throw httpError(409, "Um lancamento foi alterado durante a transferencia.", "transfer_selection_changed");

      if (payload.adjustTemplateStart && item.adjustableTemplateStart && item.templateId) {
        const adjusted = moveTemplateStartMonthIfMatches(userId, item.templateId, payload.sourceMonth, payload.targetMonth);
        if (adjusted.changes === 1) adjustedTemplates.add(item.templateId);
      }
    }

    insertAuditEvent({
      userId,
      eventType: "pending_entries_transferred",
      targetType: "month",
      targetId: payload.targetMonth,
      metadata: {
        sourceMonth: payload.sourceMonth,
        targetMonth: payload.targetMonth,
        movedEntryIds: movable.map((item) => item.id),
        skippedEntryIds: skipped.map((item) => item.id),
        conflictPolicy: payload.conflictPolicy,
        adjustedTemplateIds: [...adjustedTemplates],
      },
    });
  });

  return {
    sourceMonth: payload.sourceMonth,
    targetMonth: payload.targetMonth,
    movedCount: movable.length,
    movedTotal: fromCents(movable.reduce((sum, item) => sum + item.amountCents, 0)),
    skippedCount: skipped.length,
    adjustedTemplateCount: adjustedTemplates.size,
  };
}

function isTransferable(entry) {
  return entry.direction === "expense"
    && entry.status === "pending"
    && TRANSFERABLE_SOURCES.has(entry.source_type);
}

function serializeTransferItem(entry, targetEntry) {
  const conflict = targetEntry ? {
    targetEntryId: targetEntry.id,
    name: targetEntry.name,
    status: targetEntry.status,
    sourceType: targetEntry.source_type,
    canReplace: isTransferable(targetEntry),
  } : null;
  return {
    id: entry.id,
    name: entry.name,
    amount: fromCents(entry.amount_cents),
    amountCents: Number(entry.amount_cents || 0),
    cycle: entry.cycle,
    sourceType: entry.source_type,
    templateId: entry.template_id || null,
    adjustableTemplateStart: Boolean(entry.template_id && entry.template_start_month === entry.month_key),
    conflict,
  };
}

function validateMonthOrder(sourceMonth, targetMonth) {
  if (targetMonth <= sourceMonth) {
    throw httpError(400, "Escolha um mes de destino posterior ao mes de origem.", "invalid_transfer_month");
  }
}

module.exports = { previewPendingEntryTransfer, transferPendingEntries };
