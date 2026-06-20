<script setup>
import { ref, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  currentValue: { type: Number, default: 0 },
  monthLabel: { type: String, default: "" },
  saving: { type: Boolean, default: false },
  error: { type: String, default: "" },
});

const emit = defineEmits(["close", "save"]);
const salary = ref("");

const inputFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

watch(() => props.open, (open) => {
  if (open) salary.value = inputFormatter.format(Number(props.currentValue) || 0);
});

function parseValue() {
  const normalized = salary.value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  return Number(normalized) || 0;
}
</script>

<template>
  <TransitionRoot :show="open" as="template">
    <Dialog class="dialog-root" @close="saving ? undefined : emit('close')">
      <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden"><div class="dialog-backdrop"></div></TransitionChild>
      <div class="dialog-positioner">
        <TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden">
          <DialogPanel class="dialog-panel">
            <div class="dialog-panel__icon"><AppIcon name="wallet" :size="24" /></div>
            <DialogTitle>Atualizar salário</DialogTitle>
            <p>Defina a base financeira de {{ monthLabel }}.</p>
            <label for="salary-value">Salário do mês</label>
            <div class="money-input"><span>R$</span><input id="salary-value" v-model="salary" inputmode="decimal" autocomplete="off" :disabled="saving" @keydown.enter.prevent="emit('save', parseValue())" /></div>
            <p v-if="error" class="dialog-error" role="alert">{{ error }}</p>
            <div class="dialog-actions"><button class="dialog-cancel" type="button" :disabled="saving" @click="emit('close')">Cancelar</button><button class="dialog-save" type="button" :disabled="saving" @click="emit('save', parseValue())">{{ saving ? "Salvando..." : "Salvar salário" }}</button></div>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
