<script setup>
import { ref } from "vue";
import { RouterLink } from "vue-router";
import { requestPasswordReset } from "../api/auth";
import FormField from "../components/FormField.vue";
import StatusMessage from "../components/StatusMessage.vue";

const email = ref("");
const fieldError = ref("");
const requestError = ref("");
const notice = ref("");
const submitting = ref(false);

async function submit() {
  fieldError.value = "";
  requestError.value = "";
  notice.value = "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    fieldError.value = "Informe um e-mail válido.";
    return;
  }

  submitting.value = true;
  try {
    const payload = await requestPasswordReset(email.value.trim());
    notice.value = payload.message;
  } catch (error) {
    requestError.value = error.message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="auth-view" aria-labelledby="forgot-title">
    <header class="auth-view__header">
      <p class="auth-view__eyebrow">Recuperação de acesso</p>
      <h2 id="forgot-title">Esqueceu sua senha?</h2>
      <p>Informe seu e-mail para receber um link seguro.</p>
    </header>

    <form class="auth-form" novalidate @submit.prevent="submit">
      <StatusMessage :message="requestError" />
      <StatusMessage :message="notice" type="success" />

      <FormField id="recovery-email" v-model="email" label="E-mail" type="email" autocomplete="email" placeholder="voce@exemplo.com" :error="fieldError" :disabled="submitting || Boolean(notice)" required @update:model-value="fieldError = ''; requestError = ''">
        <template #icon><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m5 8 7 5 7-5" /></svg></template>
      </FormField>

      <button v-if="!notice" class="primary-button" type="submit" :disabled="submitting">
        <span v-if="submitting" class="button-spinner" aria-hidden="true"></span>
        {{ submitting ? "Enviando..." : "Enviar link" }}
      </button>

      <RouterLink class="secondary-button" to="/login">Voltar para o login</RouterLink>
    </form>
  </section>
</template>
