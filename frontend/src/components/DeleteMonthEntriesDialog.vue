<script setup>
import { computed, ref, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  monthLabel: { type: String, default: "período selecionado" },
  expenseCount: { type: Number, default: 0 },
  incomeCount: { type: Number, default: 0 },
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(["close", "confirm"]);

const expensesSelected = ref(true);
const incomeSelected = ref(false);
const selectedDirections = computed(() => [
  ...(expensesSelected.value ? ["expense"] : []),
  ...(incomeSelected.value ? ["income"] : []),
]);
const selectedCount = computed(() =>
  (expensesSelected.value ? props.expenseCount : 0) + (incomeSelected.value ? props.incomeCount : 0)
);

watch(() => props.open, (open) => {
  if (!open) return;
  expensesSelected.value = props.expenseCount > 0;
  incomeSelected.value = props.expenseCount === 0 && props.incomeCount > 0;
});

function close() {
  if (!props.busy) emit("close");
}

function confirm() {
  if (!props.busy && selectedDirections.value.length) emit("confirm", selectedDirections.value);
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
          <DialogPanel class="dialog-panel delete-entries-dialog">
            <div class="dialog-panel__icon dialog-panel__icon--danger"><AppIcon name="trash" :size="23" /></div>
            <DialogTitle>Excluir lançamentos do mês?</DialogTitle>
            <p>Selecione o que deseja remover de {{ monthLabel }}.</p>

            <div class="delete-entry-options">
              <label :class="{ 'is-selected': expensesSelected, 'is-disabled': expenseCount === 0 }">
                <input v-model="expensesSelected" type="checkbox" :disabled="expenseCount === 0 || busy" />
                <span class="delete-entry-options__icon"><AppIcon name="receipt" /></span>
                <span><strong>Todos os gastos</strong><small>{{ expenseCount }} {{ expenseCount === 1 ? "lançamento" : "lançamentos" }}</small></span>
                <AppIcon v-if="expensesSelected" name="check" :size="20" />
              </label>
              <label :class="{ 'is-selected': incomeSelected, 'is-disabled': incomeCount === 0 }">
                <input v-model="incomeSelected" type="checkbox" :disabled="incomeCount === 0 || busy" />
                <span class="delete-entry-options__icon delete-entry-options__icon--income"><AppIcon name="income" /></span>
                <span><strong>Todas as receitas</strong><small>{{ incomeCount }} {{ incomeCount === 1 ? "lançamento" : "lançamentos" }}</small></span>
                <AppIcon v-if="incomeSelected" name="check" :size="20" />
              </label>
            </div>

            <div class="delete-entries-warning"><AppIcon name="alert" :size="18" /><span><strong>{{ selectedCount }} {{ selectedCount === 1 ? "lançamento será excluído" : "lançamentos serão excluídos" }}.</strong> Esta ação não pode ser desfeita. O período e os cadastros fixos serão preservados.</span></div>

            <div class="dialog-actions">
              <button class="dialog-cancel" type="button" :disabled="busy" @click="close">Cancelar</button>
              <button class="dialog-danger" type="button" :disabled="busy || selectedDirections.length === 0" @click="confirm">{{ busy ? "Excluindo..." : "Excluir selecionados" }}</button>
            </div>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
