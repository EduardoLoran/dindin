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
});
const emit = defineEmits(["update:modelValue", "change"]);
const options = computed(() => props.months.length ? props.months : [{ monthKey: props.modelValue }]);

function select(monthKey) {
  emit("update:modelValue", monthKey);
  emit("change", monthKey);
}
</script>

<template>
  <Listbox :model-value="modelValue" :disabled="disabled" @update:model-value="select">
    <div class="month-select">
      <ListboxLabel>{{ label }}</ListboxLabel>
      <ListboxButton class="month-select__button">
        <span class="month-select__icon"><AppIcon name="calendar" :size="19" /></span>
        <span class="month-select__copy"><strong>{{ formatMonth(modelValue) }}</strong><small>{{ months.length ? `${months.length} mês(es) no histórico` : "Mês atual" }}</small></span>
        <AppIcon class="month-select__chevron" name="chevron-down" :size="17" />
      </ListboxButton>
      <TransitionRoot enter="menu-transition" enter-from="menu-hidden" enter-to="menu-visible" leave="menu-transition" leave-from="menu-visible" leave-to="menu-hidden">
        <ListboxOptions class="month-select__options">
          <div class="month-select__options-head"><span>Selecionar período</span><small>{{ options.length }} disponível(is)</small></div>
          <ListboxOption v-for="month in options" :key="month.monthKey" v-slot="{ active, selected }" :value="month.monthKey" as="template">
            <li :class="{ 'is-active': active, 'is-selected': selected }">
              <span><b>{{ formatMonth(month.monthKey) }}</b><small v-if="month.salary !== undefined">Base: {{ formatCurrency(month.salary) }}</small></span>
              <span class="month-select__check"><AppIcon v-if="selected" name="check" :size="16" /></span>
            </li>
          </ListboxOption>
        </ListboxOptions>
      </TransitionRoot>
    </div>
  </Listbox>
</template>
