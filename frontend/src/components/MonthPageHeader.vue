<script setup>
defineProps({ eyebrow: String, title: String, description: String, payload: Object, selectedMonth: String, refreshing: Boolean });
</script>

<template>
  <header class="workspace-hero">
    <div><p class="dashboard-eyebrow">{{ eyebrow }}</p><h1>{{ title }} <span v-if="payload?.month?.isClosed" class="month-closed-badge">Mês fechado</span></h1><p>{{ description }}</p></div>
  </header>
</template>
