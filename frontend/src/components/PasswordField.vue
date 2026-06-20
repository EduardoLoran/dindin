<script setup>
import { ref } from "vue";
import FormField from "./FormField.vue";

defineProps({
  id: {
    type: String,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  modelValue: {
    type: String,
    default: "",
  },
  autocomplete: {
    type: String,
    default: "current-password",
  },
  placeholder: {
    type: String,
    default: "Digite sua senha",
  },
  error: {
    type: String,
    default: "",
  },
  required: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

defineEmits(["update:modelValue"]);

const visible = ref(false);
</script>

<template>
  <FormField
    :id="id"
    :model-value="modelValue"
    :label="label"
    :type="visible ? 'text' : 'password'"
    :autocomplete="autocomplete"
    :placeholder="placeholder"
    :error="error"
    :required="required"
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #icon>
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </svg>
    </template>
    <template #action>
      <button
        type="button"
        class="password-toggle"
        :aria-label="visible ? 'Ocultar senha' : 'Mostrar senha'"
        :title="visible ? 'Ocultar senha' : 'Mostrar senha'"
        @click="visible = !visible"
      >
        <svg v-if="visible" viewBox="0 0 24 24" fill="none">
          <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.6 10.6 0 0 1 12 4c5.5 0 9 5.5 9 5.5a15.5 15.5 0 0 1-2.1 2.6M6.6 6.7C4.2 8.2 3 10 3 10s3.5 5.5 9 5.5c1 0 2-.2 2.8-.5" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none">
          <path d="M3 12s3.5-5.5 9-5.5 9 5.5 9 5.5-3.5 5.5-9 5.5S3 12 3 12Z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      </button>
    </template>
  </FormField>
</template>
