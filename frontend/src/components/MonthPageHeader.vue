<script setup>
import MonthSelector from "./MonthSelector.vue";

defineProps({ eyebrow: String, title: String, description: String, payload: Object, selectedMonth: String, refreshing: Boolean });
const emit = defineEmits(["change-month"]);
</script>

<template>
  <header class="workspace-hero">
    <div><p class="dashboard-eyebrow">{{ eyebrow }}</p><h1>{{ title }}</h1><p>{{ description }}</p></div>
    <MonthSelector :model-value="selectedMonth" :months="payload?.months || []" :disabled="refreshing" @change="emit('change-month', $event)" />
  </header>
</template>
