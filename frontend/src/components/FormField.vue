<script setup>
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
  type: {
    type: String,
    default: "text",
  },
  autocomplete: {
    type: String,
    default: "off",
  },
  placeholder: {
    type: String,
    default: "",
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
</script>

<template>
  <div class="form-field" :class="{ 'form-field--invalid': error }">
    <label :for="id">{{ label }}</label>
    <div class="form-field__control">
      <span class="form-field__icon" aria-hidden="true">
        <slot name="icon"></slot>
      </span>
      <input
        :id="id"
        :value="modelValue"
        :type="type"
        :autocomplete="autocomplete"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        :aria-invalid="Boolean(error)"
        :aria-describedby="error ? `${id}-error` : undefined"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <span v-if="$slots.action" class="form-field__action">
        <slot name="action"></slot>
      </span>
    </div>
    <span v-if="error" :id="`${id}-error`" class="form-field__error">{{ error }}</span>
  </div>
</template>
