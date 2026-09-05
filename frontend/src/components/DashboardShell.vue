<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Dialog, DialogPanel, Menu, MenuButton, MenuItem, MenuItems, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";
import BrandLogo from "./BrandLogo.vue";
import MonthSelector from "./MonthSelector.vue";
import ProfileDialog from "./ProfileDialog.vue";
import ThemeToggle from "./ThemeToggle.vue";
import { changePassword, updateProfile } from "../api/auth";
import { getDashboard } from "../api/dashboard";
import { useGlobalPeriod } from "../composables/useGlobalPeriod";
import { endSession, setAuthenticatedUser, useSession } from "../composables/useSession";
import { useValuePrivacy } from "../composables/useValuePrivacy";

const SIDEBAR_KEY = "dindin-sidebar-collapsed";
const route = useRoute();
const router = useRouter();
const { user } = useSession();
const { selectedMonth, setSelectedMonth, changeSelectedMonth } = useGlobalPeriod();
const { valuesHidden, toggleValuesVisibility } = useValuePrivacy();
const mobileOpen = ref(false);
const collapsed = ref(window.localStorage.getItem(SIDEBAR_KEY) === "true");
const signingOut = ref(false);
const periodPayload = ref(null);
const loadingPeriods = ref(false);
const profileOpen = ref(false);
const savingProfile = ref(false);
const savingPassword = ref(false);
const profileError = ref("");
const passwordError = ref("");
const profileNotice = ref("");

const navItems = computed(() => [
  { label: "Visão geral", href: "/visao-geral", icon: "home", modern: true },
  { label: "Cadastros", href: "/cadastros", icon: "templates", modern: true },
  { label: "Lançamentos", href: "/lancamentos", icon: "entries", modern: true },
  { label: "Detalhes", href: "/detalhes", icon: "details", modern: true },
  { label: "Gastos fixos", href: "/gastos-fixos", icon: "fixed", modern: true },
  { label: "Importação bancária", href: "/importacao-bancaria", icon: "bank-import", modern: true },
  ...(user.value?.isAdmin ? [{ label: "Administração", href: "/admin/usuarios", icon: "admin", modern: true }] : []),
]);

const initials = computed(() => {
  const name = String(user.value?.displayName || user.value?.username || "D").trim();
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
});

function toggleSidebar() {
  collapsed.value = !collapsed.value;
  window.localStorage.setItem(SIDEBAR_KEY, String(collapsed.value));
}

async function signOut() {
  if (signingOut.value) return;
  signingOut.value = true;
  try {
    await endSession();
    await router.replace({ name: "login" });
  } finally {
    signingOut.value = false;
  }
}

async function loadPeriods() {
  loadingPeriods.value = true;
  try {
    let payload = await getDashboard(selectedMonth.value);
    const latestMonth = payload.months?.[0]?.monthKey;
    if (!selectedMonth.value && latestMonth && latestMonth !== payload.activeMonth) payload = await getDashboard(latestMonth);
    periodPayload.value = payload;
    setSelectedMonth(payload.activeMonth);
  } catch {
    periodPayload.value = null;
  } finally {
    loadingPeriods.value = false;
  }
}

function selectGlobalPeriod(monthKey) {
  changeSelectedMonth(monthKey);
}

function openProfile() {
  profileError.value = "";
  passwordError.value = "";
  profileNotice.value = "";
  profileOpen.value = true;
}

async function saveProfile(profile) {
  savingProfile.value = true;
  profileError.value = "";
  profileNotice.value = "";
  try {
    const payload = await updateProfile(profile);
    setAuthenticatedUser(payload.user);
    profileNotice.value = "Perfil atualizado com sucesso.";
  } catch (error) {
    profileError.value = error.message;
  } finally {
    savingProfile.value = false;
  }
}

async function savePassword(payload) {
  savingPassword.value = true;
  passwordError.value = "";
  profileNotice.value = "";
  try {
    const response = await changePassword(payload);
    setAuthenticatedUser(response.user);
    profileNotice.value = response.message || "Senha alterada com sucesso.";
  } catch (error) {
    passwordError.value = error.message;
  } finally {
    savingPassword.value = false;
  }
}

onMounted(loadPeriods);
</script>

<template>
  <div class="app-layout" :class="{ 'app-layout--collapsed': collapsed }">
    <aside class="app-sidebar" :class="{ 'app-sidebar--collapsed': collapsed }">
      <div class="app-sidebar__brand">
        <BrandLogo compact />
        <button class="sidebar-collapse" type="button" :aria-label="collapsed ? 'Expandir menu' : 'Recolher menu'" @click="toggleSidebar">
          <AppIcon name="chevron-left" :class="{ 'is-rotated': collapsed }" />
        </button>
      </div>

      <nav class="app-nav" aria-label="Menu principal">
        <p class="app-nav__label">Principal</p>
        <template v-for="item in navItems" :key="item.href">
          <RouterLink v-if="item.modern" :to="item.href" class="app-nav__item" :class="{ 'is-active': route.path === item.href }" :title="collapsed ? item.label : undefined">
            <AppIcon :name="item.icon" /><span>{{ item.label }}</span>
          </RouterLink>
          <a v-else :href="item.href" class="app-nav__item" :title="collapsed ? item.label : undefined">
            <AppIcon :name="item.icon" /><span>{{ item.label }}</span>
          </a>
        </template>
      </nav>

      <div class="app-sidebar__footer">
        <div class="sidebar-help">
          <span class="sidebar-help__icon"><AppIcon name="wallet" /></span>
          <div><strong>Seu dinheiro, claro.</strong><small>Organize hoje. Respire amanhã.</small></div>
        </div>
      </div>
    </aside>

    <div class="app-main">
      <header class="app-topbar">
        <div class="app-topbar__leading">
          <button class="mobile-menu-button" type="button" aria-label="Abrir menu" @click="mobileOpen = true"><AppIcon name="menu" /></button>
          <div class="app-topbar__title"><p>Área financeira</p><strong>{{ route.meta.title || "Dindin" }}</strong></div>
          <MonthSelector
            class="app-period-select"
            :model-value="selectedMonth"
            :months="periodPayload?.months || []"
            :disabled="loadingPeriods"
            label="Período"
            @change="selectGlobalPeriod"
          />
        </div>

        <div class="app-topbar__actions">
          <button
            class="value-privacy-toggle"
            type="button"
            :aria-label="valuesHidden ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros'"
            :aria-pressed="valuesHidden"
            :title="valuesHidden ? 'Mostrar valores' : 'Ocultar valores'"
            @click="toggleValuesVisibility"
          >
            <span class="value-privacy-toggle__icon"><AppIcon :name="valuesHidden ? 'eye-off' : 'eye'" :size="18" /></span>
            <span>{{ valuesHidden ? "Mostrar valores" : "Ocultar valores" }}</span>
          </button>
          <ThemeToggle />
          <Menu as="div" class="user-menu">
            <MenuButton class="user-menu__button">
              <span class="user-avatar">
                <img v-if="user?.avatarDataUrl" :src="user.avatarDataUrl" alt="" />
                <span v-else>{{ initials }}</span>
              </span>
              <span class="user-menu__identity"><strong>{{ user?.displayName || user?.username }}</strong><small>{{ user?.isAdmin ? "Administrador" : "Conta pessoal" }}</small></span>
              <AppIcon name="chevron-down" :size="16" />
            </MenuButton>
            <Transition enter-active-class="menu-transition" enter-from-class="menu-hidden" enter-to-class="menu-visible" leave-active-class="menu-transition" leave-from-class="menu-visible" leave-to-class="menu-hidden">
              <MenuItems class="user-menu__items">
                <div class="user-menu__summary"><strong>{{ user?.displayName }}</strong><span>{{ user?.email }}</span></div>
                <MenuItem v-slot="{ active }"><button type="button" :class="{ 'is-active': active }" @click="openProfile"><AppIcon name="user" />Editar perfil</button></MenuItem>
                <MenuItem v-slot="{ active }"><RouterLink to="/cadastros" :class="{ 'is-active': active }"><AppIcon name="templates" />Abrir cadastros</RouterLink></MenuItem>
                <MenuItem v-slot="{ active }"><button type="button" :class="{ 'is-active': active }" :disabled="signingOut" @click="signOut"><AppIcon name="logout" />{{ signingOut ? "Saindo..." : "Sair" }}</button></MenuItem>
              </MenuItems>
            </Transition>
          </Menu>
        </div>
      </header>

      <main class="app-content"><slot /></main>
    </div>

    <ProfileDialog
      :open="profileOpen"
      :user="user"
      :saving-profile="savingProfile"
      :saving-password="savingPassword"
      :profile-error="profileError"
      :password-error="passwordError"
      :notice="profileNotice"
      @close="profileOpen = false"
      @save-profile="saveProfile"
      @change-password="savePassword"
    />

    <TransitionRoot :show="mobileOpen" as="template">
      <Dialog class="mobile-sidebar" @close="mobileOpen = false">
        <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden">
          <div class="mobile-sidebar__backdrop"></div>
        </TransitionChild>
        <TransitionChild as="template" enter="drawer-transition" enter-from="drawer-hidden" enter-to="drawer-visible" leave="drawer-transition" leave-from="drawer-visible" leave-to="drawer-hidden">
          <DialogPanel class="mobile-sidebar__panel">
            <div class="mobile-sidebar__head"><BrandLogo compact /><button type="button" aria-label="Fechar menu" @click="mobileOpen = false"><AppIcon name="close" /></button></div>
            <nav class="app-nav" aria-label="Menu principal móvel">
              <template v-for="item in navItems" :key="item.href">
                <RouterLink v-if="item.modern" :to="item.href" class="app-nav__item" :class="{ 'is-active': route.path === item.href }" @click="mobileOpen = false"><AppIcon :name="item.icon" /><span>{{ item.label }}</span></RouterLink>
                <a v-else :href="item.href" class="app-nav__item"><AppIcon :name="item.icon" /><span>{{ item.label }}</span></a>
              </template>
            </nav>
          </DialogPanel>
        </TransitionChild>
      </Dialog>
    </TransitionRoot>
  </div>
</template>
