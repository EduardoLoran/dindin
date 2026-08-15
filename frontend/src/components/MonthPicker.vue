<script setup>
import { computed, ref, watch } from "vue";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import { ptBR } from "date-fns/locale";
import AppIcon from "./AppIcon.vue";
import { useTheme } from "../composables/useTheme";

const props = defineProps({
  modelValue: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  inputId: { type: String, default: "month-picker" },
});

const emit = defineEmits(["update:modelValue"]);
const pickerValue = ref(toPickerValue(props.modelValue));
const { isDark } = useTheme();
const formattedMonth = computed(() => {
  const value = pickerValue.value;
  if (!value || !Number.isInteger(value.year) || !Number.isInteger(value.month)) return "Selecione um mês";
  const formatted = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(value.year, value.month, 1));
  return `${formatted.charAt(0).toLocaleUpperCase("pt-BR")}${formatted.slice(1)}`;
});
const ariaLabels = {
  toggleOverlay: "Alternar seleção",
  menu: "Seletor de mês",
  input: "Escolher mês de referência",
  openTimePicker: "Abrir seletor de horário",
  closeTimePicker: "Fechar seletor de horário",
  incrementValue: (value) => `Aumentar ${value}`,
  decrementValue: (value) => `Diminuir ${value}`,
  openTpOverlay: (value) => `Abrir seleção de ${value}`,
  amPmButton: "Alternar entre AM e PM",
  openYearsOverlay: "Abrir seleção de anos",
  openMonthsOverlay: "Abrir seleção de meses",
  nextMonth: "Próximo mês",
  prevMonth: "Mês anterior",
  nextYear: "Próximo ano",
  prevYear: "Ano anterior",
  clearInput: "Limpar mês",
  calendarIcon: "Abrir calendário",
  timePicker: "Seletor de horário",
  monthPicker: (overlay) => `Seletor de mês${overlay ? " aberto" : ""}`,
  yearPicker: (overlay) => `Seletor de ano${overlay ? " aberto" : ""}`,
  timeOverlay: (value) => `Seleção de ${value}`,
};

watch(() => props.modelValue, (monthKey) => {
  if (toMonthKey(pickerValue.value) !== monthKey) pickerValue.value = toPickerValue(monthKey);
});

watch(pickerValue, (value) => {
  const monthKey = toMonthKey(value);
  if (monthKey !== props.modelValue) emit("update:modelValue", monthKey);
}, { deep: true });

function toPickerValue(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1 };
}

function toMonthKey(value) {
  if (!value || !Number.isInteger(value.year) || !Number.isInteger(value.month)) return "";
  return `${value.year}-${String(value.month + 1).padStart(2, "0")}`;
}
</script>

<template>
  <VueDatePicker
    v-model="pickerValue"
    month-picker
    auto-apply
    centered
    :teleport="true"
    :locale="ptBR"
    :disabled="disabled"
    :dark="isDark"
    :config="{ allowPreventDefault: true, modeHeight: 286 }"
    :formats="{ input: `MMMM 'de' yyyy` }"
    :input-attrs="{ id: inputId, required: true, autocomplete: 'off', clearable: false }"
    :aria-labels="ariaLabels"
    :ui="{ menu: 'dindin-month-menu' }"
    placeholder="Selecione o mês e o ano"
  >
    <template #trigger>
      <button :id="inputId" class="month-picker-trigger" type="button" :disabled="disabled" aria-haspopup="dialog">
        <span class="month-picker-trigger__icon"><AppIcon name="calendar" :size="18" /></span>
        <span class="month-picker-trigger__content"><small>Período selecionado</small><strong>{{ formattedMonth }}</strong></span>
        <span class="month-picker-trigger__arrow"><AppIcon name="chevron-down" :size="17" /></span>
      </button>
    </template>
  </VueDatePicker>
</template>

<style scoped>
.month-picker-trigger { display: grid; width: 100%; min-height: 64px; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 11px; padding: 9px 12px; color: var(--color-text); background: var(--color-surface-soft); border: 1px solid var(--color-border-strong); border-radius: 8px; cursor: pointer; text-align: left; transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast); }
.month-picker-trigger:hover { background: var(--color-info-soft); border-color: color-mix(in srgb, var(--color-primary) 42%, var(--color-border)); }
.month-picker-trigger:focus-visible { outline: 0; border-color: var(--color-primary); box-shadow: 0 0 0 4px var(--color-focus); }
.month-picker-trigger:disabled { cursor: not-allowed; opacity: 0.55; }
.month-picker-trigger__icon { display: grid; width: 38px; height: 38px; color: var(--color-primary); background: var(--color-info-soft); border-radius: 8px; place-items: center; }
.month-picker-trigger__content { display: grid; min-width: 0; gap: 3px; }
.month-picker-trigger__content small { color: var(--color-text-muted); font-size: 0.56rem; font-weight: 700; }
.month-picker-trigger__content strong { overflow: hidden; font-size: 0.72rem; text-overflow: ellipsis; white-space: nowrap; }
.month-picker-trigger__arrow { display: grid; width: 30px; height: 30px; color: var(--color-text-muted); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 7px; place-items: center; }
:global(.dp--menu-wrapper.dp--centered) { inset: 0 !important; display: grid; width: 100vw; height: 100vh; padding: 16px; background: rgba(26, 17, 30, 0.32); transform: none !important; place-items: center; backdrop-filter: blur(3px); }
:global(.dp--theme-light.dindin-month-menu),
:global(.dp--theme-dark.dindin-month-menu) { --dp-primary-color: var(--color-primary); --dp-primary-disabled-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-surface)); --dp-primary-text-color: #fff; --dp-background-color: var(--color-surface); --dp-text-color: var(--color-text); --dp-hover-color: var(--color-info-soft); --dp-hover-text-color: var(--color-primary); --dp-hover-icon-color: var(--color-primary); --dp-icon-color: var(--color-text-muted); --dp-border-color: var(--color-border); --dp-border-color-focus: var(--color-primary); --dp-menu-border-color: var(--color-border); --dp-border-radius: 8px; --dp-cell-border-radius: 6px; --dp-menu-min-width: 320px; --dp-font-family: inherit; position: relative; overflow: hidden; border-radius: 8px; box-shadow: 0 24px 70px rgba(26, 17, 30, 0.28); }
</style>
