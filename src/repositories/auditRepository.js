const { randomUUID } = require("node:crypto");
const { db } = require("../db/connection");

function insertAuditEvent({ userId = null, eventType, targetType = "", targetId = "", ipAddress = "", metadata = {} }) {
  db.prepare(`
    INSERT INTO audit_events (
      id, user_id, event_type, target_type, target_id, ip_address, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    userId,
    eventType,
    targetType,
    targetId,
    String(ipAddress || "").slice(0, 80),
    JSON.stringify(metadata),
    new Date().toISOString()
  );
}

module.exports = { insertAuditEvent };
