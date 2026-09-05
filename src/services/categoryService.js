const { runInTransaction } = require("../db/schema");
const { httpError } = require("../lib/errors");
const {
  countCategories,
  countEntriesForCategory,
  deactivateCategory,
  findCategoryById,
  findCategoryByName,
  findCategoryBySlug,
  insertCategory,
  insertCategoryRule,
  listCategories,
  listCategoryRules,
  updateCategory,
} = require("../repositories/categoryRepository");

const DEFAULT_CATEGORIES = [
  { slug: "mercado", name: "Mercado", color: "#7A41C0", direction: "expense", keywords: ["atacadao", "assai", "carrefour", "supermercado", "mercado", "max atacadista"] },
  { slug: "transporte", name: "Transporte", color: "#4F6BED", direction: "expense", keywords: ["99", "uber", "taxi", "posto", "combustivel", "shell", "ipiranga"] },
  { slug: "alimentacao", name: "Alimentação", color: "#C080B4", direction: "expense", keywords: ["ifood", "restaurante", "lanchonete", "padaria", "delivery"] },
  { slug: "moradia", name: "Moradia", color: "#B180BF", direction: "expense", keywords: ["aluguel", "condominio", "copel", "energia", "sanepar", "agua", "internet"] },
  { slug: "saude", name: "Saúde", color: "#BF808E", direction: "expense", keywords: ["farmacia", "drogaria", "hospital", "clinica", "laboratorio"] },
  { slug: "educacao", name: "Educação", color: "#8A6BBE", direction: "expense", keywords: ["faculdade", "escola", "curso", "livraria", "udemy"] },
  { slug: "lazer", name: "Lazer", color: "#BF8780", direction: "expense", keywords: ["cinema", "ingresso", "viagem", "hotel", "parque"] },
  { slug: "assinaturas", name: "Assinaturas", color: "#9A75B5", direction: "expense", keywords: ["netflix", "spotify", "amazon prime", "youtube premium", "disney"] },
  { slug: "transferencias", name: "Transferências", color: "#76809A", direction: "both", keywords: ["transferencia", "ted", "doc"] },
  { slug: "receitas", name: "Receitas", color: "#3FAE91", direction: "income", keywords: ["salario", "pagamento recebido", "freelance", "rendimento"] },
  { slug: "outros", name: "Outros", color: "#8C8492", direction: "both", keywords: [] },
];

function ensureDefaultCategories(userId) {
  if (countCategories(userId) > 0) return;
  const now = new Date().toISOString();
  runInTransaction(() => {
    DEFAULT_CATEGORIES.forEach((category, index) => {
      const categoryId = insertCategory(userId, {
        ...category,
        isSystem: true,
        sortOrder: index + 1,
        createdAt: now,
        updatedAt: now,
      });
      category.keywords.forEach((keyword) => insertCategoryRule(userId, {
        categoryId,
        matchType: "keyword",
        pattern: normalizeMatchText(keyword),
        origin: "default",
        priority: 50,
        updatedAt: now,
      }));
    });
  });
}

function getCategories(userId, options) {
  ensureDefaultCategories(userId);
  return listCategories(userId, options).map(serializeCategory);
}

function createCategory(userId, input) {
  ensureDefaultCategories(userId);
  const payload = normalizeCategoryInput(input);
  if (findCategoryByName(userId, payload.name)) throw httpError(409, "Ja existe uma categoria com esse nome.", "category_exists");
  const now = new Date().toISOString();
  const categoryId = insertCategory(userId, {
    ...payload,
    slug: uniqueSlug(userId, payload.name),
    isSystem: false,
    sortOrder: listCategories(userId, { activeOnly: false }).length + 1,
    createdAt: now,
    updatedAt: now,
  });
  return serializeCategory(findCategoryById(userId, categoryId));
}

function editCategory(userId, categoryId, input) {
  const current = requireCategory(userId, categoryId);
  const payload = normalizeCategoryInput(input);
  if (findCategoryByName(userId, payload.name, categoryId)) throw httpError(409, "Ja existe uma categoria com esse nome.", "category_exists");
  updateCategory(userId, categoryId, { ...payload, updatedAt: new Date().toISOString() });
  return serializeCategory({ ...current, name: payload.name, color: payload.color, direction: payload.direction, active: 1 });
}

function removeCategory(userId, categoryId) {
  const category = requireCategory(userId, categoryId);
  if (category.slug === "outros") throw httpError(409, "A categoria Outros precisa permanecer ativa.", "protected_category");
  deactivateCategory(userId, categoryId, new Date().toISOString());
  return { ok: true, affectedEntries: countEntriesForCategory(userId, categoryId) };
}

function requireCategory(userId, categoryId, direction = "") {
  const category = findCategoryById(userId, String(categoryId || ""), { activeOnly: true });
  if (!category) throw httpError(400, "Categoria invalida.", "invalid_category");
  if (direction && category.direction !== "both" && category.direction !== direction) {
    throw httpError(400, "A categoria nao e compativel com esta movimentacao.", "invalid_category_direction");
  }
  return category;
}

function categorizeTransaction(userId, transaction) {
  ensureDefaultCategories(userId);
  const rules = listCategoryRules(userId);
  const haystack = normalizeMatchText([
    transaction.description,
    transaction.extendedName,
    transaction.memo,
    transaction.payeeId,
  ].filter(Boolean).join(" "));
  const sic = normalizeMatchText(transaction.sic);
  const matchingRules = rules.filter((rule) => rule.category_direction === "both" || rule.category_direction === transaction.direction);

  const sicRule = sic && matchingRules.find((rule) => rule.match_type === "sic" && rule.pattern === sic);
  if (sicRule) return categorySuggestion(sicRule, "ofx_sic", 96);

  const keywordRule = matchingRules.find((rule) => rule.match_type === "keyword" && containsPattern(haystack, rule.pattern));
  if (keywordRule) return categorySuggestion(keywordRule, keywordRule.origin === "learned" ? "learned" : "keyword", keywordRule.origin === "learned" ? 98 : 84);

  const fallbackSlug = transaction.direction === "income" ? "receitas" : "outros";
  const fallback = findCategoryBySlug(userId, fallbackSlug) || findCategoryBySlug(userId, "outros");
  return { categoryId: fallback.id, categoryName: fallback.name, categoryColor: fallback.color, source: "fallback", confidence: 25 };
}

function learnCategoryChoice(userId, transaction, categoryId) {
  const category = requireCategory(userId, categoryId, transaction.direction);
  const pattern = merchantPattern(transaction);
  if (!pattern) return null;
  insertCategoryRule(userId, {
    categoryId: category.id,
    matchType: "keyword",
    pattern,
    origin: "learned",
    priority: 100,
    updatedAt: new Date().toISOString(),
  });
  return pattern;
}

function merchantPattern(transaction) {
  const text = normalizeMatchText(transaction.extendedName || transaction.description || transaction.memo);
  const stopWords = new Set(["pix", "compra", "pagamento", "pgto", "debito", "credito", "cartao", "estabelecimento", "recebido", "enviado"]);
  const parts = text.split(" ").filter((part) => part && !stopWords.has(part) && (part === "99" || !/^\d+$/.test(part)));
  return parts.slice(0, 2).join(" ").slice(0, 80);
}

function normalizeCategoryInput(input) {
  const name = String(input?.name || "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 40) throw httpError(400, "Nome da categoria invalido.", "invalid_category");
  const color = String(input?.color || "").toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(color)) throw httpError(400, "Cor da categoria invalida.", "invalid_category");
  const direction = String(input?.direction || "expense");
  if (!new Set(["expense", "income", "both"]).has(direction)) throw httpError(400, "Tipo da categoria invalido.", "invalid_category");
  return { name, color, direction };
}

function uniqueSlug(userId, name) {
  const base = normalizeMatchText(name).replace(/\s+/g, "-").slice(0, 32) || "categoria";
  let slug = base;
  let suffix = 2;
  while (findCategoryBySlug(userId, slug)) slug = `${base}-${suffix++}`;
  return slug;
}

function normalizeMatchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPattern(haystack, pattern) {
  if (!haystack || !pattern) return false;
  return ` ${haystack} `.includes(` ${pattern} `);
}

function categorySuggestion(rule, source, confidence) {
  return {
    categoryId: rule.category_id,
    categoryName: rule.category_name,
    categoryColor: rule.category_color,
    source,
    confidence,
  };
}

function serializeCategory(category) {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    color: category.color,
    direction: category.direction,
    isSystem: Boolean(category.is_system),
    active: Boolean(category.active),
    protected: category.slug === "outros",
    createdAt: category.created_at,
    updatedAt: category.updated_at,
  };
}

module.exports = {
  ensureDefaultCategories,
  getCategories,
  createCategory,
  editCategory,
  removeCategory,
  requireCategory,
  categorizeTransaction,
  learnCategoryChoice,
  normalizeMatchText,
};
