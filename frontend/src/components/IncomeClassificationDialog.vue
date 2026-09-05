<script setup>
import { ref, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";
import { formatCurrency } from "../utils/formatters";

const props = defineProps({ open: Boolean, entry: { type: Object, default: null }, saving: Boolean, readonly: Boolean, error: { type: String, default: "" } });
const emit = defineEmits(["close", "save"]);
const isSalary = ref(false);

watch(() => props.open, (open) => { if (open) isSalary.value = Boolean(props.entry?.isSalary); });
</script>

<template>
  <TransitionRoot :show="open" as="template"><Dialog class="dialog-root" @close="saving ? undefined : emit('close')">
    <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden"><div class="dialog-backdrop"></div></TransitionChild>
    <div class="dialog-positioner"><TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden">
      <DialogPanel class="dialog-panel income-classification-dialog"><div class="dialog-panel__icon"><AppIcon name="income" /></div><DialogTitle>Classificar receita</DialogTitle><p>{{ entry?.name }} · {{ formatCurrency(entry?.amount) }}</p>
        <div class="income-classification-options">
          <button type="button" :class="{ 'is-selected': !isSalary }" :disabled="readonly || saving" @click="isSalary = false"><span><AppIcon name="income" /></span><div><strong>Receita extra</strong><small>Valor recebido fora do salário mensal.</small></div></button>
          <button type="button" :class="{ 'is-selected': isSalary }" :disabled="readonly || saving" @click="isSalary = true"><span><AppIcon name="wallet" /></span><div><strong>Salário</strong><small>Compõe o salário e o total disponível do período.</small></div></button>
        </div>
        <p v-if="error" class="dialog-error" role="alert">{{ error }}</p>
        <div class="dialog-actions"><button class="dialog-cancel" type="button" :disabled="saving" @click="emit('close')">Cancelar</button><button v-if="!readonly" class="dialog-save" type="button" :disabled="saving || isSalary === Boolean(entry?.isSalary)" @click="emit('save', isSalary)">{{ saving ? "Salvando..." : "Salvar classificação" }}</button></div>
      </DialogPanel>
    </TransitionChild></div>
  </Dialog></TransitionRoot>
</template>
