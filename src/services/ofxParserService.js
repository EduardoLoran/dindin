const { createHash } = require("node:crypto");
const { OFX_MAX_TRANSACTIONS } = require("../config");
const { httpError } = require("../lib/errors");

let ofxModulePromise;

async function parseOfx(buffer, filename) {
  const ofx = await loadOfxModule();
  let result;
  try {
    result = ofx.parseBuffer(new Uint8Array(buffer));
  } catch {
    throw httpError(400, "O arquivo OFX e invalido ou nao e suportado.", "invalid_ofx");
  }
  if (!result.success) {
    throw httpError(400, "O arquivo OFX e invalido ou nao e suportado.", "invalid_ofx");
  }

  const statements = collectStatements(result.data);
  const transactions = statements.flatMap(normalizeStatement);
  if (!transactions.length) {
    throw httpError(400, "O arquivo OFX nao possui movimentacoes bancarias.", "empty_ofx");
  }
  if (transactions.length > OFX_MAX_TRANSACTIONS) {
    throw httpError(413, `O arquivo possui mais de ${OFX_MAX_TRANSACTIONS} movimentacoes.`, "too_many_transactions");
  }

  const signOn = result.data.OFX?.SIGNONMSGSRSV1?.SONRS;
  const dates = transactions.map((item) => item.postedDate).sort();
  const currencies = [...new Set(transactions.map((item) => item.currency))];
  const accounts = [...new Map(statements.map((item) => [item.accountFingerprint, item.accountLabel])).values()];

  return {
    filename: cleanFilename(filename),
    fileHash: hash(buffer),
    bankName: cleanText(signOn?.FI?.ORG || signOn?.FI?.FID || statements[0]?.bankId || "Instituicao nao informada", 100),
    accountLabel: accounts.length === 1 ? accounts[0] : `${accounts.length} contas`,
    currency: currencies.length === 1 ? currencies[0] : "MULTI",
    dateFrom: dates[0],
    dateTo: dates[dates.length - 1],
    transactions,
  };
}

function collectStatements(document) {
  const root = document.OFX || {};
  const statements = [];
  for (const response of asArray(root.BANKMSGSRSV1?.STMTTRNRS)) {
    if (response?.STMTRS) statements.push(statementDescriptor(response.STMTRS, false));
  }
  for (const response of asArray(root.CREDITCARDMSGSRSV1?.CCSTMTTRNRS)) {
    if (response?.CCSTMTRS) statements.push(statementDescriptor(response.CCSTMTRS, true));
  }
  return statements;
}

function statementDescriptor(statement, isCreditCard) {
  const account = statement.CCACCTFROM || statement.BANKACCTFROM || {};
  const accountId = String(account.ACCTID || "unknown").trim();
  const bankId = String(account.BANKID || (isCreditCard ? "credit-card" : "bank")).trim();
  const accountType = String(account.ACCTTYPE || (isCreditCard ? "CREDITCARD" : "CHECKING")).trim();
  const accountFingerprint = hash(`${bankId}|${accountId}|${accountType}`);
  const lastFour = accountId.replace(/\D/g, "").slice(-4) || accountId.slice(-4) || "----";
  return {
    accountFingerprint,
    accountLabel: `${isCreditCard ? "Cartao" : "Conta"} final ${lastFour}`,
    bankId,
    currency: String(statement.CURDEF || "BRL").trim().toUpperCase(),
    paymentMethod: isCreditCard ? "Cartao de credito" : "Conta bancaria",
    transactions: asArray(statement.BANKTRANLIST?.STMTTRN),
  };
}

function normalizeStatement(statement) {
  return statement.transactions
    .map((transaction) => normalizeTransaction(statement, transaction))
    .filter(Boolean);
}

function normalizeTransaction(statement, transaction) {
  const signedAmount = Number(transaction.TRNAMT);
  if (!Number.isFinite(signedAmount) || signedAmount === 0 || !transaction.DTPOSTED) return null;
  const postedDate = formatOfxDate(transaction.DTPOSTED);
  const description = cleanText(transaction.NAME || transaction.MEMO || transaction.TRNTYPE || "Movimentacao bancaria", 100);
  const memo = cleanText(transaction.MEMO || "", 500);
  const extendedName = cleanText(transaction.EXTDNAME || "", 100);
  const payeeId = cleanText(transaction.PAYEEID || "", 40);
  const sic = cleanText(transaction.SIC || "", 12);
  const externalId = cleanText(transaction.FITID || "", 255);
  const amountCents = Math.abs(Math.round(signedAmount * 100));
  const direction = signedAmount < 0 ? "expense" : "income";
  const transactionType = cleanText(transaction.TRNTYPE || "OTHER", 30).toUpperCase();
  const currency = cleanText(transaction.CURRENCY || statement.currency || "BRL", 8).toUpperCase();
  const fallbackIdentity = `${postedDate}|${amountCents}|${direction}|${description.toLowerCase()}|${memo.toLowerCase()}`;
  const dedupeKey = hash(`${statement.accountFingerprint}|${externalId ? `fitid:${externalId}` : `fallback:${fallbackIdentity}`}`);

  return {
    externalId,
    dedupeKey,
    accountFingerprint: statement.accountFingerprint,
    postedDate,
    monthKey: postedDate.slice(0, 7),
    description,
    memo,
    extendedName,
    payeeId,
    sic,
    amountCents,
    direction,
    transactionType,
    currency,
    paymentMethod: statement.paymentMethod,
    accountLabel: statement.accountLabel,
  };
}

function formatOfxDate(value) {
  const year = String(value.year).padStart(4, "0");
  const month = String(value.month).padStart(2, "0");
  const day = String(value.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cleanFilename(value) {
  const filename = String(value || "extrato.ofx").replace(/[\\/]/g, "").trim();
  return cleanText(filename || "extrato.ofx", 160);
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function loadOfxModule() {
  ofxModulePromise ||= import("@f-o-t/ofx");
  return ofxModulePromise;
}

module.exports = { parseOfx };
