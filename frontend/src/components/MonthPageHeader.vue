<script setup>
defineProps({ eyebrow: String, title: String, description: String, payload: Object, selectedMonth: String, refreshing: Boolean });
</script>

<template>
  <header class="workspace-hero">
    <div><p class="dashboard-eyebrow">{{ eyebrow }}</p><h1>{{ title }}</h1><p>{{ description }}</p></div>
  </header>
</template>
