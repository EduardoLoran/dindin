<script setup>
import { ref, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";

const props = defineProps({ open: Boolean, entry: { type: Object, default: null }, saving: Boolean, error: { type: String, default: "" } });
const emit = defineEmits(["close", "save"]);
const value = ref("");
watch(() => props.open, (open) => { if (open) value.value = props.entry?.observation || ""; });
</script>

<template><TransitionRoot :show="open" as="template"><Dialog class="dialog-root" @close="saving ? undefined : emit('close')"><TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden"><div class="dialog-backdrop"></div></TransitionChild><div class="dialog-positioner"><TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden"><DialogPanel class="dialog-panel observation-dialog"><div class="dialog-heading"><div class="dialog-panel__icon"><AppIcon name="note" /></div><button type="button" aria-label="Fechar" @click="emit('close')"><AppIcon name="close" /></button></div><DialogTitle>Observação do lançamento</DialogTitle><p>Adicione contexto para <strong>{{ entry?.name }}</strong>.</p><label for="entry-observation">Anotação</label><textarea id="entry-observation" v-model="value" rows="6" maxlength="800"></textarea><p v-if="error" class="dialog-error" role="alert">{{ error }}</p><div class="dialog-actions"><button class="dialog-cancel" type="button" @click="emit('close')">Cancelar</button><button class="dialog-save" type="button" :disabled="saving" @click="emit('save', value.trim())">{{ saving ? "Salvando..." : "Salvar observação" }}</button></div></DialogPanel></TransitionChild></div></Dialog></TransitionRoot></template>
