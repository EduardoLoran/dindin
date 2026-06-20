<script setup>
import AppIcon from "./AppIcon.vue";

defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  meta: { type: String, default: "" },
  icon: { type: String, default: "wallet" },
  tone: { type: String, default: "primary" },
});
</script>

<template>
  <article class="summary-card" :class="`summary-card--${tone}`">
    <div class="summary-card__head"><span><AppIcon :name="icon" /></span><small>{{ label }}</small></div>
    <strong>{{ value }}</strong>
    <p>{{ meta }}</p>
  </article>
</template>
