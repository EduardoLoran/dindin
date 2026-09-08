<script setup>
import { computed, ref, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";
import { previewEntryTransfer } from "../api/entries";
import { formatCurrency, formatMonth } from "../utils/formatters";
import AppIcon from "./AppIcon.vue";
import MonthPicker from "./MonthPicker.vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  sourceMonth: { type: String, default: "" },
  busy: { type: Boolean, default: false },
  error: { type: String, default: "" },
});
const emit = defineEmits(["close", "confirm"]);

const targetMonth = ref("");
const preview = ref(null);
const selectedIds = ref([]);
const loading = ref(false);
const loadError = ref("");
const conflictPolicy = ref("replace");
const adjustTemplateStart = ref(true);
let previewRequest = 0;

const selectedSet = computed(() => new Set(selectedIds.value));
const selectedItems = computed(() => (preview.value?.items || []).filter((item) => selectedSet.value.has(item.id)));
const selectedConflicts = computed(() => selectedItems.value.filter((item) => item.conflict));
const blockedConflicts = computed(() => selectedConflicts.value.filter((item) => !item.conflict.canReplace));
const movableItems = computed(() => selectedItems.value.filter((item) => {
  if (!item.conflict) return true;
  return conflictPolicy.value === "replace" && item.conflict.canReplace;
}));
const movableCount = computed(() => movableItems.value.length);
const movableTotal = computed(() => movableItems.value.reduce((sum, item) => sum + Number(item.amount || 0), 0));
const allSelected = computed(() => Boolean(preview.value?.items.length) && selectedIds.value.length === preview.value.items.length);
const someSelected = computed(() => selectedIds.value.length > 0 && !allSelected.value);
const adjustableSelectedCount = computed(() => movableItems.value.filter((item) => item.adjustableTemplateStart).length);

watch(() => props.open, (open) => {
  if (!open) return;
  targetMonth.value = addMonth(props.sourceMonth, 1);
  conflictPolicy.value = "replace";
  adjustTemplateStart.value = true;
  loadPreview();
});

async function loadPreview() {
  const requestId = ++previewRequest;
  preview.value = null;
  selectedIds.value = [];
  loadError.value = "";
  if (!props.sourceMonth || !targetMonth.value) return;
  loading.value = true;
  try {
    const result = await previewEntryTransfer(props.sourceMonth, targetMonth.value);
    if (requestId !== previewRequest) return;
    preview.value = result.transfer;
    selectedIds.value = result.transfer.items.map((item) => item.id);
  } catch (requestError) {
    if (requestId === previewRequest) loadError.value = requestError.message;
  } finally {
    if (requestId === previewRequest) loading.value = false;
  }
}

function changeTarget(monthKey) {
  if (!monthKey || monthKey === targetMonth.value) return;
  targetMonth.value = monthKey;
  loadPreview();
}

function toggleItem(entryId) {
  selectedIds.value = selectedSet.value.has(entryId)
    ? selectedIds.value.filter((id) => id !== entryId)
    : [...selectedIds.value, entryId];
}

function toggleAll(event) {
  selectedIds.value = event.target.checked ? preview.value.items.map((item) => item.id) : [];
}

function close() {
  if (!props.busy) emit("close");
}

function confirm() {
  if (props.busy || loading.value || !movableCount.value) return;
  emit("confirm", {
    sourceMonth: props.sourceMonth,
    targetMonth: targetMonth.value,
    entryIds: selectedIds.value,
    conflictPolicy: conflictPolicy.value,
    adjustTemplateStart: adjustTemplateStart.value,
  });
}

function sourceLabel(value) {
  return value === "fixed" ? "Gasto fixo" : "Manual";
}

function addMonth(monthKey, offset) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
</script>

<template>
  <TransitionRoot :show="open" as="template">
    <Dialog class="dialog-root" @close="close">
      <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden">
        <div class="dialog-backdrop"></div>
      </TransitionChild>
      <div class="dialog-positioner">
        <TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden">
          <DialogPanel class="dialog-panel transfer-entries-dialog">
            <div class="dialog-heading"><div class="dialog-panel__icon"><AppIcon name="arrow-right" :size="22" /></div><button type="button" aria-label="Fechar" :disabled="busy" @click="close"><AppIcon name="close" /></button></div>
            <DialogTitle>Transferir pendências</DialogTitle>
            <p>Mova os gastos pendentes cadastrados no mês incorreto antes de conciliá-los com o OFX.</p>

            <div class="transfer-periods">
              <div class="transfer-period-card"><span><AppIcon name="calendar" :size="18" /></span><div><small>Mês de origem</small><strong>{{ formatMonth(sourceMonth) }}</strong></div></div>
              <AppIcon class="transfer-periods__arrow" name="arrow-right" :size="20" />
              <MonthPicker :model-value="targetMonth" input-id="transfer-target-month" :disabled="busy || loading" :teleport="false" @update:model-value="changeTarget" />
            </div>

            <p v-if="loadError || error" class="workspace-error" role="alert">{{ loadError || error }}</p>
            <div v-if="loading" class="transfer-loading"><span></span>Verificando o mês de destino...</div>

            <template v-else-if="preview">
              <div v-if="preview.items.length" class="transfer-selection">
                <header><label><input type="checkbox" :checked="allSelected" :indeterminate="someSelected" :disabled="busy" @change="toggleAll" />Selecionar todos</label><span>{{ selectedIds.length }} de {{ preview.items.length }}</span></header>
                <div class="transfer-entry-list">
                  <button v-for="item in preview.items" :key="item.id" type="button" :class="{ 'is-selected': selectedSet.has(item.id) }" :aria-pressed="selectedSet.has(item.id)" :disabled="busy" @click="toggleItem(item.id)">
                    <span class="transfer-entry-check"><AppIcon v-if="selectedSet.has(item.id)" name="check" :size="17" /></span>
                    <span class="transfer-entry-copy"><strong>{{ item.name }}</strong><small>{{ sourceLabel(item.sourceType) }} · {{ item.cycle === 'Inicio Do Mes' ? 'Início do mês' : 'Quinzena' }}</small><em v-if="item.conflict" :class="{ 'is-blocked': !item.conflict.canReplace }">{{ item.conflict.canReplace ? 'Já existe no destino' : 'Conflito protegido' }}</em></span>
                    <b>{{ formatCurrency(item.amount) }}</b>
                  </button>
                </div>
              </div>
              <div v-else class="transfer-empty"><AppIcon name="check" :size="25" /><strong>Nenhuma pendência disponível.</strong><p>Somente gastos manuais ou fixos com status pendente podem ser transferidos.</p></div>

              <section v-if="selectedConflicts.length" class="transfer-conflicts">
                <div><AppIcon name="alert" :size="18" /><span><strong>{{ selectedConflicts.length }} conflito(s) no destino.</strong><small>Escolha como tratar gastos fixos que já existem em {{ formatMonth(targetMonth) }}.</small></span></div>
                <label :class="{ 'is-selected': conflictPolicy === 'replace' }"><input v-model="conflictPolicy" value="replace" type="radio" :disabled="busy" /><span><strong>Usar os dados de {{ formatMonth(sourceMonth) }}</strong><small>Substitui somente pendências compatíveis no destino.</small></span></label>
                <label :class="{ 'is-selected': conflictPolicy === 'skip' }"><input v-model="conflictPolicy" value="skip" type="radio" :disabled="busy" /><span><strong>Manter o que já existe no destino</strong><small>Os itens conflitantes permanecem no mês de origem.</small></span></label>
                <p v-if="blockedConflicts.length"><AppIcon name="alert" :size="16" />{{ blockedConflicts.length }} conflito(s) pago(s), importado(s) ou protegido(s) sempre serão mantidos.</p>
              </section>

              <label v-if="adjustableSelectedCount" class="transfer-template-option"><input v-model="adjustTemplateStart" type="checkbox" :disabled="busy" /><span><strong>Ajustar também o início dos gastos fixos</strong><small>{{ adjustableSelectedCount }} cadastro(s) iniciado(s) em {{ formatMonth(sourceMonth) }} passarão a iniciar em {{ formatMonth(targetMonth) }}.</small></span></label>

              <div v-if="selectedItems.length" class="transfer-summary"><span><small>Será transferido</small><strong>{{ movableCount }} {{ movableCount === 1 ? 'lançamento' : 'lançamentos' }}</strong></span><b>{{ formatCurrency(movableTotal) }}</b></div>
            </template>

            <div class="dialog-actions"><button class="dialog-cancel" type="button" :disabled="busy" @click="close">Cancelar</button><button class="workspace-primary" type="button" :disabled="busy || loading || !movableCount" @click="confirm">{{ busy ? "Transferindo..." : "Confirmar transferência" }}</button></div>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
