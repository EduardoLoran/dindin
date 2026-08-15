<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { completePasswordReset, validatePasswordReset } from "../api/auth";
import TurnstileWidget from "../components/TurnstileWidget.vue";
import PasswordField from "../components/PasswordField.vue";
import StatusMessage from "../components/StatusMessage.vue";

const route = useRoute();
const token = computed(() => String(route.query.token || route.query.resetToken || ""));
const state = ref("loading");
const email = ref("");
const requestError = ref("");
const notice = ref("");
const submitting = ref(false);
const form = reactive({ newPassword: "", passwordConfirmation: "" });
const errors = reactive({ newPassword: "", passwordConfirmation: "" });
const turnstile = ref(null);

onMounted(async () => {
  if (!token.value) {
    state.value = "invalid";
    requestError.value = "O link de redefinição está incompleto.";
    return;
  }

  try {
    const payload = await validatePasswordReset(token.value);
    state.value = "ready";
  } catch (error) {
    state.value = "invalid";
    requestError.value = error.message;
  }
});

function validate() {
  errors.newPassword = form.newPassword.length >= 12 ? "" : "A senha deve ter pelo menos 12 caracteres.";
  errors.passwordConfirmation = form.passwordConfirmation === form.newPassword ? "" : "As senhas não coincidem.";
  return !errors.newPassword && !errors.passwordConfirmation;
}

async function submit() {
  requestError.value = "";
  if (!validate()) return;

  submitting.value = true;
  try {
    const payload = await completePasswordReset({
      token: token.value,
      newPassword: form.newPassword,
      passwordConfirmation: form.passwordConfirmation,
      turnstileToken: turnstile.value?.getToken() || "",
    });
    notice.value = payload.message;
    state.value = "complete";
  } catch (error) {
    requestError.value = error.message;
    turnstile.value?.reset();
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="auth-view" aria-labelledby="reset-title">
    <header class="auth-view__header">
      <p class="auth-view__eyebrow">Nova senha</p>
      <h2 id="reset-title">Redefina seu acesso</h2>
      <p v-if="state === 'ready'">Crie uma nova senha para sua conta.</p>
      <p v-else-if="state === 'loading'">Estamos validando seu link.</p>
      <p v-else>Conclua a recuperação da sua conta.</p>
    </header>

    <div v-if="state === 'loading'" class="auth-loading" role="status">
      <span class="button-spinner" aria-hidden="true"></span>
      Validando link...
    </div>

    <form v-else-if="state === 'ready'" class="auth-form" novalidate @submit.prevent="submit">
      <StatusMessage :message="requestError" />
      <PasswordField id="new-password" v-model="form.newPassword" label="Nova senha" autocomplete="new-password" :error="errors.newPassword" :disabled="submitting" required @update:model-value="errors.newPassword = ''; requestError = ''" />
      <PasswordField id="new-password-confirmation" v-model="form.passwordConfirmation" label="Confirmar nova senha" autocomplete="new-password" placeholder="Repita sua nova senha" :error="errors.passwordConfirmation" :disabled="submitting" required @update:model-value="errors.passwordConfirmation = ''; requestError = ''" />
      <TurnstileWidget ref="turnstile" action="password-reset" />
      <button class="primary-button" type="submit" :disabled="submitting">
        <span v-if="submitting" class="button-spinner" aria-hidden="true"></span>
        {{ submitting ? "Salvando..." : "Salvar nova senha" }}
      </button>
    </form>

    <div v-else class="auth-form">
      <StatusMessage :message="notice || requestError" :type="notice ? 'success' : 'error'" />
      <RouterLink class="secondary-button" to="/login">Voltar para o login</RouterLink>
    </div>
  </section>
</template>
