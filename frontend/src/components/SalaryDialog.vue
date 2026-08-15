<script setup>
import { reactive, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";
import MonthPicker from "./MonthPicker.vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  mode: { type: String, default: "edit" },
  currentValue: { type: Number, default: 0 },
  monthKey: { type: String, default: "" },
  suggestedMonth: { type: String, default: "" },
  saving: { type: Boolean, default: false },
  error: { type: String, default: "" },
  isClosed: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "save", "request-close-month", "request-reopen-month"]);
const form = reactive({ salary: "", monthKey: "", includeFixedEntries: false });
const inputFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

watch(() => props.open, (open) => {
  if (!open) return;
  form.salary = inputFormatter.format(Number(props.currentValue) || 0);
  form.monthKey = props.mode === "create" ? props.suggestedMonth : props.monthKey;
  form.includeFixedEntries = false;
});

function parseValue() {
  const normalized = form.salary.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  return Number(normalized) || 0;
}

function submit() {
  emit("save", {
    monthKey: form.monthKey,
    salary: parseValue(),
    includeFixedEntries: form.includeFixedEntries,
  });
}
</script>

<template>
  <TransitionRoot :show="open" as="template">
    <Dialog class="dialog-root" @close="saving ? undefined : emit('close')">
      <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden"><div class="dialog-backdrop"></div></TransitionChild>
      <div class="dialog-positioner">
        <TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden">
          <DialogPanel class="dialog-panel salary-dialog">
            <div class="dialog-panel__icon"><AppIcon name="wallet" :size="24" /></div>
            <DialogTitle>{{ mode === "create" ? "Novo salário" : "Editar salário" }}</DialogTitle>
            <p>{{ mode === "create" ? "Crie um período mesmo que ainda não existam lançamentos." : "Atualize a base financeira do período selecionado." }}</p>

            <label v-if="mode === 'create'" for="salary-month">Mês de referência</label>
            <MonthPicker v-if="mode === 'create'" v-model="form.monthKey" input-id="salary-month" :disabled="saving" />

            <label for="salary-value">Salário do mês</label>
            <div class="money-input"><span>R$</span><input id="salary-value" v-model="form.salary" inputmode="decimal" autocomplete="off" :disabled="saving || isClosed" @keydown.enter.prevent="submit" /></div>

            <label v-if="mode === 'create'" class="salary-fixed-option">
              <input v-model="form.includeFixedEntries" type="checkbox" :disabled="saving" />
              <span><strong>Incluir gastos fixos</strong><small>Desmarcado por padrão. Você poderá incluir depois.</small></span>
            </label>

            <div v-if="mode === 'edit'" class="salary-month-state" :class="{ 'is-closed': isClosed }">
              <div><strong>{{ isClosed ? "Mês fechado" : "Mês aberto" }}</strong><small>{{ isClosed ? "Os dados estão somente para consulta." : "Lançamentos e cadastros ainda podem ser alterados." }}</small></div>
              <button v-if="isClosed" type="button" :disabled="saving" @click="emit('request-reopen-month')">Reabrir mês</button>
              <button v-else class="is-danger" type="button" :disabled="saving" @click="emit('request-close-month')">Fechar mês</button>
            </div>

            <p v-if="error" class="dialog-error" role="alert">{{ error }}</p>
            <div class="dialog-actions">
              <button class="dialog-cancel" type="button" :disabled="saving" @click="emit('close')">Cancelar</button>
              <button v-if="!isClosed" class="dialog-save" type="button" :disabled="saving || !form.monthKey" @click="submit">{{ saving ? "Salvando..." : mode === "create" ? "Criar salário" : "Salvar salário" }}</button>
            </div>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
