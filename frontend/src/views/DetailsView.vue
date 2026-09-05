<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import AppIcon from "../components/AppIcon.vue";
import MonthPageHeader from "../components/MonthPageHeader.vue";
import { useMonthlyBootstrap } from "../composables/useMonthlyBootstrap";
import { formatCurrency, formatMonth } from "../utils/formatters";

const { payload, entries, templates, loading, refreshing, error, selectedMonth, load, selectMonth, listenPeriodChanges } = useMonthlyBootstrap();
const search = ref("");
const sort = reactive({ key: "amount", direction: "desc" });

const templateMap = computed(() => Object.fromEntries(templates.value.map((template) => [template.id, template])));
const rows = computed(() => entries.value.map((entry) => ({
  ...entry,
  startMonth: templateMap.value[entry.templateId]?.startMonth || selectedMonth.value,
})));
const expenseRows = computed(() => rows.value.filter((entry) => entry.direction !== "income"));
const incomeRows = computed(() => rows.value.filter((entry) => entry.direction === "income"));
const filteredRows = computed(() => {
  const term = search.value.trim().toLocaleLowerCase("pt-BR");
  if (!term) return rows.value;
  return rows.value.filter((item) => [item.name, item.categoryName, item.paymentMethod, labelStatus(item.status), labelCycle(item.cycle)]
    .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term)));
});
const sortedRows = computed(() => {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...filteredRows.value].sort((left, right) => {
    const leftValue = sort.key === "amount" ? Number(left.amount || 0) : String(left[sort.key] || "").toLocaleLowerCase("pt-BR");
    const rightValue = sort.key === "amount" ? Number(right.amount || 0) : String(right[sort.key] || "").toLocaleLowerCase("pt-BR");
    return (leftValue > rightValue ? 1 : leftValue < rightValue ? -1 : 0) * direction;
  });
});
const total = computed(() => expenseRows.value.reduce((sum, item) => sum + Number(item.amount || 0), 0));
const incomeTotal = computed(() => incomeRows.value.reduce((sum, item) => sum + Number(item.amount || 0), 0));
const availableTotal = computed(() => Number(payload.value?.month?.summary?.available || 0));
const filteredTotal = computed(() => filteredRows.value.reduce((sum, item) => sum + (item.direction === "income" ? 1 : -1) * Number(item.amount || 0), 0));
const average = computed(() => expenseRows.value.length ? total.value / expenseRows.value.length : 0);
const pendingTotal = computed(() => expenseRows.value.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.amount || 0), 0));
const paidPercent = computed(() => total.value ? Math.round(((total.value - pendingTotal.value) / total.value) * 100) : 0);
const statusRows = computed(() => aggregate(expenseRows.value, "status", labelStatus));
const cycleRows = computed(() => aggregate(expenseRows.value, "cycle", labelCycle));
const paymentRows = computed(() => aggregate(expenseRows.value, "paymentMethod", (value) => value === "none" ? "Não informado" : value).slice(0, 5));
const categoryRows = computed(() => aggregate(expenseRows.value, "categoryName", (value) => value === "none" ? "Sem categoria" : value).slice(0, 7));
const flowRows = computed(() => {
  const base = Math.max(availableTotal.value, total.value, 1);
  return [
    { key: "income", label: "Receitas disponíveis", amount: availableTotal.value, count: incomeRows.value.length, percent: Math.round((availableTotal.value / base) * 100) },
    { key: "expense", label: "Gastos previstos", amount: total.value, count: expenseRows.value.length, percent: Math.round((total.value / base) * 100) },
  ];
});

function labelStatus(status) { return { pending: "Pendente", paid: "Pago", saved: "Guardado" }[status] || status; }
function labelCycle(cycle) { return cycle === "Inicio Do Mes" ? "Início do mês" : cycle; }
function statusTone(status) { return status === "pending" ? "warning" : status === "paid" ? "success" : "violet"; }
function typeLabel(item) { return item.isVariable ? "Variável" : "Fixo"; }

function aggregate(items, key, labeler) {
  const grouped = new Map();
  items.forEach((item) => {
    const value = item[key] || "none";
    const row = grouped.get(value) || { key: value, label: labeler(value), amount: 0, count: 0 };
    row.amount += Number(item.amount || 0);
    row.count += 1;
    grouped.set(value, row);
  });
  return [...grouped.values()]
    .sort((left, right) => right.amount - left.amount)
    .map((row) => ({ ...row, percent: total.value ? Math.round((row.amount / total.value) * 100) : 0 }));
}

function setSort(key) {
  if (sort.key === key) sort.direction = sort.direction === "asc" ? "desc" : "asc";
  else Object.assign(sort, { key, direction: "asc" });
}

function sortIcon(key) {
  if (sort.key !== key) return "↕";
  return sort.direction === "asc" ? "↑" : "↓";
}
function directionLabel(item) { return item.direction === "income" ? "Receita" : "Gasto"; }
function sourceLabel(value) { return ({ ofx: "OFX", fixed: "Gasto fixo", manual: "Manual" }[value] || "Manual"); }
function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

onMounted(() => load("", { initial: true }));
listenPeriodChanges();
</script>

<template>
  <div class="workspace-page">
    <div v-if="loading" class="workspace-loading"><span v-for="item in 4" :key="item"></span></div>
    <section v-else-if="error" class="dashboard-error">
      <AppIcon name="alert" />
      <div><h1>Não foi possível carregar os detalhes.</h1><p>{{ error }}</p><button @click="load('', { initial: true })">Tentar novamente</button></div>
    </section>
    <template v-else>
      <MonthPageHeader eyebrow="Análise financeira" title="Detalhes" description="Entenda para onde o dinheiro está indo e acompanhe a composição do mês." :payload="payload" :selected-month="selectedMonth" :refreshing="refreshing" @change-month="selectMonth" />

      <section class="workspace-stats">
        <article><span><AppIcon name="receipt" /></span><div><small>Gastos</small><strong>{{ formatCurrency(total) }}</strong></div></article>
        <article><span><AppIcon name="income" /></span><div><small>Receitas extras</small><strong>{{ formatCurrency(incomeTotal) }}</strong></div></article>
        <article><span><AppIcon name="clock" /></span><div><small>Pendente</small><strong>{{ formatCurrency(pendingTotal) }}</strong></div></article>
        <article><span><AppIcon name="trending" /></span><div><small>Ticket médio</small><strong>{{ formatCurrency(average) }}</strong></div></article>
      </section>

      <section class="reports-grid">
        <article class="workspace-panel report-bars">
          <div class="workspace-panel__heading"><div><p class="dashboard-eyebrow">Fluxo</p><h2>Receitas versus gastos</h2></div></div>
          <div v-for="row in flowRows" :key="row.key" class="report-row">
            <div><strong>{{ row.label }}</strong><span>{{ row.count }} movimentação(ões)</span></div>
            <span class="report-bar" :class="row.key === 'expense' ? 'report-bar--rose' : ''"><i :style="{ width: `${row.percent}%` }"></i></span>
            <footer><small>{{ row.percent }}%</small><b>{{ formatCurrency(row.amount) }}</b></footer>
          </div>
        </article>
        <article class="workspace-panel report-highlight">
          <div class="workspace-panel__heading">
            <div><p class="dashboard-eyebrow">Progresso</p><h2>Organização do mês</h2></div>
            <span class="panel-badge">{{ paidPercent }}% concluído</span>
          </div>
          <div class="report-ring" :style="{ '--progress': `${paidPercent * 3.6}deg` }"><div><strong>{{ paidPercent }}%</strong><span>organizado</span></div></div>
          <div class="report-highlight__values">
            <span><small>Total previsto</small><strong>{{ formatCurrency(total) }}</strong></span>
            <span><small>Ainda pendente</small><strong>{{ formatCurrency(pendingTotal) }}</strong></span>
          </div>
        </article>
        <article class="workspace-panel report-bars">
          <div class="workspace-panel__heading"><div><p class="dashboard-eyebrow">Situação</p><h2>Distribuição por status</h2></div></div>
          <div v-for="row in statusRows" :key="row.key" class="report-row">
            <div><strong>{{ row.label }}</strong><span>{{ row.count }} item(ns)</span></div>
            <span class="report-bar"><i :style="{ width: `${row.percent}%` }"></i></span>
            <footer><small>{{ row.percent }}%</small><b>{{ formatCurrency(row.amount) }}</b></footer>
          </div>
        </article>
        <article class="workspace-panel report-bars">
          <div class="workspace-panel__heading"><div><p class="dashboard-eyebrow">Planejamento</p><h2>Distribuição por ciclo</h2></div></div>
          <div v-for="row in cycleRows" :key="row.key" class="report-row">
            <div><strong>{{ row.label }}</strong><span>{{ row.count }} item(ns)</span></div>
            <span class="report-bar report-bar--rose"><i :style="{ width: `${row.percent}%` }"></i></span>
            <footer><small>{{ row.percent }}%</small><b>{{ formatCurrency(row.amount) }}</b></footer>
          </div>
        </article>
        <article class="workspace-panel report-bars">
          <div class="workspace-panel__heading"><div><p class="dashboard-eyebrow">Pagamento</p><h2>Formas mais utilizadas</h2></div></div>
          <div v-for="row in paymentRows" :key="row.key" class="report-row">
            <div><strong>{{ row.label }}</strong><span>{{ row.count }} item(ns)</span></div>
            <span class="report-bar report-bar--soft"><i :style="{ width: `${row.percent}%` }"></i></span>
            <footer><small>{{ row.percent }}%</small><b>{{ formatCurrency(row.amount) }}</b></footer>
          </div>
        </article>
        <article class="workspace-panel report-bars">
          <div class="workspace-panel__heading"><div><p class="dashboard-eyebrow">Categorias</p><h2>Para onde foi o dinheiro</h2></div></div>
          <div v-for="row in categoryRows" :key="row.key" class="report-row">
            <div><strong>{{ row.label }}</strong><span>{{ row.count }} item(ns)</span></div>
            <span class="report-bar report-bar--category"><i :style="{ width: `${row.percent}%` }"></i></span>
            <footer><small>{{ row.percent }}%</small><b>{{ formatCurrency(row.amount) }}</b></footer>
          </div>
        </article>
      </section>

      <section class="workspace-panel details-list">
        <div class="workspace-panel__heading">
          <div><h2>Composição do mês</h2><p>{{ filteredRows.length }} de {{ rows.length }} lançamento(s) em {{ formatMonth(selectedMonth) }}.</p></div>
          <strong class="details-filter-total">{{ formatCurrency(filteredTotal) }}</strong>
        </div>

        <div class="entries-table-toolbar">
          <label class="templates-search">
            <AppIcon name="search" :size="18" />
            <input v-model="search" type="search" placeholder="Buscar por lançamento, categoria, ciclo, status ou pagamento" />
            <span class="sr-only">Buscar detalhes</span>
          </label>
        </div>

        <div v-if="sortedRows.length" class="dynamic-table-wrap">
          <table class="dynamic-table details-dynamic-table">
            <thead>
              <tr>
                <th><button type="button" @click="setSort('name')">Lançamento <span>{{ sortIcon("name") }}</span></button></th>
                <th><button type="button" @click="setSort('amount')">Valor <span>{{ sortIcon("amount") }}</span></button></th>
                <th>Data</th>
                <th>Movimento</th>
                <th>Categoria</th>
                <th><button type="button" @click="setSort('status')">Status <span>{{ sortIcon("status") }}</span></button></th>
                <th><button type="button" @click="setSort('cycle')">Ciclo <span>{{ sortIcon("cycle") }}</span></button></th>
                <th>Tipo</th>
                <th>Pagamento</th>
                <th>Origem</th>
                <th><button type="button" @click="setSort('startMonth')">Válido desde <span>{{ sortIcon("startMonth") }}</span></button></th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in sortedRows" :key="item.id">
                <td data-label="Lançamento"><div class="dynamic-table__identity"><span><AppIcon name="receipt" :size="17" /></span><div><strong>{{ item.name }}</strong><small>{{ item.paymentMethod || "Pagamento não informado" }}</small></div></div></td>
                <td data-label="Valor"><strong>{{ formatCurrency(item.amount) }}</strong></td>
                <td data-label="Data">{{ formatDate(item.transactionDate) }}</td>
                <td data-label="Movimento"><span class="template-type" :class="item.direction === 'income' ? 'template-type--fixed' : 'template-type--variable'">{{ directionLabel(item) }}</span></td>
                <td data-label="Categoria"><span class="category-inline"><i :style="{ backgroundColor: item.categoryColor }"></i>{{ item.categoryName }}</span></td>
                <td data-label="Status"><span class="status-chip" :class="`status-chip--${statusTone(item.status)}`">{{ item.direction === "income" && item.status === "paid" ? "Recebido" : labelStatus(item.status) }}</span></td>
                <td data-label="Ciclo">{{ labelCycle(item.cycle) }}</td>
                <td data-label="Tipo"><span class="template-type" :class="item.isVariable ? 'template-type--variable' : 'template-type--fixed'">{{ typeLabel(item) }}</span></td>
                <td data-label="Pagamento">{{ item.paymentMethod || "Não informado" }}</td>
                <td data-label="Origem">{{ sourceLabel(item.sourceType) }}</td>
                <td data-label="Válido desde">{{ formatMonth(item.startMonth) }}</td>
                <td data-label="Observação"><span class="table-note" :title="item.observation">{{ item.observation || "Sem observação" }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="workspace-empty">
          <AppIcon name="details" :size="34" />
          <h3>{{ rows.length ? "Nenhum lançamento encontrado." : "Nenhum lançamento salvo." }}</h3>
          <p>{{ rows.length ? "Ajuste a busca para visualizar outros resultados." : "Os relatórios aparecem quando houver movimentações no mês." }}</p>
        </div>
      </section>
    </template>
  </div>
</template>
