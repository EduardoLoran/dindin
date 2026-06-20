<script setup>
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import AuthShell from "./components/AuthShell.vue";
import DashboardShell from "./components/DashboardShell.vue";

const route = useRoute();
const activeLayout = computed(() => route.meta.layout === "dashboard" ? DashboardShell : AuthShell);
</script>

<template>
  <component :is="activeLayout">
    <RouterView v-slot="{ Component, route }">
      <Transition name="route" mode="out-in">
        <component :is="Component" :key="route.fullPath" />
      </Transition>
    </RouterView>
  </component>
</template>
