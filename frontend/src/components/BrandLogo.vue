<script setup>
import markUrl from "../assets/dindin-mark.svg";

defineProps({
  compact: {
    type: Boolean,
    default: false,
  },
});
</script>

<template>
  <div class="brand-logo" :class="{ 'brand-logo--compact': compact }" aria-label="Dindin">
    <img :src="markUrl" alt="" class="brand-logo__mark" />
    <span class="brand-logo__name">dindin</span>
  </div>
</template>
