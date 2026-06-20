<script setup>
import { computed, onMounted } from "vue";
import AppIcon from "../components/AppIcon.vue";
import MonthPageHeader from "../components/MonthPageHeader.vue";
import { useMonthlyBootstrap } from "../composables/useMonthlyBootstrap";
import { formatCurrency, formatMonth } from "../utils/formatters";

const { payload, entries, templates, loading, refreshing, error, selectedMonth, load, selectMonth } = useMonthlyBootstrap();
const templateMap = computed(() => Object.fromEntries(templates.value.map((template) => [template.id, template])));
const cards = computed(() => entries.value.map((entry) => ({ ...entry, startMonth: templateMap.value[entry.templateId]?.startMonth || selectedMonth.value })));
const total = computed(() => cards.value.reduce((sum, item) => sum + Number(item.amount || 0), 0));
const average = computed(() => cards.value.length ? total.value / cards.value.length : 0);

function labelStatus(status) { return { pending: "Pendente", paid: "Pago", saved: "Guardado" }[status] || status; }
function labelCycle(cycle) { return cycle === "Inicio Do Mes" ? "Início do mês" : cycle; }
function aggregate(key, labeler) {
  const grouped = new Map();
  cards.value.forEach((item) => {
    const value = item[key] || "none";
    const row = grouped.get(value) || { key: value, label: labeler(value), amount: 0, count: 0 };
    row.amount += Number(item.amount || 0); row.count += 1; grouped.set(value, row);
  });
  return [...grouped.values()].sort((a, b) => b.amount - a.amount).map((row) => ({ ...row, percent: total.value ? Math.round((row.amount / total.value) * 100) : 0 }));
}
const statusRows = computed(() => aggregate("status", labelStatus));
const cycleRows = computed(() => aggregate("cycle", labelCycle));
const paymentRows = computed(() => aggregate("paymentMethod", (value) => value === "none" ? "Não informado" : value).slice(0, 5));
const pendingTotal = computed(() => cards.value.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.amount || 0), 0));
const paidPercent = computed(() => total.value ? Math.round(((total.value - pendingTotal.value) / total.value) * 100) : 0);

onMounted(() => load("", { initial: true }));
</script>

<template><div class="workspace-page">
  <div v-if="loading" class="workspace-loading"><span v-for="item in 4" :key="item"></span></div>
  <section v-else-if="error" class="dashboard-error"><AppIcon name="alert" /><div><h1>Não foi possível carregar os detalhes.</h1><p>{{ error }}</p><button @click="load('', { initial: true })">Tentar novamente</button></div></section>
  <template v-else>
    <MonthPageHeader eyebrow="Análise financeira" title="Detalhes" description="Entenda para onde o dinheiro está indo e acompanhe a composição do mês." :payload="payload" :selected-month="selectedMonth" :refreshing="refreshing" @change-month="selectMonth" />
    <section class="workspace-stats"><article><span><AppIcon name="receipt" /></span><div><small>Lançamentos</small><strong>{{ cards.length }}</strong></div></article><article><span><AppIcon name="wallet" /></span><div><small>Total do mês</small><strong>{{ formatCurrency(total) }}</strong></div></article><article><span><AppIcon name="clock" /></span><div><small>Pendente</small><strong>{{ formatCurrency(pendingTotal) }}</strong></div></article><article><span><AppIcon name="trending" /></span><div><small>Ticket médio</small><strong>{{ formatCurrency(average) }}</strong></div></article></section>
    <section v-if="cards.length" class="reports-grid">
      <article class="workspace-panel report-highlight"><div class="workspace-panel__heading"><div><p class="dashboard-eyebrow">Progresso</p><h2>Organização do mês</h2></div><span class="panel-badge">{{ paidPercent }}% concluído</span></div><div class="report-ring" :style="{ '--progress': `${paidPercent * 3.6}deg` }"><div><strong>{{ paidPercent }}%</strong><span>organizado</span></div></div><div class="report-highlight__values"><span><small>Total previsto</small><strong>{{ formatCurrency(total) }}</strong></span><span><small>Ainda pendente</small><strong>{{ formatCurrency(pendingTotal) }}</strong></span></div></article>
      <article class="workspace-panel report-bars"><div class="workspace-panel__heading"><div><p class="dashboard-eyebrow">Situação</p><h2>Distribuição por status</h2></div></div><div v-for="row in statusRows" :key="row.key" class="report-row"><div><strong>{{ row.label }}</strong><span>{{ row.count }} item(ns)</span></div><span class="report-bar"><i :style="{ width: `${row.percent}%` }"></i></span><footer><small>{{ row.percent }}%</small><b>{{ formatCurrency(row.amount) }}</b></footer></div></article>
      <article class="workspace-panel report-bars"><div class="workspace-panel__heading"><div><p class="dashboard-eyebrow">Planejamento</p><h2>Distribuição por ciclo</h2></div></div><div v-for="row in cycleRows" :key="row.key" class="report-row"><div><strong>{{ row.label }}</strong><span>{{ row.count }} item(ns)</span></div><span class="report-bar report-bar--rose"><i :style="{ width: `${row.percent}%` }"></i></span><footer><small>{{ row.percent }}%</small><b>{{ formatCurrency(row.amount) }}</b></footer></div></article>
      <article class="workspace-panel report-bars"><div class="workspace-panel__heading"><div><p class="dashboard-eyebrow">Pagamento</p><h2>Formas mais utilizadas</h2></div></div><div v-for="row in paymentRows" :key="row.key" class="report-row"><div><strong>{{ row.label }}</strong><span>{{ row.count }} item(ns)</span></div><span class="report-bar report-bar--soft"><i :style="{ width: `${row.percent}%` }"></i></span><footer><small>{{ row.percent }}%</small><b>{{ formatCurrency(row.amount) }}</b></footer></div></article>
    </section>
    <section class="workspace-panel details-list"><div class="workspace-panel__heading"><div><h2>Composição do mês</h2><p>Todos os valores salvos em {{ formatMonth(selectedMonth) }}.</p></div></div><div v-if="cards.length" class="details-card-grid"><article v-for="item in cards" :key="item.id" class="detail-modern-card"><header><div><span class="template-type" :class="item.isVariable ? 'template-type--variable' : 'template-type--fixed'">{{ item.isVariable ? "Variável" : "Fixo" }}</span><h3>{{ item.name }}</h3></div><strong>{{ formatCurrency(item.amount) }}</strong></header><dl><div><dt>Status</dt><dd><span class="status-chip" :class="`status-chip--${item.status === 'pending' ? 'warning' : item.status === 'paid' ? 'success' : 'violet'}`">{{ labelStatus(item.status) }}</span></dd></div><div><dt>Ciclo</dt><dd>{{ labelCycle(item.cycle) }}</dd></div><div><dt>Pagamento</dt><dd>{{ item.paymentMethod || "Não informado" }}</dd></div><div><dt>Válido desde</dt><dd>{{ formatMonth(item.startMonth) }}</dd></div></dl><p v-if="item.observation"><AppIcon name="note" :size="15" />{{ item.observation }}</p></article></div><div v-else class="workspace-empty"><AppIcon name="details" :size="34" /><h3>Nenhum lançamento salvo.</h3><p>Os relatórios aparecem quando houver movimentações no mês.</p></div></section>
  </template>
</div></template>
