const { getCurrentMonthKey, fromCents, normalizeMonthKey } = require("./values");

function serializeEntry(entry) {
  return {
    id: entry.id,
    monthKey: entry.month_key,
    templateId: entry.template_id,
    name: entry.name,
    amount: fromCents(entry.amount_cents),
    cycle: entry.cycle,
    paymentMethod: entry.payment_method,
    observation: entry.observation,
    status: entry.status,
    isVariable: Boolean(entry.is_variable),
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

function serializeTemplate(template) {
  return {
    id: template.id,
    name: template.name,
    amount: fromCents(template.default_amount_cents),
    cycle: template.cycle,
    paymentMethod: template.payment_method,
    observation: template.observation,
    startMonth: normalizeMonthKey(template.start_month) || getCurrentMonthKey(),
    isVariable: Boolean(template.is_variable),
    createdAt: template.created_at,
  };
}

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    avatarDataUrl: String(user.avatar_data_url || ""),
    isAdmin: Boolean(user.is_admin),
    mustChangePassword: Boolean(user.must_change_password),
    lastLoginAt: String(user.last_login_at || ""),
    createdAt: String(user.created_at || ""),
  };
}

module.exports = {
  serializeEntry,
  serializeTemplate,
  serializeUser,
};
