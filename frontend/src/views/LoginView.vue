<script setup>
import { reactive, ref } from "vue";
import { RouterLink } from "vue-router";
import { login } from "../api/auth";
import TurnstileWidget from "../components/TurnstileWidget.vue";
import FormField from "../components/FormField.vue";
import PasswordField from "../components/PasswordField.vue";
import StatusMessage from "../components/StatusMessage.vue";

const form = reactive({ username: "", password: "" });
const errors = reactive({ username: "", password: "" });
const submitting = ref(false);
const requestError = ref("");
const turnstile = ref(null);

function validate() {
  errors.username = form.username.trim() ? "" : "Informe seu usuário ou e-mail.";
  errors.password = form.password ? "" : "Informe sua senha.";
  return !errors.username && !errors.password;
}

async function submit() {
  requestError.value = "";
  if (!validate()) {
    return;
  }

  submitting.value = true;
  try {
    await login({ username: form.username.trim(), password: form.password, turnstileToken: turnstile.value?.getToken() || "" });
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
  <section class="auth-view" aria-labelledby="login-title">
    <header class="auth-view__header">
      <p class="auth-view__eyebrow">Acesso seguro</p>
      <h2 id="login-title">Faça seu login</h2>
      <p>Acesse sua conta para continuar.</p>
    </header>

    <form class="auth-form" novalidate @submit.prevent="submit">
      <StatusMessage :message="requestError" />

      <FormField
        id="username"
        v-model="form.username"
        label="Usuário ou e-mail"
        autocomplete="username"
        placeholder="Digite seu usuário ou e-mail"
        :error="errors.username"
        :disabled="submitting"
        required
        @update:model-value="errors.username = ''; requestError = ''"
      >
        <template #icon>
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" />
            <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
          </svg>
        </template>
      </FormField>

      <PasswordField
        id="password"
        v-model="form.password"
        label="Senha"
        autocomplete="current-password"
        :error="errors.password"
        :disabled="submitting"
        required
        @update:model-value="errors.password = ''; requestError = ''"
      />

      <TurnstileWidget ref="turnstile" action="login" />

      <div class="auth-form__aside">
        <RouterLink to="/esqueci-senha">Esqueci minha senha</RouterLink>
      </div>

      <button class="primary-button" type="submit" :disabled="submitting">
        <span v-if="submitting" class="button-spinner" aria-hidden="true"></span>
        {{ submitting ? "Entrando..." : "Entrar" }}
      </button>

      <p class="auth-form__switch">
        Não possui uma conta?
        <RouterLink to="/cadastro">Criar conta</RouterLink>
      </p>
    </form>
  </section>
</template>
