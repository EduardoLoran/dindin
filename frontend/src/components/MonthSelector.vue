<script setup>
import { computed } from "vue";
import { Listbox, ListboxButton, ListboxLabel, ListboxOption, ListboxOptions, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";
import { formatCurrency, formatMonth } from "../utils/formatters";

const props = defineProps({
  modelValue: { type: String, default: "" },
  months: { type: Array, default: () => [] },
  disabled: Boolean,
  label: { type: String, default: "Mês de referência" },
  deletable: Boolean,
  deleteDisabled: Boolean,
  deleteTitle: { type: String, default: "Excluir período selecionado" },
});
const emit = defineEmits(["update:modelValue", "change", "delete"]);
const options = computed(() => props.months.length ? props.months : [{ monthKey: props.modelValue }]);
const selectedOption = computed(() => options.value.find((month) => month.monthKey === props.modelValue) || null);

function select(monthKey) {
  emit("update:modelValue", monthKey);
  emit("change", monthKey);
}
</script>

<template>
  <Listbox :model-value="modelValue" :disabled="disabled" @update:model-value="select">
    <div class="month-select">
      <ListboxLabel>{{ label }}</ListboxLabel>
      <div class="month-select__controls">
        <ListboxButton class="month-select__button" :class="{ 'is-closed': selectedOption?.isClosed }">
          <span class="month-select__icon"><AppIcon name="calendar" :size="19" /></span>
          <span class="month-select__copy">
            <strong><span>{{ formatMonth(modelValue) }}</span></strong>
            <small v-if="selectedOption?.isClosed" class="is-closed"><em>Fechado</em></small>
            <small v-else>{{ months.length ? `${months.length} mês(es) no histórico` : "Mês atual" }}</small>
          </span>
          <AppIcon class="month-select__chevron" name="chevron-down" :size="17" />
        </ListboxButton>
        <button v-if="deletable" class="month-select__delete" type="button" :disabled="disabled || deleteDisabled" :title="deleteTitle" :aria-label="deleteTitle" @click="emit('delete')">
          <AppIcon name="trash" :size="17" />
        </button>
      </div>
      <TransitionRoot enter="menu-transition" enter-from="menu-hidden" enter-to="menu-visible" leave="menu-transition" leave-from="menu-visible" leave-to="menu-hidden">
        <ListboxOptions class="month-select__options">
          <div class="month-select__options-head"><span>Selecionar período</span><small>{{ options.length }} disponível(is)</small></div>
          <ListboxOption v-for="month in options" :key="month.monthKey" v-slot="{ active, selected }" :value="month.monthKey" as="template">
            <li :class="{ 'is-active': active, 'is-selected': selected }">
              <span><b><span>{{ formatMonth(month.monthKey) }}</span><em v-if="month.isClosed">Fechado</em></b><small v-if="month.salary !== undefined">Base: {{ formatCurrency(month.salary) }}</small></span>
              <span class="month-select__check"><AppIcon v-if="selected" name="check" :size="16" /></span>
            </li>
          </ListboxOption>
        </ListboxOptions>
      </TransitionRoot>
    </div>
  </Listbox>
</template>
