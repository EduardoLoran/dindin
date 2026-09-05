<script setup>
import { computed, h, onMounted, ref, render } from "vue";
import AppIcon from "../components/AppIcon.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import DataGrid from "../components/DataGrid.vue";
import DeleteMonthEntriesDialog from "../components/DeleteMonthEntriesDialog.vue";
import EntryEditDialog from "../components/EntryEditDialog.vue";
import EntryObservationDialog from "../components/EntryObservationDialog.vue";
import IncomeClassificationDialog from "../components/IncomeClassificationDialog.vue";
import MonthPageHeader from "../components/MonthPageHeader.vue";
import { initializeMonthEntries } from "../api/dashboard";
import { deleteEntry, deleteMonthEntries, updateEntry, updateEntryObservation, updateIncomeClassification } from "../api/entries";
import { useMonthlyBootstrap } from "../composables/useMonthlyBootstrap";
import { formatCurrency, formatMonth } from "../utils/formatters";

const { payload, loading, refreshing, error, selectedMonth, applyPayload, load, selectMonth, listenPeriodChanges } = useMonthlyBootstrap();
const pageReady = ref(false);
const rows = ref([]);
const visibleRows = ref([]);
const saving = ref(false);
const actionError = ref("");
const notice = ref("");
const editOpen = ref(false);
const observationOpen = ref(false);
const classificationOpen = ref(false);
const deleteOpen = ref(false);
const deleteAllOpen = ref(false);
const selectedEntry = ref(null);

const isClosed = computed(() => Boolean(payload.value?.month?.isClosed));
const canInitializeFixed = computed(() => Boolean(payload.value?.month?.salaryDefined) && !payload.value?.month?.fixedEntriesInitialized);
const visibleExpenses = computed(() => visibleRows.value.filter((entry) => entry.direction !== "income").reduce((total, entry) => total + Number(entry.amount || 0), 0));
const visibleIncome = computed(() => visibleRows.value.filter((entry) => entry.direction === "income").reduce((total, entry) => total + Number(entry.amount || 0), 0));
const expenseCount = computed(() => rows.value.filter((entry) => entry.direction !== "income").length);
const incomeCount = computed(() => rows.value.filter((entry) => entry.direction === "income").length);

const columns = computed(() => [
  { title: "Ações", field: "actions", width: isClosed.value ? 78 : 112, minWidth: isClosed.value ? 78 : 112, maxWidth: isClosed.value ? 78 : 112, cssClass: "entries-actions-cell", headerHozAlign: "center", clipboard: false, headerSort: false, formatter: actionsFormatter, cellClick: handleActionClick },
  { title: "Lançamento", field: "name", minWidth: 210, widthGrow: 1, widthShrink: 1, sorter: "string", headerValueFilter: true },
  { title: "Data", field: "transactionDate", width: 112, sorter: "string", formatter: (cell) => formatTransactionDate(cell.getValue()), headerValueFilter: { formatter: formatTransactionDate } },
  { title: "Valor", field: "amount", width: 130, hozAlign: "right", sorter: "number", formatter: (cell) => formatCurrency(Number(cell.getValue()) || 0), headerValueFilter: { formatter: (value) => formatCurrency(Number(value) || 0), sortAscendingLabel: "Menor para maior", sortDescendingLabel: "Maior para menor" } },
  { title: "Movimento", field: "direction", width: 110, sorter: "string", formatter: (cell) => cellTag(cell.getValue() === "income" ? "Receita" : "Gasto", cell.getValue() === "income" ? "status-paid" : "status-pending"), headerValueFilter: { formatter: (value) => value === "income" ? "Receita" : "Gasto" } },
  { title: "Classificação", field: "classification", width: 135, sorter: "string", formatter: (cell) => incomeClassificationTag(cell.getRow().getData()), headerValueFilter: { formatter: classificationLabel } },
  { title: "Categoria", field: "categoryName", width: 145, sorter: "string", formatter: (cell) => categoryTag(cell.getRow().getData()), headerValueFilter: { formatter: (value) => value || "Sem categoria" } },
  { title: "Ciclo", field: "cycle", width: 145, sorter: "string", formatter: (cell) => cycleLabel(cell.getValue()), headerValueFilter: { formatter: cycleLabel } },
  { title: "Status", field: "status", width: 135, sorter: "string", formatter: (cell) => cellTag(statusLabel(cell.getValue(), cell.getRow().getData().direction), `status-${cell.getValue() || "unknown"}`), headerValueFilter: { formatter: (value, row) => statusLabel(value, row.direction) } },
  { title: "Pagamento", field: "paymentMethod", width: 135, sorter: "string", formatter: (cell) => cellTag(cell.getValue() || "Não informado", `payment-${paymentTone(cell.getValue())}`), headerValueFilter: { formatter: (value) => value || "Não informado" } },
  { title: "Variação", field: "isVariable", width: 105, sorter: "boolean", formatter: (cell) => cell.getValue() ? "Variável" : "Fixo", headerValueFilter: { formatter: (value) => value ? "Variável" : "Fixo" } },
  { title: "Origem", field: "sourceType", width: 110, sorter: "string", formatter: (cell) => sourceLabel(cell.getValue()), headerValueFilter: { formatter: sourceLabel } },
]);

const gridOptions = computed(() => ({
  clipboard: "copy",
  history: false,
  rowHeader: false,
  selectableRangeClearCells: false,
  columnDefaults: { resizable: "header", tooltip: true, headerSort: true },
  maxHeight: "min(64vh, 720px)",
}));

function cycleLabel(value) {
  return value === "Inicio Do Mes" ? "Início do mês" : String(value || "(Vazio)");
}

function statusLabel(value, direction = "expense") {
  if (direction === "income" && value === "paid") return "Recebido";
  return ({ pending: "Pendente", paid: "Pago", saved: "Guardado" }[value] || String(value || "(Vazio)"));
}

function sourceLabel(value) { return ({ ofx: "OFX", fixed: "Gasto fixo", manual: "Manual" }[value] || "Manual"); }
function classificationLabel(value) {
  return ({ salary: "Salário", extra_income: "Receita extra", not_applicable: "Não se aplica" }[value] || "Não se aplica");
}
function formatTransactionDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function paymentTone(value) {
  const normalized = String(value || "").toLocaleLowerCase("pt-BR");
  if (normalized === "pix") return "pix";
  if (normalized === "boleto") return "boleto";
  return "other";
}

function cellTag(label, tone) {
  const tag = document.createElement("span");
  tag.className = `entries-cell-tag entries-cell-tag--${tone}`;
  tag.textContent = label;
  return tag;
}

function categoryTag(entry) {
  const tag = document.createElement("span");
  tag.className = "import-category-tag";
  const dot = document.createElement("i");
  dot.style.backgroundColor = entry.categoryColor || "#8C8492";
  const label = document.createElement("span");
  label.textContent = entry.categoryName || "Sem categoria";
  tag.append(dot, label);
  return tag;
}

function incomeClassificationTag(entry) {
  if (entry.direction !== "income") return cellTag("Não se aplica", "not-applicable");
  return cellTag(entry.isSalary ? "Salário" : "Receita extra", entry.isSalary ? "salary" : "income");
}

function actionsFormatter(cell) {
  const entry = cell.getRow().getData();
  const actions = document.createElement("div");
  actions.className = "grid-row-actions";

  if (entry.direction !== "income") {
    actions.append(createActionButton({
      action: "edit",
      className: "grid-edit-button",
      icon: "edit",
      label: isClosed.value ? "Consultar lançamento" : "Editar status do lançamento",
    }));
  } else {
    actions.append(createActionButton({
      action: "classification",
      className: "grid-edit-button",
      icon: "wallet",
      label: isClosed.value ? "Consultar classificação" : "Classificar receita",
    }));
  }

  actions.append(createActionButton({
    action: "observation",
    className: `grid-observation-button${entry.observation ? " has-content" : ""}`,
    icon: "note",
    label: entry.observation ? "Abrir observação" : "Adicionar observação",
  }));

  if (!isClosed.value) {
    actions.append(createActionButton({ action: "delete", className: "grid-delete-button", icon: "trash", label: "Excluir lançamento" }));
  }

  return actions;
}

function createActionButton({ action, className, icon, label }) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  button.className = className;
  button.title = label;
  button.setAttribute("aria-label", label);
  render(h(AppIcon, { name: icon, size: 15 }), button);
  return button;
}

function handleActionClick(event, cell) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const entry = cell.getRow().getData();
  if (button.dataset.action === "edit") openEditor(entry);
  if (button.dataset.action === "observation") openObservation(entry);
  if (button.dataset.action === "classification") openClassification(entry);
  if (button.dataset.action === "delete" && !isClosed.value) requestDelete(entry);
}

function initialize(nextPayload) {
  applyPayload(nextPayload);
  rows.value = (nextPayload.month?.entries || []).map((entry) => ({
    ...entry,
    amount: Number(entry.amount || 0),
    classification: entry.direction === "income" ? (entry.isSalary ? "salary" : "extra_income") : "not_applicable",
  }));
  visibleRows.value = rows.value;
}

async function loadPage(monthKey = "", options = {}) {
  pageReady.value = false;
  await load(monthKey, options);
  if (payload.value) initialize(payload.value);
  pageReady.value = true;
}

async function changePageMonth(monthKey) {
  pageReady.value = false;
  await selectMonth(monthKey);
  if (payload.value) initialize(payload.value);
  pageReady.value = true;
}

async function includeFixedEntries() {
  saving.value = true;
  actionError.value = "";
  try {
    initialize(await initializeMonthEntries(selectedMonth.value));
    showNotice("Gastos fixos incluídos neste mês.");
  } catch (requestError) {
    actionError.value = requestError.message;
  } finally {
    saving.value = false;
  }
}

function openEditor(entry) {
  selectedEntry.value = entry;
  actionError.value = "";
  editOpen.value = true;
}

async function saveStatus(status) {
  if (!selectedEntry.value || status === selectedEntry.value.status || isClosed.value || saving.value) return;
  saving.value = true;
  actionError.value = "";
  try {
    const entry = selectedEntry.value;
    initialize(await updateEntry(entry.id, { amount: entry.amount, status, cycle: entry.cycle }));
    editOpen.value = false;
    showNotice("Status atualizado.");
  } catch (requestError) {
    actionError.value = requestError.message;
  } finally {
    saving.value = false;
  }
}

function openObservation(entry) {
  selectedEntry.value = entry;
  actionError.value = "";
  editOpen.value = false;
  observationOpen.value = true;
}

async function saveObservation(value) {
  saving.value = true;
  actionError.value = "";
  try {
    initialize(await updateEntryObservation(selectedEntry.value.id, value));
    observationOpen.value = false;
    showNotice("Observação atualizada.");
  } catch (requestError) {
    actionError.value = requestError.message;
  } finally {
    saving.value = false;
  }
}

function requestDelete(entry) {
  selectedEntry.value = entry;
  deleteOpen.value = true;
}

async function confirmDelete() {
  saving.value = true;
  actionError.value = "";
  try {
    initialize(await deleteEntry(selectedEntry.value.id));
    deleteOpen.value = false;
    showNotice("Lançamento excluído.");
  } catch (deleteError) {
    actionError.value = deleteError.message;
  } finally {
    saving.value = false;
  }
}

function openClassification(entry) {
  selectedEntry.value = entry;
  actionError.value = "";
  classificationOpen.value = true;
}

async function saveIncomeClassification(isSalary) {
  if (!selectedEntry.value || isClosed.value || saving.value) return;
  saving.value = true;
  actionError.value = "";
  try {
    initialize(await updateIncomeClassification(selectedEntry.value.id, isSalary));
    classificationOpen.value = false;
    showNotice(isSalary ? "Receita classificada como salário." : "Receita classificada como extra.");
  } catch (requestError) {
    actionError.value = requestError.message;
  } finally {
    saving.value = false;
  }
}

async function confirmDeleteMonthEntries(directions) {
  const deletedCount = directions.reduce((total, direction) => total + (direction === "income" ? incomeCount.value : expenseCount.value), 0);
  if (!deletedCount || isClosed.value || saving.value) return;
  saving.value = true;
  actionError.value = "";
  try {
    initialize(await deleteMonthEntries(selectedMonth.value, directions));
    deleteAllOpen.value = false;
    showNotice(`${deletedCount} ${deletedCount === 1 ? "lançamento excluído" : "lançamentos excluídos"}.`);
  } catch (deleteError) {
    actionError.value = deleteError.message;
  } finally {
    saving.value = false;
  }
}

function showNotice(message) {
  notice.value = message;
  window.setTimeout(() => { if (notice.value === message) notice.value = ""; }, 3000);
}

onMounted(() => loadPage("", { initial: true }));
listenPeriodChanges((nextPayload) => { if (nextPayload) initialize(nextPayload); });
</script>

<template>
  <div class="workspace-page">
    <div v-if="loading || !pageReady" class="workspace-loading"><span v-for="item in 4" :key="item"></span></div>
    <section v-else-if="error" class="dashboard-error"><AppIcon name="alert" /><div><h1>Não foi possível carregar os lançamentos.</h1><p>{{ error }}</p><button @click="loadPage('', { initial: true })">Tentar novamente</button></div></section>
    <template v-else>
      <MonthPageHeader eyebrow="Movimentação mensal" title="Lançamentos" description="Consulte os lançamentos, status e formas de pagamento do período." :payload="payload" :selected-month="selectedMonth" :refreshing="refreshing" @change-month="changePageMonth" />
      <section class="workspace-stats workspace-stats--three"><article><span><AppIcon name="entries" /></span><div><small>Movimentações exibidas</small><strong>{{ visibleRows.length }}</strong></div></article><article><span><AppIcon name="receipt" /></span><div><small>Gastos filtrados</small><strong>{{ formatCurrency(visibleExpenses) }}</strong></div></article><article><span><AppIcon name="income" /></span><div><small>Receitas filtradas</small><strong>{{ formatCurrency(visibleIncome) }}</strong></div></article></section>

      <section v-if="canInitializeFixed" class="month-initialize-banner"><div><strong>Este mês tem somente o salário.</strong><span>Os gastos fixos ainda não foram lançados neste período.</span></div><button type="button" :disabled="saving || isClosed" @click="includeFixedEntries">Incluir gastos fixos deste mês</button></section>

      <section class="workspace-panel entries-workspace">
        <div class="workspace-panel__heading">
          <div><h2>Lançamentos do mês</h2><p>{{ isClosed ? "Mês fechado para consulta." : "Lançamentos consolidados do período selecionado." }}</p></div>
          <button class="workspace-danger" type="button" :disabled="saving || isClosed || rows.length === 0" @click="deleteAllOpen = true">
            <AppIcon name="trash" :size="16" />
            Excluir lançamentos
          </button>
        </div>
        <p v-if="actionError" class="workspace-error" role="alert">{{ actionError }}</p>
        <DataGrid :rows="rows" :columns="columns" :options="gridOptions" :refresh-key="`${selectedMonth}:${isClosed}`" @data-filtered="visibleRows = $event" />
      </section>

      <div v-if="notice" class="templates-toast"><AppIcon name="check" />{{ notice }}</div>
      <EntryEditDialog :open="editOpen" :entry="selectedEntry" :saving="saving" :readonly="isClosed" :error="actionError" @close="editOpen = false" @save="saveStatus" @edit-observation="openObservation(selectedEntry)" />
      <EntryObservationDialog :open="observationOpen" :entry="selectedEntry" :saving="saving" :readonly="isClosed" :error="actionError" @close="observationOpen = false" @save="saveObservation" />
      <IncomeClassificationDialog :open="classificationOpen" :entry="selectedEntry" :saving="saving" :readonly="isClosed" :error="actionError" @close="classificationOpen = false" @save="saveIncomeClassification" />
      <ConfirmDialog :open="deleteOpen" title="Excluir lançamento?" :message="`O lançamento “${selectedEntry?.name || ''}” será removido apenas deste mês.`" confirm-label="Excluir lançamento" :busy="saving" @close="deleteOpen = false" @confirm="confirmDelete" />
      <DeleteMonthEntriesDialog :open="deleteAllOpen" :month-label="formatMonth(selectedMonth)" :expense-count="expenseCount" :income-count="incomeCount" :busy="saving" @close="deleteAllOpen = false" @confirm="confirmDeleteMonthEntries" />
    </template>
  </div>
</template>
