<script setup>
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";

defineProps({ open: Boolean, title: { type: String, default: "Confirmar ação" }, message: { type: String, default: "" }, confirmLabel: { type: String, default: "Inativar cadastro" }, busy: Boolean });
const emit = defineEmits(["close", "confirm"]);
</script>

<template>
  <TransitionRoot :show="open" as="template"><Dialog class="dialog-root" @close="busy ? undefined : emit('close')">
    <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden"><div class="dialog-backdrop"></div></TransitionChild>
    <div class="dialog-positioner"><TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden">
      <DialogPanel class="dialog-panel confirm-dialog"><div class="dialog-panel__icon dialog-panel__icon--danger"><AppIcon name="trash" :size="23" /></div><DialogTitle>{{ title }}</DialogTitle><p>{{ message }}</p><div class="dialog-actions"><button class="dialog-cancel" type="button" :disabled="busy" @click="emit('close')">Cancelar</button><button class="dialog-danger" type="button" :disabled="busy" @click="emit('confirm')">{{ busy ? "Processando..." : confirmLabel }}</button></div></DialogPanel>
    </TransitionChild></div>
  </Dialog></TransitionRoot>
</template>
