<script setup>
import { computed, onMounted, ref } from "vue";
import AppIcon from "../components/AppIcon.vue";
import UserFormDialog from "../components/UserFormDialog.vue";
import { createUser, getUsers, updateUser } from "../api/admin";
import { formatCompactDate } from "../utils/formatters";

const users = ref([]);
const loading = ref(true);
const error = ref("");
const actionError = ref("");
const search = ref("");
const role = ref("all");
const dialogOpen = ref(false);
const selected = ref(null);
const saving = ref(false);
const notice = ref("");
const filtered = computed(() => users.value.filter((user) => (!search.value || [user.displayName, user.username, user.email].some((value) => String(value).toLocaleLowerCase("pt-BR").includes(search.value.toLocaleLowerCase("pt-BR")))) && (role.value === "all" || (role.value === "admin" ? user.isAdmin : !user.isAdmin))));
const adminCount = computed(() => users.value.filter((user) => user.isAdmin).length);

async function loadUsers() { loading.value = true; error.value = ""; try { users.value = (await getUsers()).users || []; } catch (err) { error.value = err.message; } finally { loading.value = false; } }
function openCreate() { selected.value = null; actionError.value = ""; dialogOpen.value = true; }
function openEdit(user) { selected.value = user; actionError.value = ""; dialogOpen.value = true; }
function notify(message) { notice.value = message; setTimeout(() => { notice.value = ""; }, 3000); }
async function saveUser(form) { saving.value = true; actionError.value = ""; try { if (selected.value) await updateUser(selected.value.id, form); else await createUser(form); await loadUsers(); dialogOpen.value = false; notify(selected.value ? "Usuário atualizado." : "Usuário criado."); } catch (err) { actionError.value = err.message; } finally { saving.value = false; } }
onMounted(loadUsers);
</script>

<template><div class="workspace-page"><div v-if="loading" class="workspace-loading"><span v-for="item in 4" :key="item"></span></div><section v-else-if="error" class="dashboard-error"><AppIcon name="alert" /><div><h1>Não foi possível carregar os usuários.</h1><p>{{ error }}</p><button @click="loadUsers">Tentar novamente</button></div></section><template v-else>
  <header class="workspace-hero"><div><p class="dashboard-eyebrow">Controle de acesso</p><h1>Administração</h1><p>Gerencie contas e permissões sem misturar os dados financeiros de cada pessoa.</p></div><button class="workspace-primary" type="button" @click="openCreate"><AppIcon name="plus" :size="17" />Novo usuário</button></header>
  <section class="workspace-stats workspace-stats--three"><article><span><AppIcon name="user" /></span><div><small>Usuários cadastrados</small><strong>{{ users.length }}</strong></div></article><article><span><AppIcon name="admin" /></span><div><small>Administradores</small><strong>{{ adminCount }}</strong></div></article><article><span><AppIcon name="check" /></span><div><small>Contas pessoais</small><strong>{{ users.length - adminCount }}</strong></div></article></section>
  <section class="workspace-panel"><div class="workspace-panel__heading"><div><h2>Usuários</h2><p>{{ filtered.length }} conta(s) exibida(s)</p></div></div><div class="admin-toolbar"><label class="templates-search"><AppIcon name="search" /><input v-model="search" type="search" placeholder="Buscar por nome, usuário ou e-mail" /></label><select v-model="role"><option value="all">Todos os perfis</option><option value="admin">Administradores</option><option value="user">Contas pessoais</option></select></div><div class="admin-table-wrap"><table class="templates-table admin-table"><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Último acesso</th><th>Criado em</th><th></th></tr></thead><tbody><tr v-for="user in filtered" :key="user.id"><td data-label="Usuário"><span class="admin-avatar"><img v-if="user.avatarDataUrl" :src="user.avatarDataUrl" alt="" /><b v-else>{{ (user.displayName || user.username).slice(0, 2).toUpperCase() }}</b></span><div><strong>{{ user.displayName }}</strong><small>@{{ user.username }}</small></div></td><td data-label="E-mail">{{ user.email }}</td><td data-label="Perfil"><span class="template-type" :class="user.isAdmin ? 'template-type--variable' : 'template-type--fixed'">{{ user.isAdmin ? "Administrador" : "Conta pessoal" }}</span></td><td data-label="Último acesso">{{ formatCompactDate(user.lastLoginAt) }}</td><td data-label="Criado em">{{ formatCompactDate(user.createdAt) }}</td><td><button class="admin-edit" type="button" @click="openEdit(user)"><AppIcon name="edit" :size="16" />Editar</button></td></tr></tbody></table></div><div v-if="!filtered.length" class="workspace-empty"><AppIcon name="search" /><h3>Nenhum usuário encontrado.</h3><p>Revise o termo ou o filtro de perfil.</p></div></section>
  <div v-if="notice" class="templates-toast"><AppIcon name="check" />{{ notice }}</div><UserFormDialog :open="dialogOpen" :user="selected" :saving="saving" :error="actionError" @close="dialogOpen = false" @save="saveUser" />
</template></div></template>
