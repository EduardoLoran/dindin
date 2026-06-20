<script setup>
import { computed } from "vue";
import { Listbox, ListboxButton, ListboxLabel, ListboxOption, ListboxOptions } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";

const props = defineProps({ label: String, modelValue: { type: Array, default: () => [] }, options: { type: Array, default: () => [] } });
const emit = defineEmits(["update:modelValue"]);
const displayLabel = computed(() => !props.modelValue.length ? "Todos" : props.modelValue.length === 1 ? props.options.find((option) => option.value === props.modelValue[0])?.label : `${props.modelValue.length} selecionados`);

function update(values) {
  emit("update:modelValue", values);
}
</script>

<template>
  <Listbox :model-value="modelValue" multiple @update:model-value="update">
    <div class="multi-filter"><ListboxLabel>{{ label }}</ListboxLabel><ListboxButton class="multi-filter__button"><span>{{ displayLabel }}</span><AppIcon name="chevron-down" :size="15" /></ListboxButton><ListboxOptions class="multi-filter__options"><button type="button" class="multi-filter__all" @click.stop="update([])"><span :class="{ 'is-checked': !modelValue.length }"><AppIcon v-if="!modelValue.length" name="check" :size="14" /></span>Todos</button><ListboxOption v-for="option in options" :key="option.value" v-slot="{ selected, active }" :value="option.value" as="template"><li :class="{ 'is-active': active }"><span :class="{ 'is-checked': selected }"><AppIcon v-if="selected" name="check" :size="14" /></span>{{ option.label }}</li></ListboxOption></ListboxOptions></div>
  </Listbox>
</template>
