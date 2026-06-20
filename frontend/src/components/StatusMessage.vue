<script setup>
import { TransitionRoot } from "@headlessui/vue";

defineProps({
  message: {
    type: String,
    default: "",
  },
  type: {
    type: String,
    default: "error",
    validator: (value) => ["error", "success", "info"].includes(value),
  },
});
</script>

<template>
  <TransitionRoot
    :show="Boolean(message)"
    enter="status-enter"
    enter-from="status-enter-from"
    enter-to="status-enter-to"
    leave="status-leave"
    leave-from="status-leave-from"
    leave-to="status-leave-to"
  >
    <div class="status-message" :class="`status-message--${type}`" role="status" aria-live="polite">
      <svg v-if="type === 'success'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5h.01" />
      </svg>
      <span>{{ message }}</span>
    </div>
  </TransitionRoot>
</template>
