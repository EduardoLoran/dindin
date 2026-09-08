<script setup>
import { computed, ref, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  monthLabel: { type: String, default: "este período" },
  entryCount: { type: Number, default: 0 },
  busy: { type: Boolean, default: false },
  error: { type: String, default: "" },
});
const emit = defineEmits(["close", "confirm"]);
const confirmation = ref("");
const canConfirm = computed(() => confirmation.value.trim().toLocaleUpperCase("pt-BR") === "EXCLUIR");

watch(() => props.open, (open) => {
  if (open) confirmation.value = "";
});

function close() {
  if (!props.busy) emit("close");
}

function confirm() {
  if (!props.busy && canConfirm.value) emit("confirm");
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
          <DialogPanel class="dialog-panel delete-month-dialog">
            <div class="dialog-heading"><div class="dialog-panel__icon dialog-panel__icon--danger"><AppIcon name="trash" :size="23" /></div><button type="button" aria-label="Fechar" :disabled="busy" @click="close"><AppIcon name="close" /></button></div>
            <DialogTitle>Excluir {{ monthLabel }}?</DialogTitle>
            <p>Você está prestes a excluir permanentemente o período selecionado.</p>

            <section class="delete-month-impact">
              <div><AppIcon name="calendar" :size="19" /><span><small>Período</small><strong>{{ monthLabel }}</strong></span></div>
              <div><AppIcon name="entries" :size="19" /><span><small>Lançamentos vinculados</small><strong>{{ entryCount }} {{ entryCount === 1 ? "lançamento" : "lançamentos" }}</strong></span></div>
            </section>

            <div class="delete-month-warning">
              <AppIcon name="alert" :size="19" />
              <div><strong>Esta ação não pode ser desfeita.</strong><p>O período, o salário e todos os seus gastos e receitas deixarão de aparecer na Visão geral, Cadastros, Lançamentos e Detalhes. Vínculos de importações bancárias desse mês também serão liberados.</p></div>
            </div>

            <p class="delete-month-note">Os cadastros recorrentes não serão apagados. Se começaram neste período, passarão a valer a partir do mês seguinte.</p>

            <label class="delete-month-confirmation">
              <span class="delete-month-confirmation__heading">
                <i>!</i>
                <span><strong>Confirmação final</strong><small>Digite <b>EXCLUIR</b> para liberar o botão abaixo.</small></span>
              </span>
              <span class="delete-month-confirmation__field" :class="{ 'is-valid': canConfirm }">
                <input v-model="confirmation" type="text" autocomplete="off" :disabled="busy" aria-label="Digite EXCLUIR para confirmar" placeholder="Digite EXCLUIR" @keydown.enter.prevent="confirm" />
                <AppIcon v-if="canConfirm" name="check" :size="19" />
              </span>
            </label>
            <p v-if="error" class="workspace-error" role="alert">{{ error }}</p>

            <div class="dialog-actions"><button class="dialog-cancel" type="button" :disabled="busy" @click="close">Cancelar</button><button class="dialog-danger" type="button" :disabled="busy || !canConfirm" @click="confirm">{{ busy ? "Excluindo período..." : "Excluir período" }}</button></div>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
