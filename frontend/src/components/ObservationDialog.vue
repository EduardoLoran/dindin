<script setup>
import { ref, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";

const props = defineProps({ open: Boolean, template: { type: Object, default: null }, saving: Boolean, error: { type: String, default: "" } });
const emit = defineEmits(["close", "save"]);
const observation = ref("");

watch(() => props.open, (open) => { if (open) observation.value = props.template?.observation || ""; });
</script>

<template>
  <TransitionRoot :show="open" as="template">
    <Dialog class="dialog-root" @close="saving ? undefined : emit('close')">
      <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden"><div class="dialog-backdrop"></div></TransitionChild>
      <div class="dialog-positioner"><TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden">
        <DialogPanel class="dialog-panel observation-dialog">
          <div class="dialog-heading"><div class="dialog-panel__icon"><AppIcon name="note" :size="23" /></div><button type="button" aria-label="Fechar" :disabled="saving" @click="emit('close')"><AppIcon name="close" /></button></div>
          <DialogTitle>Observação</DialogTitle><p>Registre detalhes importantes sobre <strong>{{ template?.name }}</strong>.</p>
          <label for="template-observation">Anotação</label><textarea id="template-observation" v-model="observation" rows="6" maxlength="800" placeholder="Informações úteis para consultar depois..." :disabled="saving"></textarea>
          <div class="observation-counter">{{ observation.length }}/800</div>
          <p v-if="error" class="dialog-error" role="alert">{{ error }}</p>
          <div class="dialog-actions"><button class="dialog-cancel" type="button" :disabled="saving" @click="emit('close')">Cancelar</button><button class="dialog-save" type="button" :disabled="saving" @click="emit('save', observation.trim())">{{ saving ? "Salvando..." : "Salvar observação" }}</button></div>
        </DialogPanel>
      </TransitionChild></div>
    </Dialog>
  </TransitionRoot>
</template>
