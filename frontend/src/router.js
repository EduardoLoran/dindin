import { createRouter, createWebHistory } from "vue-router";
import { ensureSession } from "./composables/useSession";
import DashboardView from "./views/DashboardView.vue";
import ForgotPasswordView from "./views/ForgotPasswordView.vue";
import LoginView from "./views/LoginView.vue";
import RegisterView from "./views/RegisterView.vue";
import ResetPasswordView from "./views/ResetPasswordView.vue";
import TemplatesView from "./views/TemplatesView.vue";
import EntriesView from "./views/EntriesView.vue";
import DetailsView from "./views/DetailsView.vue";
import FixedExpensesView from "./views/FixedExpensesView.vue";
import AdminUsersView from "./views/AdminUsersView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/login" },
    { path: "/login", name: "login", component: LoginView, meta: { layout: "auth", publicOnly: true } },
    { path: "/cadastro", name: "register", component: RegisterView, meta: { layout: "auth", publicOnly: true } },
    { path: "/esqueci-senha", name: "forgot-password", component: ForgotPasswordView, meta: { layout: "auth", publicOnly: true } },
    { path: "/redefinir-senha", name: "reset-password", component: ResetPasswordView, meta: { layout: "auth", publicOnly: true } },
    { path: "/visao-geral", name: "dashboard", component: DashboardView, meta: { layout: "dashboard", requiresAuth: true, title: "Visão geral" } },
    { path: "/cadastros", name: "templates", component: TemplatesView, meta: { layout: "dashboard", requiresAuth: true, title: "Cadastros" } },
    { path: "/lancamentos", name: "entries", component: EntriesView, meta: { layout: "dashboard", requiresAuth: true, title: "Lançamentos" } },
    { path: "/detalhes", name: "details", component: DetailsView, meta: { layout: "dashboard", requiresAuth: true, title: "Detalhes" } },
    { path: "/gastos-fixos", name: "fixed-expenses", component: FixedExpensesView, meta: { layout: "dashboard", requiresAuth: true, title: "Gastos fixos" } },
    { path: "/admin/usuarios", name: "admin-users", component: AdminUsersView, meta: { layout: "dashboard", requiresAuth: true, requiresAdmin: true, title: "Administração" } },
    { path: "/:pathMatch(.*)*", redirect: "/login" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  const session = await ensureSession();

  if (to.meta.requiresAuth && !session.authenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }

  if (to.meta.requiresAdmin && !session.user?.isAdmin) {
    return { name: "dashboard" };
  }

  if (to.meta.publicOnly && session.authenticated) {
    return { name: "dashboard" };
  }

  return true;
});

export default router;
