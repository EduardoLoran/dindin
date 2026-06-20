<script setup>
defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 20 },
});
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <template v-if="name === 'home'">
      <path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" />
    </template>
    <template v-else-if="name === 'templates'">
      <rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h8M8 16h5" />
    </template>
    <template v-else-if="name === 'entries'">
      <path d="M4 7h16M4 12h16M4 17h16" /><circle cx="8" cy="7" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="10" cy="17" r="1" />
    </template>
    <template v-else-if="name === 'details'">
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </template>
    <template v-else-if="name === 'fixed'">
      <path d="M4 6h16v14H4zM8 3v6M16 3v6M4 10h16" />
    </template>
    <template v-else-if="name === 'admin'">
      <circle cx="9" cy="8" r="4" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 11l1.2 1.2L21 9.5" />
    </template>
    <template v-else-if="name === 'menu'">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="m6 6 12 12M18 6 6 18" />
    </template>
    <template v-else-if="name === 'chevron-left'">
      <path d="m15 18-6-6 6-6" />
    </template>
    <template v-else-if="name === 'chevron-down'">
      <path d="m7 10 5 5 5-5" />
    </template>
    <template v-else-if="name === 'logout'">
      <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
    </template>
    <template v-else-if="name === 'user'">
      <circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </template>
    <template v-else-if="name === 'wallet'">
      <path d="M4 6.5h15a2 2 0 0 1 2 2V19H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h13v3.5" /><path d="M16 11h5v4h-5a2 2 0 0 1 0-4Z" />
    </template>
    <template v-else-if="name === 'receipt'">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" />
    </template>
    <template v-else-if="name === 'check'">
      <circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" />
    </template>
    <template v-else-if="name === 'clock'">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </template>
    <template v-else-if="name === 'trending'">
      <path d="m4 16 5-5 4 4 7-8M15 7h5v5" />
    </template>
    <template v-else-if="name === 'calendar'">
      <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18" />
    </template>
    <template v-else-if="name === 'arrow-right'">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </template>
    <template v-else-if="name === 'edit'">
      <path d="m4 20 4.2-1 10.6-10.6a2.1 2.1 0 0 0-3-3L5.2 16 4 20ZM13.8 7.4l3 3" />
    </template>
    <template v-else-if="name === 'alert'">
      <path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4M12 17h.01" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14M5 12h14" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
    </template>
    <template v-else-if="name === 'more'">
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'note'">
      <path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6" />
    </template>
  </svg>
</template>

<style scoped>
svg { stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
</style>
