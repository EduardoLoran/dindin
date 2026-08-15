<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getPublicConfig } from "../api/auth";
import { useTheme } from "../composables/useTheme";

const props = defineProps({ action: { type: String, required: true } });
const container = ref(null);
const loading = ref(true);
const enabled = ref(false);
const required = ref(false);
const error = ref("");
const token = ref("");
const widgetId = ref(null);
const siteKey = ref("");
const { activeTheme } = useTheme();
const statusMessage = computed(() => {
  if (error.value) return error.value;
  if (loading.value) return "Carregando verificação de segurança...";
  if (!enabled.value && required.value) return "O Cloudflare Turnstile é obrigatório, mas não foi configurado no servidor.";
  if (!enabled.value) return "O Cloudflare Turnstile está desativado neste ambiente.";
  return "";
});

onMounted(async () => {
  try {
    const config = await getPublicConfig();
    enabled.value = Boolean(config.turnstile?.enabled);
    required.value = Boolean(config.turnstile?.required);
    siteKey.value = String(config.turnstile?.siteKey || "");
    if (enabled.value) await renderWidget();
  } catch {
    error.value = "Não foi possível carregar a verificação de segurança.";
  } finally {
    loading.value = false;
  }
});

watch(activeTheme, async () => {
  if (enabled.value) await renderWidget();
});

onBeforeUnmount(removeWidget);

async function renderWidget() {
  await nextTick();
  const turnstile = await loadTurnstile();
  removeWidget();
  if (!container.value) return;
  container.value.replaceChildren();
  token.value = "";
  error.value = "";
  widgetId.value = turnstile.render(container.value, {
    sitekey: siteKey.value,
    theme: activeTheme.value,
    language: "pt-BR",
    action: props.action,
    size: "flexible",
    appearance: "always",
    "response-field": false,
    callback: (responseToken) => {
      token.value = responseToken;
      error.value = "";
    },
    "expired-callback": () => {
      token.value = "";
      error.value = "A verificação expirou. Tente novamente.";
    },
    "error-callback": () => {
      token.value = "";
      error.value = "Não foi possível concluir a verificação. Tente novamente.";
    },
    "unsupported-callback": () => {
      token.value = "";
      error.value = "Este navegador não é compatível com a verificação de segurança.";
    },
  });
}

function getToken() {
  return token.value;
}

function reset() {
  token.value = "";
  error.value = "";
  if (widgetId.value !== null && window.turnstile) window.turnstile.reset(widgetId.value);
}

function removeWidget() {
  if (widgetId.value !== null && window.turnstile) window.turnstile.remove(widgetId.value);
  widgetId.value = null;
}

function loadTurnstile() {
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (window.__dindinTurnstilePromise) return window.__dindinTurnstilePromise;

  window.__dindinTurnstilePromise = new Promise((resolve, reject) => {
    const callbackName = `dindinTurnstileReady${Date.now()}`;
    window[callbackName] = () => {
      delete window[callbackName];
      resolve(window.turnstile);
    };
    const script = document.createElement("script");
    script.src = `https://challenges.cloudflare.com/turnstile/v0/api.js?onload=${callbackName}&render=explicit`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("turnstile_load_failed"));
    document.head.appendChild(script);
  });
  return window.__dindinTurnstilePromise;
}

defineExpose({ getToken, reset, enabled, required });
</script>

<template>
  <section class="turnstile-field" aria-label="Verificação de segurança">
    <strong class="turnstile-field__label">Verificação de segurança</strong>
    <div v-show="enabled" ref="container"></div>
    <small v-if="statusMessage" :class="{ 'is-error': error || (required && !loading) }" :role="error || (required && !loading) ? 'alert' : 'status'">{{ statusMessage }}</small>
  </section>
</template>
