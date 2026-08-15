<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Menu, MenuButton, MenuItem, MenuItems, TransitionRoot } from "@headlessui/vue";
import { useRouter } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import ObservationDialog from "../components/ObservationDialog.vue";
import TemplateFormDialog from "../components/TemplateFormDialog.vue";
import { getDashboard } from "../api/dashboard";
import { useGlobalPeriod } from "../composables/useGlobalPeriod";
import { createTemplate, deactivateTemplate, updateTemplate, updateTemplateObservation } from "../api/templates";
import { formatCurrency, formatMonth } from "../utils/formatters";

const router = useRouter();
const { selectedMonth, setSelectedMonth } = useGlobalPeriod();
const loading = ref(true);
const refreshing = ref(false);
const error = ref("");
const payload = ref(null);
const search = ref("");
const typeFilter = ref("all");
const cycleFilter = ref("all");
const paymentFilter = ref("all");
const formOpen = ref(false);
const observationOpen = ref(false);
const confirmOpen = ref(false);
const selectedTemplate = ref(null);
const mutationBusy = ref(false);
const mutationError = ref("");
const notice = ref("");

const templates = computed(() => payload.value?.templates || []);
const isClosed = computed(() => Boolean(payload.value?.month?.isClosed));
const fixedCount = computed(() => templates.value.filter((item) => !item.isVariable).length);
const variableCount = computed(() => templates.value.length - fixedCount.value);
const defaultTotal = computed(() => templates.value.reduce((total, item) => total + Number(item.amount || 0), 0));
const hasFilters = computed(() => Boolean(search.value || typeFilter.value !== "all" || cycleFilter.value !== "all" || paymentFilter.value !== "all"));
const filteredTemplates = computed(() => {
  const term = search.value.trim().toLocaleLowerCase("pt-BR");
  return templates.value.filter((item) => {
    const matchesSearch = !term || [item.name, item.paymentMethod, item.cycle].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term));
    const matchesType = typeFilter.value === "all" || (typeFilter.value === "variable" ? item.isVariable : !item.isVariable);
    const matchesCycle = cycleFilter.value === "all" || item.cycle === cycleFilter.value;
    const matchesPayment = paymentFilter.value === "all" || (paymentFilter.value === "none" ? !item.paymentMethod : item.paymentMethod === paymentFilter.value);
    return matchesSearch && matchesType && matchesCycle && matchesPayment;
  });
});

function cycleLabel(cycle) {
  return cycle === "Inicio Do Mes" ? "Início do mês" : cycle;
}

function showNotice(message) {
  notice.value = message;
  window.setTimeout(() => { if (notice.value === message) notice.value = ""; }, 3200);
}

function applyPayload(nextPayload) {
  payload.value = nextPayload;
  setSelectedMonth(nextPayload.activeMonth);
}

async function loadTemplates(monthKey = "", { initial = false } = {}) {
  if (initial) loading.value = true;
  else refreshing.value = true;
  error.value = "";
  try {
    let nextPayload = await getDashboard(monthKey || selectedMonth.value);
    if (initial) {
      const latestMonth = nextPayload.months?.[0]?.monthKey;
      if (!selectedMonth.value && latestMonth && latestMonth !== nextPayload.activeMonth) nextPayload = await getDashboard(latestMonth);
    }
    applyPayload(nextPayload);
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

async function changeMonth(monthKey) {
  if (monthKey && monthKey !== selectedMonth.value) await loadTemplates(monthKey);
}

function openCreate() {
  if (isClosed.value) return;
  selectedTemplate.value = null;
  mutationError.value = "";
  formOpen.value = true;
}

function openEdit(template) {
  if (isClosed.value) return;
  selectedTemplate.value = template;
  mutationError.value = "";
  formOpen.value = true;
}

function openObservation(template) {
  if (isClosed.value) return;
  selectedTemplate.value = template;
  mutationError.value = "";
  observationOpen.value = true;
}

function openDeactivate(template) {
  if (isClosed.value) return;
  selectedTemplate.value = template;
  mutationError.value = "";
  confirmOpen.value = true;
}

async function saveTemplate(form) {
  mutationBusy.value = true;
  mutationError.value = "";
  try {
    const body = { ...form, observation: selectedTemplate.value?.observation || "", monthKey: selectedMonth.value };
    const nextPayload = selectedTemplate.value
      ? await updateTemplate(selectedTemplate.value.id, body)
      : await createTemplate({ ...body, observation: "" });
    applyPayload(nextPayload);
    formOpen.value = false;
    showNotice(selectedTemplate.value ? "Cadastro atualizado com sucesso." : "Cadastro criado com sucesso.");
  } catch (saveError) {
    mutationError.value = saveError.message;
  } finally {
    mutationBusy.value = false;
  }
}

async function saveObservation(observation) {
  mutationBusy.value = true;
  mutationError.value = "";
  try {
    applyPayload(await updateTemplateObservation(selectedTemplate.value.id, observation, selectedMonth.value));
    observationOpen.value = false;
    showNotice("Observação salva com sucesso.");
  } catch (saveError) {
    mutationError.value = saveError.message;
  } finally {
    mutationBusy.value = false;
  }
}

async function confirmDeactivate() {
  mutationBusy.value = true;
  mutationError.value = "";
  try {
    applyPayload(await deactivateTemplate(selectedTemplate.value.id, selectedMonth.value));
    confirmOpen.value = false;
    showNotice("Cadastro inativado.");
  } catch (deactivateError) {
    mutationError.value = deactivateError.message;
  } finally {
    mutationBusy.value = false;
  }
}

function clearFilters() {
  search.value = "";
  typeFilter.value = "all";
  cycleFilter.value = "all";
  paymentFilter.value = "all";
}

async function handleGlobalPeriodChange(event) {
  const monthKey = event.detail?.monthKey;
  if (monthKey && monthKey !== payload.value?.activeMonth) await loadTemplates(monthKey);
}

onMounted(() => {
  loadTemplates("", { initial: true });
  window.addEventListener("dindin-period-change", handleGlobalPeriodChange);
});
onBeforeUnmount(() => window.removeEventListener("dindin-period-change", handleGlobalPeriodChange));
</script>

<template>
  <div class="templates-page">
    <div v-if="loading" class="templates-loading" aria-live="polite"><div></div><span></span><span></span><span></span></div>

    <section v-else-if="error" class="dashboard-error" role="alert"><span><AppIcon name="alert" :size="28" /></span><div><h1>Não foi possível carregar os cadastros.</h1><p>{{ error }}</p><button type="button" @click="loadTemplates('', { initial: true })">Tentar novamente</button></div></section>

    <template v-else>
      <header class="templates-hero">
        <div><p class="dashboard-eyebrow">Organização recorrente</p><h1>Cadastros</h1><p>Organize seus gastos recorrentes e deixe os próximos meses mais previsíveis.</p></div>
        <div class="templates-hero__actions">
          <button class="templates-primary-action" type="button" @click="openCreate"><AppIcon name="plus" :size="18" />Novo cadastro</button>
        </div>
      </header>

      <div v-if="refreshing" class="dashboard-refreshing" role="status"><span></span>Atualizando período...</div>

      <section class="templates-stats" aria-label="Resumo dos cadastros">
        <article><span><AppIcon name="templates" /></span><div><small>Cadastros ativos</small><strong>{{ templates.length }}</strong></div></article>
        <article><span><AppIcon name="fixed" /></span><div><small>Valores fixos</small><strong>{{ fixedCount }}</strong></div></article>
        <article><span><AppIcon name="trending" /></span><div><small>Valores variáveis</small><strong>{{ variableCount }}</strong></div></article>
        <article><span><AppIcon name="wallet" /></span><div><small>Total padrão</small><strong>{{ formatCurrency(defaultTotal) }}</strong></div></article>
      </section>

      <section class="templates-panel">
        <div class="templates-panel__heading"><div><h2>Gastos recorrentes</h2><p>{{ filteredTemplates.length }} de {{ templates.length }} cadastro(s)</p></div><button v-if="hasFilters" type="button" @click="clearFilters">Limpar filtros</button></div>

        <div class="templates-filters">
          <label class="templates-search"><AppIcon name="search" :size="18" /><input v-model="search" type="search" placeholder="Buscar por nome, ciclo ou pagamento" /><span class="sr-only">Buscar cadastros</span></label>
          <label><span>Tipo</span><select v-model="typeFilter"><option value="all">Todos os tipos</option><option value="fixed">Valor fixo</option><option value="variable">Valor variável</option></select></label>
          <label><span>Ciclo</span><select v-model="cycleFilter"><option value="all">Todos os ciclos</option><option value="Inicio Do Mes">Início do mês</option><option value="Quinzena">Quinzena</option></select></label>
          <label><span>Pagamento</span><select v-model="paymentFilter"><option value="all">Todas as formas</option><option value="Pix">Pix</option><option value="Boleto">Boleto</option><option value="Outros">Outros</option><option value="none">Não informado</option></select></label>
        </div>

        <div v-if="filteredTemplates.length" class="templates-table-wrap">
          <table class="templates-table">
            <thead><tr><th>Cadastro</th><th>Valor padrão</th><th>Ciclo</th><th>Pagamento</th><th>Comportamento</th><th>Válido desde</th><th><span class="sr-only">Ações</span></th></tr></thead>
            <tbody><tr v-for="template in filteredTemplates" :key="template.id">
              <td data-label="Cadastro"><span class="template-row-icon"><AppIcon name="receipt" :size="18" /></span><div><strong>{{ template.name }}</strong><small>{{ template.observation || "Sem observação" }}</small></div></td>
              <td data-label="Valor padrão"><strong>{{ formatCurrency(template.amount) }}</strong></td>
              <td data-label="Ciclo">{{ cycleLabel(template.cycle) }}</td>
              <td data-label="Pagamento">{{ template.paymentMethod || "Não informado" }}</td>
              <td data-label="Comportamento"><span class="template-type" :class="template.isVariable ? 'template-type--variable' : 'template-type--fixed'">{{ template.isVariable ? "Variável" : "Fixo" }}</span></td>
              <td data-label="Válido desde">{{ formatMonth(template.startMonth) }}</td>
              <td class="template-actions-cell">
                <Menu as="div" class="template-actions"><MenuButton class="template-actions__button" :aria-label="`Ações de ${template.name}`"><AppIcon name="more" /></MenuButton><TransitionRoot enter="menu-transition" enter-from="menu-hidden" enter-to="menu-visible" leave="menu-transition" leave-from="menu-visible" leave-to="menu-hidden"><MenuItems class="template-actions__menu"><MenuItem v-slot="{ active }"><button type="button" :class="{ 'is-active': active }" @click="openEdit(template)"><AppIcon name="edit" :size="17" />Editar</button></MenuItem><MenuItem v-slot="{ active }"><button type="button" :class="{ 'is-active': active }" @click="openObservation(template)"><AppIcon name="note" :size="17" />Observação</button></MenuItem><MenuItem v-slot="{ active }"><button class="is-danger" type="button" :class="{ 'is-active': active }" @click="openDeactivate(template)"><AppIcon name="trash" :size="17" />Inativar</button></MenuItem></MenuItems></TransitionRoot></Menu>
              </td>
            </tr></tbody>
          </table>
        </div>

        <div v-else class="templates-empty"><span><AppIcon :name="templates.length ? 'search' : 'templates'" :size="30" /></span><h3>{{ templates.length ? "Nenhum cadastro encontrado." : "Comece pelo seu primeiro cadastro." }}</h3><p>{{ templates.length ? "Ajuste ou limpe os filtros para visualizar outros resultados." : "Cadastre um gasto recorrente para facilitar o planejamento dos próximos meses." }}</p><button type="button" @click="templates.length ? clearFilters() : openCreate()">{{ templates.length ? "Limpar filtros" : "Criar primeiro cadastro" }}</button></div>
      </section>

      <TransitionRoot :show="Boolean(notice)" as="template" enter="toast-transition" enter-from="toast-hidden" enter-to="toast-visible" leave="toast-transition" leave-from="toast-visible" leave-to="toast-hidden"><div class="templates-toast" role="status"><AppIcon name="check" :size="18" />{{ notice }}</div></TransitionRoot>

      <TemplateFormDialog :open="formOpen" :template="selectedTemplate" :month-key="selectedMonth" :saving="mutationBusy" :error="mutationError" @close="formOpen = false" @save="saveTemplate" />
      <ObservationDialog :open="observationOpen" :template="selectedTemplate" :saving="mutationBusy" :error="mutationError" @close="observationOpen = false" @save="saveObservation" />
      <ConfirmDialog :open="confirmOpen" title="Inativar cadastro?" :message="`O cadastro “${selectedTemplate?.name || ''}” será removido de ${formatMonth(selectedMonth)} e não aparecerá nos próximos meses.`" :busy="mutationBusy" @close="confirmOpen = false" @confirm="confirmDeactivate" />
    </template>
  </div>
</template>
