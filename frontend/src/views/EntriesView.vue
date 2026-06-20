<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import EntryObservationDialog from "../components/EntryObservationDialog.vue";
import MonthPageHeader from "../components/MonthPageHeader.vue";
import MultiSelectFilter from "../components/MultiSelectFilter.vue";
import { deleteEntry, updateEntry, updateEntryObservation } from "../api/entries";
import { useMonthlyBootstrap } from "../composables/useMonthlyBootstrap";
import { formatCurrency } from "../utils/formatters";

const FILTER_COOKIE = "dindin-entry-filters";
const GROUP_KEY = "dindin-entry-groups-collapsed";
const { payload, loading, refreshing, error, selectedMonth, applyPayload, load, selectMonth } = useMonthlyBootstrap();
const drafts = ref([]);
const originals = ref({});
const saving = ref(false);
const actionError = ref("");
const notice = ref("");
const observationOpen = ref(false);
const deleteOpen = ref(false);
const selectedEntry = ref(null);
const search = ref("");
const sort = reactive({ key: "manual", direction: "asc" });
const filters = reactive(loadFilters());
const collapsed = reactive(loadGroups());

const filterOptions = {
  status: [{ value: "pending", label: "Pendentes" }, { value: "paid", label: "Pagos" }, { value: "saved", label: "Guardados" }],
  cycle: [{ value: "Inicio Do Mes", label: "Início do mês" }, { value: "Quinzena", label: "Quinzena" }],
  type: [{ value: "fixed", label: "Fixos" }, { value: "variable", label: "Variáveis" }],
};

const filteredEntries = computed(() => drafts.value.filter((entry) =>
  (!search.value.trim() || [entry.name, entry.paymentMethod].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(search.value.trim().toLocaleLowerCase("pt-BR")))) &&
  (!filters.status.length || filters.status.includes(entry.status)) &&
  (!filters.cycle.length || filters.cycle.includes(entry.cycle)) &&
  (!filters.type.length || filters.type.includes(entry.isVariable ? "variable" : "fixed"))
));
const groups = computed(() => [
  { cycle: "Inicio Do Mes", title: "Início do mês" },
  { cycle: "Quinzena", title: "Quinzena" },
].map((group) => ({ ...group, entries: filteredEntries.value.filter((entry) => entry.cycle === group.cycle) })));
const total = computed(() => filteredEntries.value.reduce((sum, entry) => sum + parseMoney(entry.amountInput), 0));
const dirtyEntries = computed(() => drafts.value.filter((entry) => {
  const original = originals.value[entry.id];
  return original && (parseMoney(entry.amountInput) !== original.amount || entry.cycle !== original.cycle || entry.status !== original.status);
}));
const dirtyTotal = computed(() => dirtyEntries.value.reduce((sum, entry) => sum + parseMoney(entry.amountInput), 0));

function readCookie(name) {
  const prefix = `${name}=`;
  const item = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
}

function loadFilters() {
  try { return { status: [], cycle: [], type: [], ...JSON.parse(readCookie(FILTER_COOKIE) || "{}") }; } catch { return { status: [], cycle: [], type: [] }; }
}

function loadGroups() {
  try { return { "Inicio Do Mes": true, Quinzena: true, ...JSON.parse(localStorage.getItem(GROUP_KEY) || "{}") }; } catch { return { "Inicio Do Mes": true, Quinzena: true }; }
}

function persistFilters() {
  document.cookie = `${FILTER_COOKIE}=${encodeURIComponent(JSON.stringify(filters))}; path=/; max-age=31536000; SameSite=Lax`;
}

function updateFilter(key, value) {
  filters[key] = value;
  persistFilters();
}

function clearFilters() {
  Object.assign(filters, { status: [], cycle: [], type: [] });
  search.value = "";
  persistFilters();
}

function setSort(key) {
  if (sort.key === key) sort.direction = sort.direction === "asc" ? "desc" : "asc";
  else Object.assign(sort, { key, direction: "asc" });
}

function sortedEntries(entries) {
  if (sort.key === "manual") return entries;
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...entries].sort((left, right) => {
    const leftValue = sort.key === "amount" ? parseMoney(left.amountInput) : String(left[sort.key] || "").toLocaleLowerCase("pt-BR");
    const rightValue = sort.key === "amount" ? parseMoney(right.amountInput) : String(right[sort.key] || "").toLocaleLowerCase("pt-BR");
    return (leftValue > rightValue ? 1 : leftValue < rightValue ? -1 : 0) * direction;
  });
}

function toggleGroup(cycle) {
  collapsed[cycle] = !collapsed[cycle];
  localStorage.setItem(GROUP_KEY, JSON.stringify(collapsed));
}

function parseMoney(value) {
  return Number(String(value || "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")) || 0;
}

function formatInput(value) {
  return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function initialize(nextPayload) {
  applyPayload(nextPayload);
  drafts.value = (nextPayload.month?.entries || []).map((entry) => ({ ...entry, amountInput: formatInput(entry.amount) }));
  originals.value = Object.fromEntries(drafts.value.map((entry) => [entry.id, { amount: Number(entry.amount), cycle: entry.cycle, status: entry.status }]));
}

async function loadPage(monthKey = "", options = {}) {
  await load(monthKey, options);
  if (payload.value) initialize(payload.value);
}

async function changePageMonth(monthKey) {
  await selectMonth(monthKey);
  if (payload.value) initialize(payload.value);
}

function changeCycle(entry, cycle) {
  entry.cycle = cycle;
}

function moveEntry(groupEntries, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= groupEntries.length) return;
  const firstIndex = drafts.value.findIndex((entry) => entry.id === groupEntries[index].id);
  const secondIndex = drafts.value.findIndex((entry) => entry.id === groupEntries[target].id);
  [drafts.value[firstIndex], drafts.value[secondIndex]] = [drafts.value[secondIndex], drafts.value[firstIndex]];
}

function discardChanges() {
  drafts.value.forEach((entry) => {
    const original = originals.value[entry.id];
    if (!original) return;
    entry.amountInput = formatInput(original.amount);
    entry.cycle = original.cycle;
    entry.status = original.status;
  });
  showNotice("Alterações descartadas.");
}

function protectUnsavedChanges(event) {
  if (!dirtyEntries.value.length) return;
  event.preventDefault();
  event.returnValue = "";
}

function showNotice(message) {
  notice.value = message;
  setTimeout(() => { if (notice.value === message) notice.value = ""; }, 3000);
}

async function saveAll() {
  if (!dirtyEntries.value.length || saving.value) return;
  saving.value = true;
  actionError.value = "";
  try {
    let nextPayload = null;
    for (const entry of dirtyEntries.value) nextPayload = await updateEntry(entry.id, { amount: parseMoney(entry.amountInput), cycle: entry.cycle, status: entry.status });
    if (nextPayload) initialize(nextPayload);
    showNotice("Alterações salvas com sucesso.");
  } catch (saveError) { actionError.value = saveError.message; }
  finally { saving.value = false; }
}

function openObservation(entry) {
  selectedEntry.value = entry;
  actionError.value = "";
  observationOpen.value = true;
}

async function saveObservation(value) {
  saving.value = true;
  actionError.value = "";
  try { initialize(await updateEntryObservation(selectedEntry.value.id, value)); observationOpen.value = false; showNotice("Observação atualizada."); }
  catch (saveError) { actionError.value = saveError.message; }
  finally { saving.value = false; }
}

function requestDelete(entry) {
  selectedEntry.value = entry;
  deleteOpen.value = true;
}

async function confirmDelete() {
  saving.value = true;
  try { initialize(await deleteEntry(selectedEntry.value.id)); deleteOpen.value = false; showNotice("Lançamento excluído."); }
  catch (deleteError) { actionError.value = deleteError.message; }
  finally { saving.value = false; }
}

onMounted(() => {
  window.addEventListener("beforeunload", protectUnsavedChanges);
  loadPage("", { initial: true });
});
onBeforeUnmount(() => window.removeEventListener("beforeunload", protectUnsavedChanges));
onBeforeRouteLeave(() => !dirtyEntries.value.length || window.confirm("Existem alterações não salvas. Deseja sair mesmo assim?"));
</script>

<template><div class="workspace-page">
  <div v-if="loading" class="workspace-loading"><span v-for="item in 4" :key="item"></span></div>
  <section v-else-if="error" class="dashboard-error"><AppIcon name="alert" /><div><h1>Não foi possível carregar os lançamentos.</h1><p>{{ error }}</p><button @click="loadPage('', { initial: true })">Tentar novamente</button></div></section>
  <template v-else>
    <MonthPageHeader eyebrow="Movimentação mensal" title="Lançamentos" description="Revise valores, ciclos e status antes de confirmar as alterações do mês." :payload="payload" :selected-month="selectedMonth" :refreshing="refreshing" @change-month="changePageMonth" />
    <section class="workspace-stats workspace-stats--three"><article><span><AppIcon name="entries" /></span><div><small>Lançamentos exibidos</small><strong>{{ filteredEntries.length }}</strong></div></article><article><span><AppIcon name="wallet" /></span><div><small>Total filtrado</small><strong>{{ formatCurrency(total) }}</strong></div></article><article><span><AppIcon name="edit" /></span><div><small>Alterações pendentes</small><strong>{{ dirtyEntries.length }}</strong></div></article></section>
    <section class="workspace-panel entries-workspace" :class="{ 'has-save-dock': dirtyEntries.length }">
      <div class="workspace-panel__heading"><div><h2>Gastos do mês</h2><p>Edite diretamente na tabela. A ação de salvar acompanhará sua rolagem.</p></div><span v-if="dirtyEntries.length" class="entries-pending-badge"><i></i>{{ dirtyEntries.length }} pendente(s)</span></div>
      <div class="entries-table-toolbar"><label class="templates-search"><AppIcon name="search" :size="18" /><input v-model="search" type="search" placeholder="Buscar lançamento ou pagamento" /><span class="sr-only">Buscar lançamentos</span></label><button type="button" :class="{ 'is-active': sort.key === 'manual' }" @click="setSort('manual')"><AppIcon name="entries" :size="16" />Ordem manual</button></div>
      <div class="entries-filter-grid"><MultiSelectFilter label="Status" :model-value="filters.status" :options="filterOptions.status" @update:model-value="updateFilter('status', $event)" /><MultiSelectFilter label="Ciclo" :model-value="filters.cycle" :options="filterOptions.cycle" @update:model-value="updateFilter('cycle', $event)" /><MultiSelectFilter label="Tipo" :model-value="filters.type" :options="filterOptions.type" @update:model-value="updateFilter('type', $event)" /><button v-if="search || filters.status.length || filters.cycle.length || filters.type.length" class="filters-clear" type="button" @click="clearFilters">Limpar filtros</button></div>
      <p v-if="actionError" class="workspace-error" role="alert">{{ actionError }}</p>
      <div class="entry-groups"><article v-for="group in groups" :key="group.cycle" class="entry-group"><button class="entry-group__header" type="button" :aria-expanded="!collapsed[group.cycle]" @click="toggleGroup(group.cycle)"><div><span><AppIcon name="calendar" /></span><div><h3>{{ group.title }}</h3><p>{{ group.entries.length }} lançamento(s)</p></div></div><div><span><small>Subtotal</small><strong>{{ formatCurrency(group.entries.reduce((sum, entry) => sum + parseMoney(entry.amountInput), 0)) }}</strong></span><AppIcon name="chevron-down" :class="{ 'is-open': !collapsed[group.cycle] }" /></div></button>
        <div v-if="!collapsed[group.cycle]" class="entry-group__body"><div v-if="group.entries.length" class="dynamic-table-wrap"><table class="dynamic-table entries-dynamic-table"><thead><tr><th><button type="button" @click="setSort('name')">Lançamento <span>{{ sort.key === 'name' ? (sort.direction === 'asc' ? '↑' : '↓') : '↕' }}</span></button></th><th><button type="button" @click="setSort('amount')">Valor <span>{{ sort.key === 'amount' ? (sort.direction === 'asc' ? '↑' : '↓') : '↕' }}</span></button></th><th>Ciclo</th><th><button type="button" @click="setSort('status')">Status <span>{{ sort.key === 'status' ? (sort.direction === 'asc' ? '↑' : '↓') : '↕' }}</span></button></th><th>Tipo</th><th>Ordem</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody><tr v-for="(entry, index) in sortedEntries(group.entries)" :key="entry.id"><td data-label="Lançamento"><div class="dynamic-table__identity"><span><AppIcon name="receipt" :size="17" /></span><div><strong>{{ entry.name }}</strong><small>{{ entry.paymentMethod || "Pagamento não informado" }}</small></div></div></td><td data-label="Valor"><input v-model="entry.amountInput" class="table-money-input" inputmode="decimal" aria-label="Valor" /></td><td data-label="Ciclo"><select :value="entry.cycle" aria-label="Ciclo" @change="changeCycle(entry, $event.target.value)"><option value="Inicio Do Mes">Início do mês</option><option value="Quinzena">Quinzena</option></select></td><td data-label="Status"><select v-model="entry.status" aria-label="Status"><option value="pending">Pendente</option><option value="paid">Pago</option><option value="saved">Guardado</option></select></td><td data-label="Tipo"><span class="template-type" :class="entry.isVariable ? 'template-type--variable' : 'template-type--fixed'">{{ entry.isVariable ? "Variável" : "Fixo" }}</span></td><td data-label="Ordem"><div class="entry-order"><button type="button" :disabled="sort.key !== 'manual' || index === 0" aria-label="Mover para cima" @click="moveEntry(group.entries, index, -1)">↑</button><button type="button" :disabled="sort.key !== 'manual' || index === group.entries.length - 1" aria-label="Mover para baixo" @click="moveEntry(group.entries, index, 1)">↓</button></div></td><td class="dynamic-table__actions"><button type="button" title="Observação" @click="openObservation(entry)"><AppIcon name="note" :size="16" /></button><button class="is-danger" type="button" title="Excluir" @click="requestDelete(entry)"><AppIcon name="trash" :size="16" /></button></td></tr></tbody></table></div><div v-else class="workspace-empty workspace-empty--compact">Nenhum lançamento neste grupo com os filtros atuais.</div></div>
      </article></div>
      <Transition name="save-dock">
        <aside v-if="dirtyEntries.length" class="entries-save-dock" aria-live="polite">
          <div class="entries-save-dock__status"><span><AppIcon name="edit" :size="18" /></span><div><strong>{{ dirtyEntries.length }} alteração(ões) pendente(s)</strong><small>{{ formatCurrency(dirtyTotal) }} nos itens modificados</small></div></div>
          <div class="entries-save-dock__actions"><button class="entries-save-dock__discard" type="button" :disabled="saving" @click="discardChanges">Descartar</button><button class="entries-save-dock__save" type="button" :disabled="saving" @click="saveAll"><AppIcon name="check" :size="17" />{{ saving ? "Salvando..." : "Salvar alterações" }}</button></div>
        </aside>
      </Transition>
    </section>
    <div v-if="notice" class="templates-toast"><AppIcon name="check" />{{ notice }}</div>
    <EntryObservationDialog :open="observationOpen" :entry="selectedEntry" :saving="saving" :error="actionError" @close="observationOpen = false" @save="saveObservation" />
    <ConfirmDialog :open="deleteOpen" title="Excluir lançamento?" :message="`O lançamento “${selectedEntry?.name || ''}” será removido apenas deste mês.`" confirm-label="Excluir lançamento" :busy="saving" @close="deleteOpen = false" @confirm="confirmDelete" />
  </template>
</div></template>
