<script setup>
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { changePassword } from "../api/auth";
import PasswordField from "../components/PasswordField.vue";
import StatusMessage from "../components/StatusMessage.vue";
import { setAuthenticatedUser } from "../composables/useSession";

const router = useRouter();
const form = reactive({ currentPassword: "", newPassword: "", passwordConfirmation: "" });
const error = ref("");
const saving = ref(false);

async function submit() {
  error.value = "";
  if (form.newPassword.length < 12) {
    error.value = "A nova senha deve ter pelo menos 12 caracteres.";
    return;
  }
  if (form.newPassword !== form.passwordConfirmation) {
    error.value = "As senhas nao coincidem.";
    return;
  }
  saving.value = true;
  try {
    const payload = await changePassword(form);
    setAuthenticatedUser(payload.user);
    await router.replace({ name: "dashboard" });
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="auth-view" aria-labelledby="force-password-title">
    <header class="auth-view__header">
      <p class="auth-view__eyebrow">Atualizacao de seguranca</p>
      <h2 id="force-password-title">Crie uma nova senha</h2>
      <p>Para continuar, substitua sua senha antiga por uma com pelo menos 12 caracteres.</p>
    </header>
    <form class="auth-form" novalidate @submit.prevent="submit">
      <StatusMessage :message="error" />
      <PasswordField id="force-current-password" v-model="form.currentPassword" label="Senha atual" autocomplete="current-password" :disabled="saving" required />
      <PasswordField id="force-new-password" v-model="form.newPassword" label="Nova senha" autocomplete="new-password" :disabled="saving" required />
      <PasswordField id="force-password-confirmation" v-model="form.passwordConfirmation" label="Confirmar nova senha" autocomplete="new-password" :disabled="saving" required />
      <button class="primary-button" type="submit" :disabled="saving">{{ saving ? "Salvando..." : "Atualizar senha" }}</button>
    </form>
  </section>
</template>
