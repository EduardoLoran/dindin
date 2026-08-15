<script setup>
import { ref, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";
import { formatCurrency } from "../utils/formatters";

const props = defineProps({
  open: Boolean,
  entry: { type: Object, default: null },
  saving: Boolean,
  readonly: Boolean,
  error: { type: String, default: "" },
});

const emit = defineEmits(["close", "save", "edit-observation"]);
const status = ref("pending");

const statusOptions = [
  { value: "pending", label: "Pendente", description: "O pagamento ainda precisa ser concluído.", icon: "clock" },
  { value: "paid", label: "Pago", description: "O valor já foi quitado neste mês.", icon: "check" },
  { value: "saved", label: "Guardado", description: "O valor foi separado ou reservado.", icon: "wallet" },
];

watch(() => props.open, (open) => {
  if (open) status.value = props.entry?.status || "pending";
});

function cycleLabel(value) {
  return value === "Inicio Do Mes" ? "Início do mês" : value || "Não informado";
}
</script>

<template>
  <TransitionRoot :show="open" as="template">
    <Dialog class="dialog-root" @close="saving ? undefined : emit('close')">
      <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden"><div class="dialog-backdrop"></div></TransitionChild>
      <div class="entry-editor-positioner">
        <TransitionChild as="template" enter="entry-drawer-transition" enter-from="entry-drawer-hidden" enter-to="entry-drawer-visible" leave="entry-drawer-transition" leave-from="entry-drawer-visible" leave-to="entry-drawer-hidden">
          <DialogPanel class="dialog-panel entry-editor-dialog">
            <header class="entry-editor-dialog__header">
              <div><span><AppIcon name="edit" :size="19" /></span><div><small>Editar lançamento</small><DialogTitle>{{ entry?.name }}</DialogTitle></div></div>
              <button type="button" aria-label="Fechar" :disabled="saving" @click="emit('close')"><AppIcon name="close" /></button>
            </header>

            <section class="entry-editor-summary" aria-label="Informações do lançamento">
              <div><small>Valor</small><strong>{{ formatCurrency(Number(entry?.amount) || 0) }}</strong></div>
              <div><small>Ciclo</small><strong>{{ cycleLabel(entry?.cycle) }}</strong></div>
              <div><small>Pagamento</small><strong>{{ entry?.paymentMethod || "Não informado" }}</strong></div>
              <div><small>Tipo</small><strong>{{ entry?.isVariable ? "Variável" : "Fixo" }}</strong></div>
            </section>

            <section class="entry-editor-section">
              <div class="entry-editor-section__heading"><div><h3>Status</h3><p>{{ readonly ? "Mês fechado para consulta." : "Selecione a situação atual deste lançamento." }}</p></div><span v-if="readonly">Somente leitura</span></div>
              <div class="entry-status-options">
                <button v-for="option in statusOptions" :key="option.value" type="button" :class="[`is-${option.value}`, { 'is-selected': status === option.value }]" :disabled="readonly || saving" @click="status = option.value">
                  <span><AppIcon :name="option.icon" :size="18" /></span>
                  <div><strong>{{ option.label }}</strong><small>{{ option.description }}</small></div>
                  <i aria-hidden="true"></i>
                </button>
              </div>
            </section>

            <section class="entry-editor-observation">
              <div><span><AppIcon name="note" :size="18" /></span><div><strong>Observação</strong><p>{{ entry?.observation || "Nenhuma observação adicionada." }}</p></div></div>
              <button type="button" :disabled="saving" @click="emit('edit-observation')">{{ readonly ? "Visualizar" : entry?.observation ? "Editar" : "Adicionar" }}</button>
            </section>

            <p v-if="error" class="dialog-error" role="alert">{{ error }}</p>
            <footer class="entry-editor-dialog__footer">
              <button class="dialog-cancel" type="button" :disabled="saving" @click="emit('close')">Fechar</button>
              <button v-if="!readonly" class="dialog-save" type="button" :disabled="saving || status === entry?.status" @click="emit('save', status)">{{ saving ? "Salvando..." : "Salvar status" }}</button>
            </footer>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
