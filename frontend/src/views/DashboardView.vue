<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import SalaryDialog from "../components/SalaryDialog.vue";
import SummaryCard from "../components/SummaryCard.vue";
import { closeMonth, createMonth, getDashboard, reopenMonth, updateSalary } from "../api/dashboard";
import { useGlobalPeriod } from "../composables/useGlobalPeriod";
import { useSession } from "../composables/useSession";
import { formatCompactDate, formatCurrency, formatMonth } from "../utils/formatters";

const router = useRouter();
const { user } = useSession();
const { selectedMonth, setSelectedMonth } = useGlobalPeriod();
const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const dashboard = ref(null);
const salaryDialogOpen = ref(false);
const savingSalary = ref(false);
const salaryError = ref("");
const salaryMode = ref("edit");
const monthStateConfirmOpen = ref(false);

const month = computed(() => dashboard.value?.month || null);
const summary = computed(() => month.value?.summary || {
  salary: 0, salaryReceived: 0, extraIncome: 0, available: 0, total: 0, paid: 0, pending: 0, balance: 0, monthStartProjection: 0, quinzenaProjection: 0,
});
const entries = computed(() => month.value?.entries || []);
const monthLabel = computed(() => formatMonth(selectedMonth.value || dashboard.value?.activeMonth));
const suggestedMonth = computed(() => nextAvailableMonth(selectedMonth.value || dashboard.value?.activeMonth));
const firstName = computed(() => String(user.value?.displayName || user.value?.username || "").trim().split(/\s+/)[0]);
const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
});

const summaryCards = computed(() => [
  { label: "Salário", value: formatCurrency(summary.value.salary), meta: "Base disponível no mês", icon: "wallet", tone: "primary" },
  { label: "Receitas extras", value: formatCurrency(summary.value.extraIncome), meta: "Entradas importadas", icon: "income", tone: "success" },
  { label: "Total disponível", value: formatCurrency(summary.value.available), meta: "Salário e outras receitas", icon: "trending", tone: "violet" },
  { label: "Gastos previstos", value: formatCurrency(summary.value.total), meta: `${expenses.value.length} gasto(s) no período`, icon: "receipt", tone: "warning" },
  { label: "Pendente", value: formatCurrency(summary.value.pending), meta: "Compromissos em aberto", icon: "clock", tone: "warning" },
  { label: "Saldo projetado", value: formatCurrency(summary.value.balance), meta: "Receitas menos gastos", icon: "trending", tone: summary.value.balance >= 0 ? "balance" : "danger" },
]);

const expenses = computed(() => entries.value.filter((entry) => entry.direction !== "income"));

const budgetPercent = computed(() => {
  if (summary.value.available <= 0) return 0;
  return Math.min(100, Math.round((summary.value.total / summary.value.available) * 100));
});
const paidPercent = computed(() => {
  if (summary.value.total <= 0) return 0;
  return Math.min(100, Math.round((summary.value.paid / summary.value.total) * 100));
});
const cycleTotal = computed(() => summary.value.monthStartProjection + summary.value.quinzenaProjection);
const monthStartPercent = computed(() => cycleTotal.value > 0 ? Math.round((summary.value.monthStartProjection / cycleTotal.value) * 100) : 0);
const fortnightPercent = computed(() => cycleTotal.value > 0 ? 100 - monthStartPercent.value : 0);

const recentEntries = computed(() => [...entries.value]
  .sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (b.status === "pending" && a.status !== "pending") return 1;
    return Number(b.amount) - Number(a.amount);
  })
  .slice(0, 6));

function statusLabel(status, direction = "expense") {
  if (direction === "income" && status === "paid") return "Recebido";
  return { pending: "Pendente", paid: "Pago", saved: "Guardado" }[status] || status;
}

function statusTone(status) {
  return { pending: "warning", paid: "success", saved: "violet" }[status] || "neutral";
}

async function loadDashboard(monthKey = "", { initial = false } = {}) {
  if (initial) loading.value = true;
  else refreshing.value = true;
  error.value = "";

  try {
    let payload = await getDashboard(monthKey || selectedMonth.value);
    if (initial) {
      const latestMonth = payload.months?.[0]?.monthKey;
      if (!selectedMonth.value && latestMonth && latestMonth !== payload.activeMonth) payload = await getDashboard(latestMonth);
    }
    dashboard.value = payload;
    setSelectedMonth(payload.activeMonth);
  } catch (loadError) {
    if (loadError.status === 401) {
      await router.replace({ name: "login" });
      return;
    }
    error.value = loadError.message;
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function changeMonth(nextMonth) {
  if (nextMonth && nextMonth !== selectedMonth.value) await loadDashboard(nextMonth);
}

function openSalary(mode) {
  salaryMode.value = mode;
  salaryError.value = "";
  salaryDialogOpen.value = true;
}

function requestMonthStateChange() {
  salaryDialogOpen.value = false;
  monthStateConfirmOpen.value = true;
}

async function saveSalary(form) {
  salaryError.value = "";
  savingSalary.value = true;
  try {
    dashboard.value = salaryMode.value === "create"
      ? await createMonth(form)
      : await updateSalary(selectedMonth.value, form.salary);
    setSelectedMonth(dashboard.value.activeMonth);
    salaryDialogOpen.value = false;
  } catch (saveError) {
    salaryError.value = saveError.message;
  } finally {
    savingSalary.value = false;
  }
}

async function confirmMonthStateChange() {
  savingSalary.value = true;
  salaryError.value = "";
  try {
    dashboard.value = month.value?.isClosed
      ? await reopenMonth(selectedMonth.value)
      : await closeMonth(selectedMonth.value);
    monthStateConfirmOpen.value = false;
  } catch (stateError) {
    salaryError.value = stateError.message;
  } finally {
    savingSalary.value = false;
  }
}

function nextAvailableMonth(baseMonth) {
  const [year, monthNumber] = String(baseMonth || new Date().toISOString().slice(0, 7)).split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 1));
  const candidate = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return dashboard.value?.months?.some((item) => item.monthKey === candidate)
    ? nextAvailableMonth(candidate)
    : candidate;
}

onMounted(() => loadDashboard("", { initial: true }));

async function handleGlobalPeriodChange(event) {
  const monthKey = event.detail?.monthKey;
  if (monthKey && monthKey !== dashboard.value?.activeMonth) await loadDashboard(monthKey);
}

onMounted(() => window.addEventListener("dindin-period-change", handleGlobalPeriodChange));
onBeforeUnmount(() => window.removeEventListener("dindin-period-change", handleGlobalPeriodChange));
</script>

<template>
  <div class="dashboard-page">
    <div v-if="loading" class="dashboard-loading" aria-live="polite">
      <div class="dashboard-loading__head"></div>
      <div class="dashboard-loading__cards"><span v-for="item in 5" :key="item"></span></div>
      <div class="dashboard-loading__panels"><span></span><span></span></div>
    </div>

    <section v-else-if="error" class="dashboard-error" role="alert">
      <span><AppIcon name="alert" :size="28" /></span>
      <div><h1>Não foi possível carregar sua visão geral.</h1><p>{{ error }}</p><button type="button" @click="loadDashboard('', { initial: true })">Tentar novamente</button></div>
    </section>

    <template v-else>
      <header class="dashboard-hero">
        <div>
          <p class="dashboard-eyebrow">{{ greeting }}, {{ firstName }}</p>
          <h1>Seu dinheiro em uma visão simples.</h1>
          <p>Acompanhe o mês, priorize pendências e tome decisões com tranquilidade.</p>
        </div>
      </header>

      <div v-if="refreshing" class="dashboard-refreshing" role="status"><span></span>Atualizando período...</div>

      <section class="dashboard-summary" aria-label="Resumo financeiro">
        <SummaryCard v-for="card in summaryCards" :key="card.label" v-bind="card" />
      </section>

      <section class="dashboard-grid dashboard-grid--insights">
        <article class="dashboard-panel budget-panel">
          <div class="panel-heading"><div><p class="dashboard-eyebrow">Planejamento</p><h2>Saúde do orçamento</h2></div><div class="panel-heading__actions"><button class="panel-action" type="button" @click="openSalary('create')"><AppIcon name="plus" :size="16" />Novo salário</button><button class="panel-action" type="button" :disabled="!month?.salaryDefined" @click="openSalary('edit')"><AppIcon name="edit" :size="16" />Editar salário</button></div></div>
          <div class="budget-panel__content">
            <div class="budget-ring" :style="{ '--budget-progress': `${budgetPercent * 3.6}deg` }"><div><strong>{{ budgetPercent }}%</strong><span>comprometido</span></div></div>
            <div class="budget-metrics">
              <div><span><i class="metric-dot metric-dot--primary"></i>Orçamento utilizado</span><strong>{{ formatCurrency(summary.total) }}</strong></div>
              <div><span><i class="metric-dot metric-dot--success"></i>Disponível projetado</span><strong :class="{ 'text-danger': summary.balance < 0 }">{{ formatCurrency(summary.balance) }}</strong></div>
              <div class="budget-progress"><span><i :style="{ width: `${budgetPercent}%` }"></i></span><small>{{ budgetPercent < 80 ? "Seu orçamento está sob controle." : "Atenção ao nível de comprometimento." }}</small></div>
            </div>
          </div>
        </article>

        <article class="dashboard-panel progress-panel">
          <div class="panel-heading"><div><p class="dashboard-eyebrow">Andamento</p><h2>Organização do mês</h2></div><span class="panel-badge">{{ paidPercent }}% concluído</span></div>
          <div class="progress-overview"><div class="progress-overview__bar"><i :style="{ width: `${paidPercent}%` }"></i></div><div><strong>{{ formatCurrency(summary.paid) }}</strong><span>de {{ formatCurrency(summary.total) }}</span></div></div>
          <div class="cycle-list">
            <div><div><span>Início do mês</span><strong>{{ formatCurrency(summary.monthStartProjection) }}</strong></div><span class="cycle-bar"><i :style="{ width: `${monthStartPercent}%` }"></i></span></div>
            <div><div><span>Quinzena</span><strong>{{ formatCurrency(summary.quinzenaProjection) }}</strong></div><span class="cycle-bar cycle-bar--rose"><i :style="{ width: `${fortnightPercent}%` }"></i></span></div>
          </div>
        </article>
      </section>

      <section class="dashboard-grid dashboard-grid--activity">
        <article class="dashboard-panel entries-panel">
          <div class="panel-heading"><div><p class="dashboard-eyebrow">Atividade</p><h2>Lançamentos em destaque</h2></div><RouterLink to="/lancamentos">Ver lançamentos <AppIcon name="arrow-right" :size="16" /></RouterLink></div>
          <div v-if="recentEntries.length" class="dashboard-table-wrap"><table class="dashboard-table"><thead><tr><th>Descrição</th><th>Tipo</th><th>Status</th><th>Valor</th></tr></thead><tbody><tr v-for="entry in recentEntries" :key="entry.id"><td><span class="entry-icon"><AppIcon :name="entry.direction === 'income' ? 'income' : 'receipt'" :size="17" /></span><div><strong>{{ entry.name }}</strong><small>{{ entry.paymentMethod || "Não informado" }}</small></div></td><td>{{ entry.direction === "income" ? "Receita" : "Gasto" }}</td><td><span class="status-chip" :class="`status-chip--${statusTone(entry.status)}`">{{ statusLabel(entry.status, entry.direction) }}</span></td><td>{{ formatCurrency(entry.amount) }}</td></tr></tbody></table></div>
          <div v-else class="dashboard-empty"><span><AppIcon name="receipt" :size="28" /></span><h3>Nenhum lançamento neste mês.</h3><p>Use seus cadastros para começar a planejar.</p><RouterLink to="/cadastros">Abrir cadastros</RouterLink></div>
        </article>

        <aside class="dashboard-side-stack">
          <article class="dashboard-panel quick-panel"><div class="panel-heading"><div><p class="dashboard-eyebrow">Atalhos</p><h2>Acesso rápido</h2></div></div><RouterLink to="/cadastros"><span><AppIcon name="templates" /></span><div><strong>Novo cadastro</strong><small>Organize um gasto recorrente</small></div><AppIcon name="arrow-right" :size="16" /></RouterLink><RouterLink to="/lancamentos"><span><AppIcon name="entries" /></span><div><strong>Revisar lançamentos</strong><small>Atualize valores e status</small></div><AppIcon name="arrow-right" :size="16" /></RouterLink><RouterLink to="/detalhes"><span><AppIcon name="details" /></span><div><strong>Explorar detalhes</strong><small>Analise a composição do mês</small></div><AppIcon name="arrow-right" :size="16" /></RouterLink></article>
          <article class="dashboard-panel history-panel"><div class="panel-heading"><div><p class="dashboard-eyebrow">Histórico</p><h2>Meses recentes</h2></div></div><div v-if="dashboard?.months?.length" class="history-list"><button v-for="savedMonth in dashboard.months.slice(0, 3)" :key="savedMonth.monthKey" type="button" :class="{ 'is-active': savedMonth.monthKey === selectedMonth }" @click="changeMonth(savedMonth.monthKey)"><span><strong>{{ formatMonth(savedMonth.monthKey) }} <em v-if="savedMonth.isClosed">Fechado</em></strong><small>Criado em {{ formatCompactDate(savedMonth.createdAt) }}</small></span><b>{{ formatCurrency(savedMonth.salary) }}</b></button></div><p v-else class="history-empty">O histórico aparecerá quando você salvar seu primeiro mês.</p></article>
        </aside>
      </section>

      <SalaryDialog :open="salaryDialogOpen" :mode="salaryMode" :current-value="summary.salary" :month-key="selectedMonth" :suggested-month="suggestedMonth" :is-closed="month?.isClosed" :saving="savingSalary" :error="salaryError" @close="salaryDialogOpen = false" @save="saveSalary" @request-close-month="requestMonthStateChange" @request-reopen-month="requestMonthStateChange" />
      <ConfirmDialog :open="monthStateConfirmOpen" :title="month?.isClosed ? 'Reabrir mês?' : 'Fechar mês?'" :message="month?.isClosed ? 'O período voltará a aceitar alterações de salário e lançamentos.' : 'O salário, os lançamentos e as operações que afetam este período ficarão somente para consulta.'" :confirm-label="month?.isClosed ? 'Reabrir mês' : 'Fechar mês'" :busy="savingSalary" @close="monthStateConfirmOpen = false" @confirm="confirmMonthStateChange" />
    </template>
  </div>
</template>
