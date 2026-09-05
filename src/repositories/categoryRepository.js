const { randomUUID } = require("node:crypto");
const { db } = require("../db/connection");

function countCategories(userId) {
  return Number(db.prepare("SELECT COUNT(*) AS total FROM categories WHERE user_id = ?").get(userId).total || 0);
}

function insertCategory(userId, category) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO categories (
      id, user_id, slug, name, color, direction, is_system, active, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(
    id,
    userId,
    category.slug,
    category.name,
    category.color,
    category.direction,
    category.isSystem ? 1 : 0,
    category.sortOrder,
    category.createdAt,
    category.updatedAt
  );
  return id;
}

function listCategories(userId, { activeOnly = true } = {}) {
  return db.prepare(`
    SELECT id, user_id, slug, name, color, direction, is_system, active, sort_order, created_at, updated_at
    FROM categories
    WHERE user_id = ? ${activeOnly ? "AND active = 1" : ""}
    ORDER BY active DESC, sort_order ASC, name COLLATE NOCASE ASC
  `).all(userId);
}

function findCategoryById(userId, categoryId, { activeOnly = false } = {}) {
  return db.prepare(`
    SELECT id, user_id, slug, name, color, direction, is_system, active, sort_order, created_at, updated_at
    FROM categories
    WHERE id = ? AND user_id = ? ${activeOnly ? "AND active = 1" : ""}
  `).get(categoryId, userId);
}

function findCategoryBySlug(userId, slug) {
  return db.prepare(`
    SELECT id, user_id, slug, name, color, direction, is_system, active, sort_order, created_at, updated_at
    FROM categories
    WHERE user_id = ? AND slug = ?
  `).get(userId, slug);
}

function findCategoryByName(userId, name, excludeId = "") {
  return db.prepare(`
    SELECT id FROM categories
    WHERE user_id = ? AND lower(name) = lower(?) AND id <> ?
  `).get(userId, name, excludeId);
}

function updateCategory(userId, categoryId, payload) {
  return db.prepare(`
    UPDATE categories
    SET name = ?, color = ?, direction = ?, updated_at = ?
    WHERE id = ? AND user_id = ? AND active = 1
  `).run(payload.name, payload.color, payload.direction, payload.updatedAt, categoryId, userId);
}

function deactivateCategory(userId, categoryId, updatedAt) {
  return db.prepare(`
    UPDATE categories
    SET active = 0, updated_at = ?
    WHERE id = ? AND user_id = ? AND active = 1
  `).run(updatedAt, categoryId, userId);
}

function insertCategoryRule(userId, rule) {
  const now = rule.updatedAt;
  return db.prepare(`
    INSERT INTO category_rules (
      id, user_id, category_id, match_type, pattern, origin, priority, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, match_type, pattern) DO UPDATE SET
      category_id = excluded.category_id,
      origin = excluded.origin,
      priority = excluded.priority,
      updated_at = excluded.updated_at
  `).run(randomUUID(), userId, rule.categoryId, rule.matchType, rule.pattern, rule.origin, rule.priority, now, now);
}

function listCategoryRules(userId) {
  return db.prepare(`
    SELECT rules.id, rules.category_id, rules.match_type, rules.pattern, rules.origin, rules.priority,
      categories.name AS category_name, categories.color AS category_color, categories.direction AS category_direction
    FROM category_rules AS rules
    JOIN categories ON categories.id = rules.category_id AND categories.user_id = rules.user_id
    WHERE rules.user_id = ? AND categories.active = 1
    ORDER BY rules.priority DESC, length(rules.pattern) DESC, rules.pattern ASC
  `).all(userId);
}

function countEntriesForCategory(userId, categoryId) {
  return Number(db.prepare(`
    SELECT COUNT(*) AS total FROM entries WHERE user_id = ? AND category_id = ?
  `).get(userId, categoryId).total || 0);
}

module.exports = {
  countCategories,
  insertCategory,
  listCategories,
  findCategoryById,
  findCategoryBySlug,
  findCategoryByName,
  updateCategory,
  deactivateCategory,
  insertCategoryRule,
  listCategoryRules,
  countEntriesForCategory,
};
