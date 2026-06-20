<script setup>
import { computed, reactive, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, Switch, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";

const props = defineProps({ open: Boolean, user: { type: Object, default: null }, saving: Boolean, error: { type: String, default: "" } });
const emit = defineEmits(["close", "save"]);
const form = reactive({ displayName: "", username: "", email: "", password: "", confirmation: "", isAdmin: false });
const errors = reactive({ displayName: "", username: "", email: "", password: "" });
const editing = computed(() => Boolean(props.user?.id));

watch(() => props.open, (open) => { if (!open) return; Object.assign(form, { displayName: props.user?.displayName || "", username: props.user?.username || "", email: props.user?.email || "", password: "", confirmation: "", isAdmin: Boolean(props.user?.isAdmin) }); Object.keys(errors).forEach((key) => { errors[key] = ""; }); });

function submit() {
  errors.displayName = form.displayName.trim().length >= 3 ? "" : "Informe ao menos 3 caracteres.";
  errors.username = /^[a-z0-9._-]{3,24}$/.test(form.username.trim().toLowerCase()) ? "" : "Use 3 a 24 letras, números, ponto, traço ou underline.";
  errors.email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? "" : "Informe um e-mail válido.";
  errors.password = editing.value || (form.password.length >= 6 && form.password === form.confirmation) ? "" : "Use ao menos 6 caracteres e confirme a mesma senha.";
  if (Object.values(errors).some(Boolean)) return;
  emit("save", { displayName: form.displayName.trim(), username: form.username.trim().toLowerCase(), email: form.email.trim().toLowerCase(), isAdmin: form.isAdmin, ...(editing.value ? {} : { password: form.password, passwordConfirmation: form.confirmation }) });
}
</script>

<template><TransitionRoot :show="open" as="template"><Dialog class="dialog-root" @close="saving ? undefined : emit('close')"><TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden"><div class="dialog-backdrop"></div></TransitionChild><div class="dialog-positioner"><TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden"><DialogPanel class="dialog-panel user-form-dialog"><div class="dialog-heading"><div class="dialog-panel__icon"><AppIcon name="user" /></div><button type="button" aria-label="Fechar" @click="emit('close')"><AppIcon name="close" /></button></div><DialogTitle>{{ editing ? "Editar usuário" : "Novo usuário" }}</DialogTitle><p>{{ editing ? "Atualize os dados e permissões da conta." : "Crie um acesso separado para uma nova pessoa." }}</p><form class="template-form" @submit.prevent="submit"><div class="template-field template-field--full"><label for="user-name">Nome de exibição</label><input id="user-name" v-model="form.displayName" /><small v-if="errors.displayName">{{ errors.displayName }}</small></div><div class="template-field"><label for="user-username">Usuário</label><input id="user-username" v-model="form.username" autocomplete="off" /><small v-if="errors.username">{{ errors.username }}</small></div><div class="template-field"><label for="user-email">E-mail</label><input id="user-email" v-model="form.email" type="email" /><small v-if="errors.email">{{ errors.email }}</small></div><template v-if="!editing"><div class="template-field"><label for="user-password">Senha</label><input id="user-password" v-model="form.password" type="password" autocomplete="new-password" /></div><div class="template-field"><label for="user-confirmation">Confirmar senha</label><input id="user-confirmation" v-model="form.confirmation" type="password" autocomplete="new-password" /><small v-if="errors.password">{{ errors.password }}</small></div></template><div class="template-switch-row template-field--full"><div><strong>Acesso administrativo</strong><span>Permite criar usuários e alterar permissões.</span></div><Switch v-model="form.isAdmin" class="template-switch" :class="{ 'is-active': form.isAdmin }"><span></span></Switch></div><p v-if="error" class="dialog-error template-field--full">{{ error }}</p><div class="dialog-actions template-field--full"><button class="dialog-cancel" type="button" @click="emit('close')">Cancelar</button><button class="dialog-save" type="submit" :disabled="saving">{{ saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar usuário" }}</button></div></form></DialogPanel></TransitionChild></div></Dialog></TransitionRoot></template>
