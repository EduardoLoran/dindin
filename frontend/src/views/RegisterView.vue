<script setup>
import { reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import { register } from "../api/auth";
import TurnstileWidget from "../components/TurnstileWidget.vue";
import FormField from "../components/FormField.vue";
import PasswordField from "../components/PasswordField.vue";
import StatusMessage from "../components/StatusMessage.vue";

const form = reactive({
  displayName: "",
  username: "",
  email: "",
  password: "",
  passwordConfirmation: "",
});
const errors = reactive({});
const submitting = ref(false);
const requestError = ref("");
const turnstile = ref(null);

function clearError(field) {
  errors[field] = "";
  requestError.value = "";
}

function validate() {
  Object.keys(errors).forEach((key) => delete errors[key]);
  if (form.displayName.trim().length < 3) errors.displayName = "Informe um nome com pelo menos 3 caracteres.";
  if (!/^[a-zA-Z0-9._-]{3,24}$/.test(form.username.trim())) errors.username = "Use de 3 a 24 letras, números, ponto, traço ou underline.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Informe um e-mail válido.";
  if (form.password.length < 12) errors.password = "A senha deve ter pelo menos 12 caracteres.";
  if (form.passwordConfirmation !== form.password) errors.passwordConfirmation = "As senhas não coincidem.";
  return !Object.keys(errors).length;
}

async function submit() {
  requestError.value = "";
  if (!validate()) return;

  submitting.value = true;
  try {
    await register({
      displayName: form.displayName.trim(),
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      passwordConfirmation: form.passwordConfirmation,
      turnstileToken: turnstile.value?.getToken() || "",
    });
    window.location.assign("/visao-geral");
  } catch (error) {
    requestError.value = error.message;
    turnstile.value?.reset();
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="auth-view auth-view--wide" aria-labelledby="register-title">
    <header class="auth-view__header">
      <p class="auth-view__eyebrow">Comece agora</p>
      <h2 id="register-title">Crie sua conta</h2>
      <p>Seus dados financeiros ficam separados e protegidos.</p>
    </header>

    <form class="auth-form auth-form--register" novalidate @submit.prevent="submit">
      <StatusMessage :message="requestError" />

      <div class="auth-form__grid">
        <FormField id="display-name" v-model="form.displayName" label="Nome" autocomplete="name" placeholder="Como devemos chamar você?" :error="errors.displayName" :disabled="submitting" required @update:model-value="clearError('displayName')">
          <template #icon><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg></template>
        </FormField>
        <FormField id="register-username" v-model="form.username" label="Usuário" autocomplete="username" placeholder="Escolha seu usuário" :error="errors.username" :disabled="submitting" required @update:model-value="clearError('username')">
          <template #icon><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14M5 12h14M5 17h14" /></svg></template>
        </FormField>
      </div>

      <FormField id="email" v-model="form.email" label="E-mail" type="email" autocomplete="email" placeholder="voce@exemplo.com" :error="errors.email" :disabled="submitting" required @update:model-value="clearError('email')">
        <template #icon><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m5 8 7 5 7-5" /></svg></template>
      </FormField>

      <div class="auth-form__grid">
        <PasswordField id="register-password" v-model="form.password" label="Senha" autocomplete="new-password" :error="errors.password" :disabled="submitting" required @update:model-value="clearError('password')" />
        <PasswordField id="password-confirmation" v-model="form.passwordConfirmation" label="Confirmar senha" autocomplete="new-password" placeholder="Repita sua senha" :error="errors.passwordConfirmation" :disabled="submitting" required @update:model-value="clearError('passwordConfirmation')" />
      </div>

      <TurnstileWidget ref="turnstile" action="register" />

      <button class="primary-button" type="submit" :disabled="submitting">
        <span v-if="submitting" class="button-spinner" aria-hidden="true"></span>
        {{ submitting ? "Criando conta..." : "Criar conta" }}
      </button>

      <p class="auth-form__switch">Já possui uma conta? <RouterLink to="/login">Voltar para o login</RouterLink></p>
    </form>
  </section>
</template>
