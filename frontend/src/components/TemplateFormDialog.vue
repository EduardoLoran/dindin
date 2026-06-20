<script setup>
import { computed, reactive, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, Switch, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  template: { type: Object, default: null },
  monthKey: { type: String, required: true },
  saving: { type: Boolean, default: false },
  error: { type: String, default: "" },
});

const emit = defineEmits(["close", "save"]);
const form = reactive({
  name: "",
  amount: "",
  cycle: "Inicio Do Mes",
  paymentMethod: "",
  startMonth: "",
  isVariable: true,
});
const errors = reactive({ name: "", amount: "", paymentMethod: "" });
const isEditing = computed(() => Boolean(props.template?.id));

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

watch(() => props.open, (open) => {
  if (!open) return;
  const template = props.template;
  form.name = template?.name || "";
  form.amount = template ? moneyFormatter.format(Number(template.amount) || 0) : "";
  form.cycle = template?.cycle || "Inicio Do Mes";
  form.paymentMethod = template?.paymentMethod || "";
  form.startMonth = template?.startMonth || props.monthKey;
  form.isVariable = template ? Boolean(template.isVariable) : true;
  Object.keys(errors).forEach((key) => { errors[key] = ""; });
});

function parseMoney(value) {
  const normalized = String(value || "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  return Number(normalized);
}

function submit() {
  const amount = parseMoney(form.amount);
  errors.name = form.name.trim() ? "" : "Informe um nome.";
  errors.amount = Number.isFinite(amount) && amount > 0 ? "" : "Informe um valor maior que zero.";
  errors.paymentMethod = form.paymentMethod ? "" : "Selecione a forma de pagamento.";
  if (Object.values(errors).some(Boolean)) return;

  emit("save", {
    name: form.name.trim(),
    amount,
    cycle: form.cycle,
    paymentMethod: form.paymentMethod,
    startMonth: form.startMonth || props.monthKey,
    isVariable: form.isVariable,
  });
}
</script>

<template>
  <TransitionRoot :show="open" as="template">
    <Dialog class="dialog-root" @close="saving ? undefined : emit('close')">
      <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden">
        <div class="dialog-backdrop"></div>
      </TransitionChild>
      <div class="dialog-positioner">
        <TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden">
          <DialogPanel class="dialog-panel template-form-dialog">
            <div class="dialog-heading">
              <div class="dialog-panel__icon"><AppIcon :name="isEditing ? 'edit' : 'plus'" :size="23" /></div>
              <button type="button" aria-label="Fechar" :disabled="saving" @click="emit('close')"><AppIcon name="close" /></button>
            </div>
            <DialogTitle>{{ isEditing ? "Editar cadastro" : "Novo cadastro" }}</DialogTitle>
            <p>{{ isEditing ? "Atualize as informações do gasto recorrente." : "Crie uma base para gerar seus lançamentos mensais." }}</p>

            <form class="template-form" novalidate @submit.prevent="submit">
              <div class="template-field template-field--full">
                <label for="template-name">Nome do gasto</label>
                <input id="template-name" v-model="form.name" type="text" autocomplete="off" placeholder="Ex.: Aluguel" :aria-invalid="Boolean(errors.name)" :disabled="saving" />
                <small v-if="errors.name" role="alert">{{ errors.name }}</small>
              </div>

              <div class="template-field">
                <label for="template-amount">Valor padrão</label>
                <div class="template-money"><span>R$</span><input id="template-amount" v-model="form.amount" inputmode="decimal" autocomplete="off" placeholder="0,00" :aria-invalid="Boolean(errors.amount)" :disabled="saving" /></div>
                <small v-if="errors.amount" role="alert">{{ errors.amount }}</small>
              </div>

              <div class="template-field">
                <label for="template-cycle">Ciclo</label>
                <select id="template-cycle" v-model="form.cycle" :disabled="saving"><option value="Inicio Do Mes">Início do mês</option><option value="Quinzena">Quinzena</option></select>
              </div>

              <div class="template-field">
                <label for="template-payment">Forma de pagamento</label>
                <select id="template-payment" v-model="form.paymentMethod" :aria-invalid="Boolean(errors.paymentMethod)" :disabled="saving"><option value="" disabled>Selecione</option><option value="Pix">Pix</option><option value="Boleto">Boleto</option><option value="Outros">Outros</option></select>
                <small v-if="errors.paymentMethod" role="alert">{{ errors.paymentMethod }}</small>
              </div>

              <div v-if="isEditing" class="template-field">
                <label for="template-start">Válido desde</label>
                <input id="template-start" v-model="form.startMonth" type="month" :disabled="saving" />
              </div>

              <div class="template-switch-row template-field--full">
                <div><strong>Valor varia todo mês</strong><span>Permite ajustar o valor em cada lançamento mensal.</span></div>
                <Switch v-model="form.isVariable" class="template-switch" :class="{ 'is-active': form.isVariable }" :disabled="saving"><span></span></Switch>
              </div>

              <p v-if="error" class="dialog-error template-field--full" role="alert">{{ error }}</p>
              <div class="dialog-actions template-field--full"><button class="dialog-cancel" type="button" :disabled="saving" @click="emit('close')">Cancelar</button><button class="dialog-save" type="submit" :disabled="saving">{{ saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar cadastro" }}</button></div>
            </form>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
