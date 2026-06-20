<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import AppIcon from "../components/AppIcon.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import MonthPageHeader from "../components/MonthPageHeader.vue";
import ObservationDialog from "../components/ObservationDialog.vue";
import { deactivateTemplate, updateTemplateObservation } from "../api/templates";
import { useMonthlyBootstrap } from "../composables/useMonthlyBootstrap";
import { formatCurrency, formatMonth } from "../utils/formatters";

const { payload, templates, loading, refreshing, error, selectedMonth, applyPayload, load, selectMonth } = useMonthlyBootstrap();
const search = ref("");
const cycle = ref("all");
const selected = ref(null);
const confirmOpen = ref(false);
const observationOpen = ref(false);
const busy = ref(false);
const actionError = ref("");
const notice = ref("");
const sort = reactive({ key: "name", direction: "asc" });
const fixedExpenses = computed(() => templates.value.filter((item) => !item.isVariable));
const filtered = computed(() => fixedExpenses.value.filter((item) => (!search.value || [item.name, item.paymentMethod, item.observation].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(search.value.toLocaleLowerCase("pt-BR")))) && (cycle.value === "all" || item.cycle === cycle.value)));
const sorted = computed(() => [...filtered.value].sort((left, right) => {
  const leftValue = sort.key === "amount" ? Number(left.amount) : String(left[sort.key] || "").toLocaleLowerCase("pt-BR");
  const rightValue = sort.key === "amount" ? Number(right.amount) : String(right[sort.key] || "").toLocaleLowerCase("pt-BR");
  return (leftValue > rightValue ? 1 : leftValue < rightValue ? -1 : 0) * (sort.direction === "asc" ? 1 : -1);
}));
const total = computed(() => filtered.value.reduce((sum, item) => sum + Number(item.amount || 0), 0));
function cycleLabel(value) { return value === "Inicio Do Mes" ? "Início do mês" : value; }
function setSort(key) { if (sort.key === key) sort.direction = sort.direction === "asc" ? "desc" : "asc"; else Object.assign(sort, { key, direction: "asc" }); }
function notify(message) { notice.value = message; setTimeout(() => { notice.value = ""; }, 3000); }
function requestDeactivate(item) { selected.value = item; actionError.value = ""; confirmOpen.value = true; }
function openObservation(item) { selected.value = item; actionError.value = ""; observationOpen.value = true; }
async function confirmDeactivate() { busy.value = true; try { applyPayload(await deactivateTemplate(selected.value.id, selectedMonth.value)); confirmOpen.value = false; notify("Gasto fixo inativado."); } catch (err) { actionError.value = err.message; } finally { busy.value = false; } }
async function saveObservation(value) { busy.value = true; try { applyPayload(await updateTemplateObservation(selected.value.id, value, selectedMonth.value)); observationOpen.value = false; notify("Observação atualizada."); } catch (err) { actionError.value = err.message; } finally { busy.value = false; } }
onMounted(() => load("", { initial: true }));
</script>

<template><div class="workspace-page"><div v-if="loading" class="workspace-loading"><span v-for="item in 4" :key="item"></span></div><section v-else-if="error" class="dashboard-error"><AppIcon name="alert" /><div><h1>Não foi possível carregar os gastos fixos.</h1><p>{{ error }}</p><button @click="load('', { initial: true })">Tentar novamente</button></div></section><template v-else>
  <MonthPageHeader eyebrow="Compromissos recorrentes" title="Gastos fixos" description="Acompanhe os valores que não variam e inative o que não faz mais parte do orçamento." :payload="payload" :selected-month="selectedMonth" :refreshing="refreshing" @change-month="selectMonth" />
  <section class="workspace-stats workspace-stats--three"><article><span><AppIcon name="fixed" /></span><div><small>Gastos fixos ativos</small><strong>{{ fixedExpenses.length }}</strong></div></article><article><span><AppIcon name="wallet" /></span><div><small>Total filtrado</small><strong>{{ formatCurrency(total) }}</strong></div></article><article><span><AppIcon name="calendar" /></span><div><small>Mês de referência</small><strong>{{ formatMonth(selectedMonth) }}</strong></div></article></section>
  <section class="workspace-panel"><div class="workspace-panel__heading"><div><h2>Valores recorrentes</h2><p>Somente cadastros marcados como valor fixo.</p></div><RouterLink class="workspace-secondary" to="/cadastros"><AppIcon name="plus" :size="16" />Gerenciar cadastros</RouterLink></div><div class="fixed-toolbar"><label class="templates-search"><AppIcon name="search" /><input v-model="search" type="search" placeholder="Buscar gasto fixo" /></label><select v-model="cycle"><option value="all">Todos os ciclos</option><option value="Inicio Do Mes">Início do mês</option><option value="Quinzena">Quinzena</option></select></div>
    <div v-if="sorted.length" class="dynamic-table-wrap"><table class="dynamic-table fixed-dynamic-table"><thead><tr><th><button type="button" @click="setSort('name')">Gasto fixo <span>{{ sort.key === 'name' ? (sort.direction === 'asc' ? '↑' : '↓') : '↕' }}</span></button></th><th><button type="button" @click="setSort('amount')">Valor <span>{{ sort.key === 'amount' ? (sort.direction === 'asc' ? '↑' : '↓') : '↕' }}</span></button></th><th><button type="button" @click="setSort('cycle')">Ciclo <span>{{ sort.key === 'cycle' ? (sort.direction === 'asc' ? '↑' : '↓') : '↕' }}</span></button></th><th>Pagamento</th><th><button type="button" @click="setSort('startMonth')">Válido desde <span>{{ sort.key === 'startMonth' ? (sort.direction === 'asc' ? '↑' : '↓') : '↕' }}</span></button></th><th>Observação</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody><tr v-for="item in sorted" :key="item.id"><td data-label="Gasto fixo"><div class="dynamic-table__identity"><span><AppIcon name="fixed" :size="17" /></span><div><strong>{{ item.name }}</strong><small><span class="template-type template-type--fixed">Fixo</span></small></div></div></td><td data-label="Valor"><strong>{{ formatCurrency(item.amount) }}</strong></td><td data-label="Ciclo">{{ cycleLabel(item.cycle) }}</td><td data-label="Pagamento">{{ item.paymentMethod || "Não informado" }}</td><td data-label="Válido desde">{{ formatMonth(item.startMonth) }}</td><td data-label="Observação"><span class="table-note" :title="item.observation">{{ item.observation || "Sem observação" }}</span></td><td class="dynamic-table__actions"><button type="button" title="Observação" @click="openObservation(item)"><AppIcon name="note" :size="16" /></button><RouterLink to="/cadastros" title="Editar cadastro"><AppIcon name="edit" :size="16" /></RouterLink><button class="is-danger" type="button" title="Inativar" @click="requestDeactivate(item)"><AppIcon name="trash" :size="16" /></button></td></tr></tbody></table></div><div v-else class="workspace-empty"><AppIcon name="fixed" :size="34" /><h3>Nenhum gasto fixo encontrado.</h3><p>Cadastros variáveis não aparecem neste painel.</p><RouterLink to="/cadastros">Abrir cadastros</RouterLink></div>
  </section><div v-if="notice" class="templates-toast"><AppIcon name="check" />{{ notice }}</div><ObservationDialog :open="observationOpen" :template="selected" :saving="busy" :error="actionError" @close="observationOpen = false" @save="saveObservation" /><ConfirmDialog :open="confirmOpen" title="Inativar gasto fixo?" :message="`“${selected?.name || ''}” deixará de aparecer nos próximos meses e será removido do mês selecionado.`" :busy="busy" @close="confirmOpen = false" @confirm="confirmDeactivate" />
</template></div></template>
