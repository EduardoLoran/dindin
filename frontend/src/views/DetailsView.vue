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
const filteredRows = computed(() => {
  const term = search.value.trim().toLocaleLowerCase("pt-BR");
  if (!term) return rows.value;
  return rows.value.filter((item) => [item.name, item.paymentMethod, labelStatus(item.status), labelCycle(item.cycle)]
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
const total = computed(() => rows.value.reduce((sum, item) => sum + Number(item.amount || 0), 0));
const filteredTotal = computed(() => filteredRows.value.reduce((sum, item) => sum + Number(item.amount || 0), 0));
const average = computed(() => rows.value.length ? total.value / rows.value.length : 0);
const pendingTotal = computed(() => rows.value.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.amount || 0), 0));
const paidPercent = computed(() => total.value ? Math.round(((total.value - pendingTotal.value) / total.value) * 100) : 0);
const statusRows = computed(() => aggregate("status", labelStatus));
const cycleRows = computed(() => aggregate("cycle", labelCycle));
const paymentRows = computed(() => aggregate("paymentMethod", (value) => value === "none" ? "Não informado" : value).slice(0, 5));

function labelStatus(status) { return { pending: "Pendente", paid: "Pago", saved: "Guardado" }[status] || status; }
function labelCycle(cycle) { return cycle === "Inicio Do Mes" ? "Início do mês" : cycle; }
function statusTone(status) { return status === "pending" ? "warning" : status === "paid" ? "success" : "violet"; }
function typeLabel(item) { return item.isVariable ? "Variável" : "Fixo"; }

function aggregate(key, labeler) {
  const grouped = new Map();
  rows.value.forEach((item) => {
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
        <article><span><AppIcon name="receipt" /></span><div><small>Lançamentos</small><strong>{{ rows.length }}</strong></div></article>
        <article><span><AppIcon name="wallet" /></span><div><small>Total do mês</small><strong>{{ formatCurrency(total) }}</strong></div></article>
        <article><span><AppIcon name="clock" /></span><div><small>Pendente</small><strong>{{ formatCurrency(pendingTotal) }}</strong></div></article>
        <article><span><AppIcon name="trending" /></span><div><small>Ticket médio</small><strong>{{ formatCurrency(average) }}</strong></div></article>
      </section>

      <section class="reports-grid">
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
      </section>

      <section class="workspace-panel details-list">
        <div class="workspace-panel__heading">
          <div><h2>Composição do mês</h2><p>{{ filteredRows.length }} de {{ rows.length }} lançamento(s) em {{ formatMonth(selectedMonth) }}.</p></div>
          <strong class="details-filter-total">{{ formatCurrency(filteredTotal) }}</strong>
        </div>

        <div class="entries-table-toolbar">
          <label class="templates-search">
            <AppIcon name="search" :size="18" />
            <input v-model="search" type="search" placeholder="Buscar por lançamento, ciclo, status ou pagamento" />
            <span class="sr-only">Buscar detalhes</span>
          </label>
        </div>

        <div v-if="sortedRows.length" class="dynamic-table-wrap">
          <table class="dynamic-table details-dynamic-table">
            <thead>
              <tr>
                <th><button type="button" @click="setSort('name')">Lançamento <span>{{ sortIcon("name") }}</span></button></th>
                <th><button type="button" @click="setSort('amount')">Valor <span>{{ sortIcon("amount") }}</span></button></th>
                <th><button type="button" @click="setSort('status')">Status <span>{{ sortIcon("status") }}</span></button></th>
                <th><button type="button" @click="setSort('cycle')">Ciclo <span>{{ sortIcon("cycle") }}</span></button></th>
                <th>Tipo</th>
                <th>Pagamento</th>
                <th><button type="button" @click="setSort('startMonth')">Válido desde <span>{{ sortIcon("startMonth") }}</span></button></th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in sortedRows" :key="item.id">
                <td data-label="Lançamento"><div class="dynamic-table__identity"><span><AppIcon name="receipt" :size="17" /></span><div><strong>{{ item.name }}</strong><small>{{ item.paymentMethod || "Pagamento não informado" }}</small></div></div></td>
                <td data-label="Valor"><strong>{{ formatCurrency(item.amount) }}</strong></td>
                <td data-label="Status"><span class="status-chip" :class="`status-chip--${statusTone(item.status)}`">{{ labelStatus(item.status) }}</span></td>
                <td data-label="Ciclo">{{ labelCycle(item.cycle) }}</td>
                <td data-label="Tipo"><span class="template-type" :class="item.isVariable ? 'template-type--variable' : 'template-type--fixed'">{{ typeLabel(item) }}</span></td>
                <td data-label="Pagamento">{{ item.paymentMethod || "Não informado" }}</td>
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
