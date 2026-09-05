<script setup>
import { computed, ref, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";
import { formatCurrency, formatMonth } from "../utils/formatters";

const props = defineProps({
  open: { type: Boolean, default: false },
  items: { type: Array, default: () => [] },
});
const emit = defineEmits(["confirm"]);
const selectedIds = ref(new Set());

const groupedItems = computed(() => Object.entries(props.items.reduce((groups, item) => {
  if (!groups[item.monthKey]) groups[item.monthKey] = [];
  groups[item.monthKey].push(item);
  return groups;
}, {})).sort(([left], [right]) => left.localeCompare(right)));
const selectedTotal = computed(() => props.items
  .filter((item) => selectedIds.value.has(item.id))
  .reduce((total, item) => total + Number(item.amount || 0), 0));

watch(() => props.open, (open) => {
  if (open) selectedIds.value = new Set(props.items.filter((item) => item.salarySuggested).map((item) => item.id));
});

function toggle(item) {
  const next = new Set(selectedIds.value);
  if (next.has(item.id)) next.delete(item.id);
  else next.add(item.id);
  selectedIds.value = next;
}

function confirm(ids = [...selectedIds.value]) {
  emit("confirm", ids);
}

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "Data não informada";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
</script>

<template>
  <TransitionRoot :show="open" as="template">
    <Dialog class="dialog-root" @close="confirm([])">
      <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden"><div class="dialog-backdrop"></div></TransitionChild>
      <div class="dialog-positioner">
        <TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden">
          <DialogPanel class="dialog-panel salary-suggestions-dialog">
            <div class="dialog-heading"><div class="dialog-panel__icon"><AppIcon name="wallet" /></div></div>
            <DialogTitle>Quais receitas são salário?</DialogTitle>
            <p>O Dindin encontrou possíveis salários. Você pode selecionar uma ou mais receitas para preencher automaticamente o salário de cada período.</p>

            <div class="salary-suggestion-groups">
              <section v-for="[monthKey, monthItems] in groupedItems" :key="monthKey">
                <header><strong>{{ formatMonth(monthKey) }}</strong><small>{{ monthItems.length }} {{ monthItems.length === 1 ? "receita" : "receitas" }}</small></header>
                <button v-for="item in monthItems" :key="item.id" type="button" :class="{ 'is-selected': selectedIds.has(item.id) }" @click="toggle(item)">
                  <span class="salary-suggestion-check"><AppIcon v-if="selectedIds.has(item.id)" name="check" :size="18" /></span>
                  <span><strong>{{ item.description }}</strong><small>{{ formatDate(item.postedDate) }} · {{ item.paymentMethod }}</small><em v-if="item.salarySuggested">{{ item.salarySuggestionReason }}</em></span>
                  <b>{{ formatCurrency(item.amount) }}</b>
                </button>
              </section>
            </div>

            <div class="salary-suggestion-total"><span>Selecionado como salário</span><strong>{{ formatCurrency(selectedTotal) }}</strong></div>
            <div class="dialog-actions"><button class="dialog-cancel" type="button" @click="confirm([])">Nenhuma é salário</button><button class="dialog-save" type="button" @click="confirm()">Aplicar seleção</button></div>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
