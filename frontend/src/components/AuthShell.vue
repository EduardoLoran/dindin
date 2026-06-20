<script setup>
import BrandLogo from "./BrandLogo.vue";
import ThemeToggle from "./ThemeToggle.vue";
</script>

<template>
  <main class="auth-shell">
    <section class="auth-brand" aria-label="Dindin">
      <div class="auth-brand__orb auth-brand__orb--top" aria-hidden="true"></div>
      <div class="auth-brand__rings" aria-hidden="true"></div>
      <div class="auth-brand__content">
        <BrandLogo />
        <h1>Bem-vindo ao <span>Dindin</span></h1>
      </div>
      <div class="auth-brand__waves" aria-hidden="true">
        <i v-for="index in 7" :key="index"></i>
      </div>
    </section>

    <section class="auth-workspace">
      <ThemeToggle />
      <div class="auth-workspace__mobile-brand">
        <BrandLogo compact />
      </div>
      <div class="auth-workspace__content">
        <slot />
      </div>
    </section>
  </main>
</template>
