const { createApp } = Vue;

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

const monthShortFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const PAGE_LABELS = {
  overview: "Visão geral",
  templates: "Cadastros",
  entries: "Lançamentos",
  details: "Detalhes",
  adminUsers: "Usuários (Admin)",
};

const PUBLIC_ROUTES = {
  login: "/login",
  register: "/cadastro",
  forgotPassword: "/esqueci-senha",
  resetPassword: "/redefinir-senha",
};

const PRIVATE_ROUTES = {
  overview: "/visao-geral",
  templates: "/cadastros",
  entries: "/lancamentos",
  details: "/detalhes",
  adminUsers: "/admin/usuarios",
};

createApp({
  data() {
      return {
        user: null,
      activeMonth: "",
      monthPicker: "",
      activePage: "overview",
      monthPickerPanel: {
        open: false,
        year: new Date().getFullYear(),
        position: {
          top: 0,
          left: 0,
        },
      },
      months: [],
      templates: [],
      month: null,
      lastAutoRolloverAt: "",
      loading: true,
      savingSalary: false,
      creatingTemplate: false,
      observationModal: {
        open: false,
        title: "",
        text: "",
        targetId: "",
        targetType: "",
      },
      form: {
        name: "",
        cycle: "Inicio Do Mes",
        paymentMethod: "",
        observation: "",
        isVariable: true,
      },
      salaryInput: "",
      templateAmountInput: "",
      entryAmountInputs: {},
      savingEntries: {},
      authMode: "login",
      loggingIn: false,
      registering: false,
      authLoading: true,
      loginForm: {
        username: "",
        password: "",
      },
      registerForm: {
        username: "",
        email: "",
        displayName: "",
        password: "",
        passwordConfirmation: "",
      },
      changingPassword: false,
      passwordModal: {
        open: false,
        currentPassword: "",
        newPassword: "",
        passwordConfirmation: "",
      },
      resettingPassword: false,
      forgotPasswordModal: {
        open: false,
        email: "",
        error: "",
        notice: "",
      },
      passwordResetView: {
        token: "",
        loading: false,
        valid: false,
        email: "",
        expiresAt: "",
        newPassword: "",
        passwordConfirmation: "",
      },
      toasts: [],
      confirmModal: {
        open: false,
        title: "",
        message: "",
        confirmText: "",
        cancelText: "",
        tone: "danger",
        action: "",
        payload: null,
        busy: false,
      },
      formErrors: {},
      profileMenuOpen: false,
      profileModal: {
        open: false,
        displayName: "",
        avatarDataUrl: null,
        saving: false,
      },
      adminUsers: [],
      adminLoading: false,
      adminCreateModal: {
        open: false,
        username: "",
        email: "",
        displayName: "",
        password: "",
        passwordConfirmation: "",
        isAdmin: false,
        saving: false,
      },
      adminEditModal: {
        open: false,
        id: "",
        username: "",
        email: "",
        displayName: "",
        isAdmin: false,
        saving: false,
      },
      error: "",
      notice: "",
      bootstrapSeq: 0,
    };
  },

  computed: {
    avatarInitials() {
      const base = String(this.user?.displayName || this.user?.username || "")
        .trim()
        .replace(/\s+/g, " ");
      if (!base) {
        return "?";
      }

      const parts = base.split(" ").filter(Boolean);
      const first = parts[0]?.[0] || "";
      const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : (parts[0]?.[1] || "");
      return (first + last).toUpperCase();
    },

    avatarFallbackDataUrl() {
      const initials = this.avatarInitials;
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#577ef7"/>
              <stop offset="1" stop-color="#883efa"/>
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="18" fill="url(#g)"/>
          <text x="32" y="39" text-anchor="middle" font-size="22" font-family="Segoe UI, Arial" font-weight="700" fill="#ffffff">${initials}</text>
        </svg>
      `.trim();
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    },

    avatarDataUrl() {
      const stored = String(this.user?.avatarDataUrl || "").trim();
      return stored || this.avatarFallbackDataUrl;
    },

    adminMode() {
      return Boolean(this.user?.isAdmin) && this.activePage === "adminUsers";
    },

    adminMenuLabel() {
      return "Administra\u00E7\u00E3o";
    },

    monthTitle() {
      if (!this.activeMonth) {
        return "-";
      }

      return this.capitalize(monthFormatter.format(new Date(`${this.activeMonth}-01T12:00:00`)));
    },

    currentPageLabel() {
      return PAGE_LABELS[this.activePage] || "Visão geral";
    },

    hasSavedActiveMonth() {
      return this.months.some((item) => item.monthKey === this.activeMonth);
    },

    monthPickerLabel() {
      return this.formatMonthLabel(this.monthPicker || this.activeMonth || this.buildMonthKey(this.monthPickerPanel.year, 1));
    },

    monthPickerMonths() {
      return Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const monthKey = this.buildMonthKey(this.monthPickerPanel.year, month);
        return {
          month,
          monthKey,
          label: this.capitalize(monthShortFormatter.format(new Date(`${monthKey}-01T12:00:00`)).replace(".", "")),
        };
      });
    },

    breadcrumbItems() {
      const items = [{ key: "overview", label: "Início" }];

      if (this.activePage !== "overview") {
        items.push({ key: this.activePage, label: this.currentPageLabel });
      }

      return items;
    },

    summaryCards() {
      if (!this.month) {
        return [];
      }

      const summary = this.month.summary;
      return [
        { label: "Salário", value: this.formatCurrency(summary.salary), meta: "Base do mês selecionado", tone: "salary" },
        { label: "Total fixo", value: this.formatCurrency(summary.total), meta: "Soma dos lançamentos recorrentes", tone: "total" },
        { label: "Já pago", value: this.formatCurrency(summary.paid), meta: "Pago ou guardado no mês", tone: "paid" },
        { label: "Falta pagar", value: this.formatCurrency(summary.pending), meta: "Pendências em aberto", tone: "pending" },
        { label: "Início do mês", value: this.formatCurrency(summary.monthStartProjection), meta: "Projeção da primeira metade", tone: "start" },
        { label: "Quinzena", value: this.formatCurrency(summary.quinzenaProjection), meta: "Projeção da segunda metade", tone: "mid" },
        {
          label: "Saldo projetado",
          value: this.formatCurrency(summary.balance),
          meta: "Salário menos gastos fixos",
          tone: summary.balance >= 0 ? "positive-balance" : "negative-balance",
        },
      ];
    },

    groupedEntries() {
      if (!this.month) {
        return [];
      }

      const groups = [
        { cycle: "Inicio Do Mes", title: "Início do mês" },
        { cycle: "Quinzena", title: "Quinzena" },
      ];

      return groups.map((group) => ({
        ...group,
        entries: this.month.entries.filter((entry) => entry.cycle === group.cycle),
      }));
    },

    detailCards() {
      if (!this.month) {
        return [];
      }

      const templateById = Object.fromEntries(this.templates.map((template) => [template.id, template]));

      return this.month.entries.map((entry) => {
        const template = templateById[entry.templateId] || null;

        return {
          id: entry.id,
          name: entry.name,
          amount: entry.amount,
          cycle: entry.cycle,
          paymentMethod: entry.paymentMethod,
          observation: entry.observation,
          isVariable: entry.isVariable,
          startMonth: template?.startMonth || this.activeMonth,
          status: entry.status,
        };
      });
    },
  },

  methods: {
    async loadAdminUsers() {
      if (!this.user?.isAdmin) {
        this.toast("error", "Sem acesso.");
        return;
      }

      this.adminLoading = true;
      try {
        const payload = await this.api("/api/admin/users");
        this.adminUsers = payload.users || [];
      } catch (error) {
        this.toast("error", error.message);
      } finally {
        this.adminLoading = false;
      }
    },

    openAdminCreateModal() {
      this.adminCreateModal = {
        open: true,
        username: "",
        email: "",
        displayName: "",
        password: "",
        passwordConfirmation: "",
        isAdmin: false,
        saving: false,
      };
    },

    closeAdminCreateModal(force = false) {
      if (!force && this.adminCreateModal.saving) {
        return;
      }
      this.adminCreateModal = {
        open: false,
        username: "",
        email: "",
        displayName: "",
        password: "",
        passwordConfirmation: "",
        isAdmin: false,
        saving: false,
      };
    },

    async createAdminUser() {
      if (this.adminCreateModal.saving) {
        return;
      }
      this.adminCreateModal = { ...this.adminCreateModal, saving: true };

      try {
        await this.api("/api/admin/users", {
          method: "POST",
          body: JSON.stringify({
            username: this.adminCreateModal.username,
            email: this.adminCreateModal.email,
            displayName: this.adminCreateModal.displayName,
            password: this.adminCreateModal.password,
            passwordConfirmation: this.adminCreateModal.passwordConfirmation,
            isAdmin: this.adminCreateModal.isAdmin,
          }),
        });
        this.toast("success", "Usuário criado.");
        await this.loadAdminUsers();
        this.closeAdminCreateModal(true);
      } catch (error) {
        this.toast("error", error.message);
        this.adminCreateModal = { ...this.adminCreateModal, saving: false };
      }
    },

    openAdminEditModal(userRow) {
      const row = userRow || {};
      this.adminEditModal = {
        open: true,
        id: String(row.id || ""),
        username: String(row.username || ""),
        email: String(row.email || ""),
        displayName: String(row.displayName || ""),
        isAdmin: Boolean(row.isAdmin),
        saving: false,
      };
    },

    closeAdminEditModal(force = false) {
      if (!force && this.adminEditModal.saving) {
        return;
      }
      this.adminEditModal = {
        open: false,
        id: "",
        username: "",
        email: "",
        displayName: "",
        isAdmin: false,
        saving: false,
      };
    },

    async saveAdminUserEdit() {
      if (this.adminEditModal.saving) {
        return;
      }
      this.adminEditModal = { ...this.adminEditModal, saving: true };

      try {
        await this.api(`/api/admin/users/${encodeURIComponent(this.adminEditModal.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            username: this.adminEditModal.username,
            email: this.adminEditModal.email,
            displayName: this.adminEditModal.displayName,
            isAdmin: this.adminEditModal.isAdmin,
          }),
        });
        this.toast("success", "Usuário atualizado.");
        await this.loadAdminUsers();
        this.closeAdminEditModal(true);
      } catch (error) {
        this.toast("error", error.message);
        this.adminEditModal = { ...this.adminEditModal, saving: false };
      }
    },

    formatAdminDate(value) {
      if (!value) {
        return "-";
      }
      return this.formatDateTime(value);
    },

    toggleProfileMenu() {
      if (!this.profileMenuOpen) {
        this.closeMonthPicker();
      }
      this.profileMenuOpen = !this.profileMenuOpen;
    },

    closeProfileMenu() {
      this.profileMenuOpen = false;
    },

    openProfileModal() {
      this.profileModal = {
        open: true,
        displayName: String(this.user?.displayName || "").trim(),
        avatarDataUrl: String(this.user?.avatarDataUrl || "").trim() || null,
        saving: false,
      };
      this.closeProfileMenu();
    },

    closeProfileModal(force = false) {
      if (!force && this.profileModal.saving) {
        return;
      }
      this.profileModal = {
        open: false,
        displayName: "",
        avatarDataUrl: null,
        saving: false,
      };
    },

    pickAvatarFile() {
      this.$refs?.avatarFile?.click?.();
    },

    clearAvatarFile() {
      this.profileModal = { ...this.profileModal, avatarDataUrl: null };
      if (this.$refs?.avatarFile) {
        this.$refs.avatarFile.value = "";
      }
    },

    onAvatarFileSelected(event) {
      const file = event?.target?.files?.[0] || null;
      if (!file) {
        return;
      }

      const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
      if (!allowed.has(file.type)) {
        this.toast("warning", "Formato não suportado. Use PNG, JPG, WEBP ou GIF.");
        event.target.value = "";
        return;
      }

      // Keep DB size reasonable.
      if (file.size > 250 * 1024) {
        this.toast("warning", "Imagem muito grande. Use até 250 KB.");
        event.target.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => {
        this.toast("error", "Não foi possível ler a imagem.");
        event.target.value = "";
      };
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        if (!dataUrl.startsWith("data:image/")) {
          this.toast("error", "Imagem inválida.");
          event.target.value = "";
          return;
        }
        this.profileModal = { ...this.profileModal, avatarDataUrl: dataUrl };
      };
      reader.readAsDataURL(file);
    },

    async saveProfile() {
      this.profileModal = { ...this.profileModal, saving: true };
      this.error = "";

      try {
        const payload = await this.api("/api/profile", {
          method: "PATCH",
          body: JSON.stringify({
            displayName: this.profileModal.displayName,
            avatarDataUrl: this.profileModal.avatarDataUrl || "",
          }),
        });
        this.user = payload.user;
        this.toast("success", "Perfil atualizado.");
        this.closeProfileModal(true);
      } catch (error) {
        this.error = error.message;
        this.toast("error", error.message);
        this.profileModal = { ...this.profileModal, saving: false };
      }
    },
    toast(type, message) {
      const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const normalizedType = ["success", "warning", "error"].includes(type) ? type : "success";
      const item = { id, type: normalizedType, message: String(message || "") };
      this.toasts = [item, ...this.toasts].slice(0, 4);
      window.setTimeout(() => this.dismissToast(id), 4200);
    },

    dismissToast(id) {
      this.toasts = this.toasts.filter((toast) => toast.id !== id);
    },

    avatarFallbackDataUrlFor(displayName, username) {
      const base = String(displayName || username || "")
        .trim()
        .replace(/\s+/g, " ");
      const safe = base || "?";
      const parts = safe.split(" ").filter(Boolean);
      const first = parts[0]?.[0] || "?";
      const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : (parts[0]?.[1] || "");
      const initials = (first + last).toUpperCase();

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#577ef7"/>
              <stop offset="1" stop-color="#883efa"/>
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="18" fill="url(#g)"/>
          <text x="32" y="39" text-anchor="middle" font-size="22" font-family="Segoe UI, Arial" font-weight="700" fill="#ffffff">${initials}</text>
        </svg>
      `.trim();

      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    },

    openConfirmModal({ title, message, confirmText, cancelText, tone, action, payload } = {}) {
      this.confirmModal = {
        open: true,
        title: title || "Confirmar",
        message: message || "",
        confirmText: confirmText || "Confirmar",
        cancelText: cancelText || "Cancelar",
        tone: tone || "danger",
        action: action || "",
        payload: payload ?? null,
        busy: false,
      };
    },

    closeConfirmModal(force = false) {
      if (!force && this.confirmModal.busy) {
        return;
      }
      this.confirmModal = {
        open: false,
        title: "",
        message: "",
        confirmText: "",
        cancelText: "",
        tone: "danger",
        action: "",
        payload: null,
        busy: false,
      };
    },

    async confirmModalConfirm() {
      const modal = this.confirmModal;
      if (!modal.open || modal.busy) {
        return;
      }

      this.confirmModal = { ...modal, busy: true };
      this.error = "";

      try {
        if (modal.action === "delete-entry") {
          const entry = modal.payload;
          const payload = await this.api(`/api/entries/${entry.id}`, { method: "DELETE" });
          this.applyPayload(payload);
          this.toast("success", "Gasto excluído.");
        } else if (modal.action === "delete-month") {
          const monthKey = modal.payload?.monthKey;
          const payload = await this.api(`/api/months/${monthKey}`, { method: "DELETE" });
          this.applyPayload(payload);
          this.toast("success", "Mês excluído.");
        } else if (modal.action === "delete-template") {
          const template = modal.payload;
          const payload = await this.api(`/api/templates/${template.id}`, {
            method: "DELETE",
            body: JSON.stringify({ monthKey: this.activeMonth }),
          });
          this.applyPayload(payload);
          if (this.activePage === "details" && !payload.templates.length) {
            this.activePage = "templates";
          }
          this.toast("success", "Cadastro excluído.");
        }

        this.closeConfirmModal(true);
      } catch (error) {
        this.error = error.message;
        this.toast("error", error.message);
        this.confirmModal = { ...this.confirmModal, busy: false };
      }
    },

    async bootstrap(monthKey = "") {
      const seq = (this.bootstrapSeq += 1);
      this.loading = true;
      this.error = "";

      try {
        const url = monthKey ? `/api/bootstrap?month=${encodeURIComponent(monthKey)}` : "/api/bootstrap";
        const data = await this.api(url);
        if (seq !== this.bootstrapSeq) {
          return;
        }
        this.applyPayload(data);
      } catch (error) {
        if (seq !== this.bootstrapSeq) {
          return;
        }
        this.error = error.message;
      } finally {
        if (seq === this.bootstrapSeq) {
          this.loading = false;
        }
      }
    },

    applyPayload(payload) {
      this.user = payload.user || this.user;
      this.activeMonth = payload.activeMonth;
      this.monthPicker = payload.activeMonth;
      this.syncMonthPickerPanelYear(payload.activeMonth);
      this.months = payload.months;
      this.templates = payload.templates;
      this.month = payload.month;
      this.lastAutoRolloverAt = payload.lastAutoRolloverAt;
      this.salaryInput = this.formatMoneyInput(payload.month.salary);
      this.entryAmountInputs = Object.fromEntries(
        payload.month.entries.map((entry) => [entry.id, this.formatMoneyInput(entry.amount)])
      );
    },

    clearPasswordResetView() {
      this.passwordResetView = {
        token: "",
        loading: false,
        valid: false,
        email: "",
        expiresAt: "",
        newPassword: "",
        passwordConfirmation: "",
      };
    },

    normalizePath(pathname) {
      const normalized = String(pathname || "").trim();
      if (!normalized || normalized === "/") {
        return "/";
      }
      return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
    },

    updateBrowserUrl(path, { replace = false, query = "" } = {}) {
      const target = `${path}${query}`;
      if (`${window.location.pathname}${window.location.search}` === target) {
        return;
      }

      if (replace) {
        window.history.replaceState({}, "", target);
        return;
      }

      window.history.pushState({}, "", target);
    },

    applyRouteFromLocation() {
      const pathname = this.normalizePath(window.location.pathname);
      const page = Object.entries(PRIVATE_ROUTES).find(([, routePath]) => routePath === pathname)?.[0];

      if (pathname === PUBLIC_ROUTES.resetPassword) {
        this.authMode = "login";
        this.closeForgotPasswordModal(false);
        return;
      }

      if (pathname === PUBLIC_ROUTES.register) {
        this.authMode = "register";
        this.closeForgotPasswordModal();
        return;
      }

      if (pathname === PUBLIC_ROUTES.forgotPassword) {
        this.authMode = "login";
        this.openForgotPasswordModal(false);
        return;
      }

      this.authMode = "login";
      this.closeForgotPasswordModal(false);

      if (page) {
        if (page === "adminUsers" && this.user && !this.user.isAdmin) {
          this.toast("error", "Sem acesso.");
          this.activePage = "overview";
          this.syncUrlWithState({ replace: true });
          return;
        }
        this.activePage = page;
        if (page === "adminUsers") {
          this.loadAdminUsers();
        }
        return;
      }

      if (this.user) {
        this.activePage = "overview";
      }
    },

    syncUrlWithState({ replace = false } = {}) {
      if (this.passwordResetView.token) {
        this.updateBrowserUrl(PUBLIC_ROUTES.resetPassword, {
          replace,
          query: `?token=${encodeURIComponent(this.passwordResetView.token)}`,
        });
        return;
      }

      if (this.user) {
        this.updateBrowserUrl(PRIVATE_ROUTES[this.activePage] || PRIVATE_ROUTES.overview, { replace });
        return;
      }

      if (this.forgotPasswordModal.open) {
        this.updateBrowserUrl(PUBLIC_ROUTES.forgotPassword, { replace });
        return;
      }

      this.updateBrowserUrl(
        this.authMode === "register" ? PUBLIC_ROUTES.register : PUBLIC_ROUTES.login,
        { replace }
      );
    },

    resetAppState() {
      this.user = null;
      this.activeMonth = "";
      this.monthPicker = "";
      this.months = [];
      this.templates = [];
      this.month = null;
      this.lastAutoRolloverAt = "";
      this.salaryInput = "";
      this.templateAmountInput = "";
      this.entryAmountInputs = {};
      this.activePage = "overview";
      this.authMode = "login";
      this.registerForm = {
        username: "",
        email: "",
        displayName: "",
        password: "",
        passwordConfirmation: "",
      };
      this.passwordModal = {
        open: false,
        currentPassword: "",
        newPassword: "",
        passwordConfirmation: "",
      };
      this.forgotPasswordModal = {
        open: false,
        email: "",
        error: "",
        notice: "",
      };
      this.passwordResetView = {
        token: "",
        loading: false,
        valid: false,
        email: "",
        expiresAt: "",
        newPassword: "",
        passwordConfirmation: "",
      };
      this.error = "";
      this.notice = "";
    },

    async restoreSession() {
      this.authLoading = true;
      this.error = "";
      this.notice = "";
      this.applyRouteFromLocation();

      try {
        const resetToken = this.getResetTokenFromLocation();

        if (resetToken) {
          this.resetAppState();
          await this.loadPasswordResetToken(resetToken);
          this.syncUrlWithState({ replace: true });
          return;
        }

        const response = await fetch("/api/session", {
          headers: { "Content-Type": "application/json" },
        });
        const payload = await response.json();

        if (payload.authenticated) {
          this.user = payload.user;
          await this.bootstrap();
          this.applyRouteFromLocation();
          this.syncUrlWithState({ replace: true });
        } else {
          this.resetAppState();
          this.syncUrlWithState({ replace: true });
        }
      } catch (error) {
        this.error = "Não foi possível validar a sessão.";
        this.resetAppState();
      } finally {
        this.loading = false;
        this.authLoading = false;
      }
    },

    async loadPasswordResetToken(token) {
      this.passwordResetView = {
        token,
        loading: true,
        valid: false,
        email: "",
        expiresAt: "",
        newPassword: "",
        passwordConfirmation: "",
      };

      try {
        const payload = await this.api(`/api/password-reset/validate?token=${encodeURIComponent(token)}`);
        this.passwordResetView = {
          ...this.passwordResetView,
          loading: false,
          valid: true,
          email: payload.email,
          expiresAt: payload.expiresAt,
        };
      } catch (error) {
        this.passwordResetView = {
          ...this.passwordResetView,
          loading: false,
          valid: false,
        };
        this.error = error.message;
      }
    },

    async login() {
      this.loggingIn = true;
      this.error = "";
      this.notice = "";

      try {
        const payload = await this.api("/api/login", {
          method: "POST",
          body: JSON.stringify(this.loginForm),
        });
        this.applyPayload(payload);
        this.authMode = "login";
        this.syncUrlWithState({ replace: true });
      } catch (error) {
        this.error = error.message;
        this.toast("error", error.message);
      } finally {
        this.loggingIn = false;
        this.authLoading = false;
      }
    },

    async register() {
      this.registering = true;
      this.error = "";
      this.notice = "";

      try {
        const payload = await this.api("/api/register", {
          method: "POST",
          body: JSON.stringify(this.registerForm),
        });
        this.applyPayload(payload);
        this.registerForm = {
          username: "",
          email: "",
          displayName: "",
          password: "",
          passwordConfirmation: "",
        };
        this.authMode = "login";
        this.notice = "Conta criada com sucesso.";
        this.toast("success", this.notice);
        this.syncUrlWithState({ replace: true });
      } catch (error) {
        this.error = error.message;
        this.toast("error", error.message);
      } finally {
        this.registering = false;
        this.authLoading = false;
      }
    },

    async logout() {
      try {
        await this.api("/api/logout", {
          method: "POST",
        });
      } catch (error) {
        this.error = error.message;
      } finally {
        this.resetAppState();
        this.syncUrlWithState({ replace: true });
      }
    },

    openPasswordModal() {
      this.notice = "";
      this.error = "";
      this.passwordModal = {
        open: true,
        currentPassword: "",
        newPassword: "",
        passwordConfirmation: "",
      };
      this.closeProfileMenu();
    },

    closePasswordModal() {
      this.passwordModal = {
        open: false,
        currentPassword: "",
        newPassword: "",
        passwordConfirmation: "",
      };
    },

    openForgotPasswordModal(syncHistory = true) {
      this.error = "";
      this.notice = "";
      this.forgotPasswordModal = {
        open: true,
        email: "",
        error: "",
        notice: "",
      };
      if (syncHistory) {
        this.syncUrlWithState();
      }
    },

    closeForgotPasswordModal(syncHistory = true) {
      this.forgotPasswordModal = {
        open: false,
        email: "",
        error: "",
        notice: "",
      };
      if (syncHistory && !this.user && !this.passwordResetView.token) {
        this.syncUrlWithState();
      }
    },

    exitPasswordResetFlow() {
      this.clearPasswordResetView();
      this.authMode = "login";
      this.syncUrlWithState({ replace: true });
      this.error = "";
      this.notice = "";
    },

    async changePassword() {
      this.changingPassword = true;
      this.error = "";
      this.notice = "";

      try {
        const payload = await this.api("/api/change-password", {
          method: "POST",
          body: JSON.stringify({
            ...this.passwordModal,
            monthKey: this.activeMonth,
          }),
        });
        this.applyPayload(payload);
        this.closePasswordModal();
        this.notice = payload.message || "Senha alterada com sucesso.";
        this.toast("success", this.notice);
      } catch (error) {
        this.error = error.message;
        this.toast("error", error.message);
      } finally {
        this.changingPassword = false;
      }
    },

    async requestPasswordReset() {
      this.resettingPassword = true;
      this.error = "";
      this.notice = "";
      this.forgotPasswordModal.error = "";
      this.forgotPasswordModal.notice = "";

      try {
        const payload = await this.api("/api/password-reset/request", {
          method: "POST",
          body: JSON.stringify(this.forgotPasswordModal),
        });
        this.forgotPasswordModal.notice = payload.message;
        this.closeForgotPasswordModal(false);
        this.toast("success", payload.message);
      } catch (error) {
        this.forgotPasswordModal.error = error.message;
        this.toast("error", error.message);
      } finally {
        this.resettingPassword = false;
      }
    },

    async completePasswordReset() {
      this.resettingPassword = true;
      this.error = "";
      this.notice = "";

      try {
        const payload = await this.api("/api/password-reset/complete", {
          method: "POST",
          body: JSON.stringify({
            token: this.passwordResetView.token,
            newPassword: this.passwordResetView.newPassword,
            passwordConfirmation: this.passwordResetView.passwordConfirmation,
          }),
        });
        window.history.replaceState({}, "", window.location.pathname);
        this.clearPasswordResetView();
        this.authMode = "login";
        this.notice = payload.message || "Senha redefinida com sucesso.";
        this.toast("success", this.notice);
      } catch (error) {
        this.error = error.message;
        this.toast("error", error.message);
      } finally {
        this.resettingPassword = false;
      }
    },

    buildEmptyMonth(monthKey) {
      return {
        monthKey,
        salary: 0,
        summary: {
          salary: 0,
          total: 0,
          paid: 0,
          pending: 0,
          balance: 0,
          monthStartProjection: 0,
          quinzenaProjection: 0,
        },
        entries: [],
      };
    },

    selectContextMonth(monthKey) {
      if (!monthKey) {
        return;
      }

      // Update UI state immediately; bootstrap will reconcile with server.
      this.activeMonth = monthKey;
      this.monthPicker = monthKey;
      this.syncMonthPickerPanelYear(monthKey);
      this.month = this.buildEmptyMonth(monthKey);
      this.lastAutoRolloverAt = "";
      this.salaryInput = "";
      this.entryAmountInputs = {};
      this.error = "";

      const savedMonth = this.months.find((item) => item.monthKey === monthKey);
      if (savedMonth) {
        this.bootstrap(monthKey);
      }
    },

    setPage(pageKey) {
      const currentPath = this.normalizePath(window.location.pathname);
      if (currentPath === PRIVATE_ROUTES.adminUsers && !["adminUsers", "overview"].includes(pageKey)) {
        this.toast("warning", "Você está na área de administração. Use \"Voltar ao Dindin\" para sair.");
        return;
      }

      if (pageKey === "adminUsers" && !this.user?.isAdmin) {
        this.toast("error", "Sem acesso.");
        this.activePage = "overview";
        this.syncUrlWithState({ replace: true });
        return;
      }

      this.activePage = pageKey;
      this.syncUrlWithState();
      window.scrollTo({ top: 0, behavior: "smooth" });

      if (pageKey === "adminUsers") {
        this.closeMonthPicker();
        this.loadAdminUsers();
      }
    },

    setAuthMode(mode, { syncHistory = true } = {}) {
      this.authMode = mode;
      if (mode !== "login") {
        this.closeForgotPasswordModal(false);
      }
      if (syncHistory) {
        this.syncUrlWithState();
      }
    },

    handlePopState() {
      this.error = "";
      this.notice = "";
      this.applyRouteFromLocation();

      const resetToken = this.getResetTokenFromLocation();
      if (resetToken) {
        this.loadPasswordResetToken(resetToken);
      } else {
        this.clearPasswordResetView();
      }
    },

    handleMonthSelection() {
      const nextMonth = this.monthPicker || this.activeMonth;
      if (!nextMonth || nextMonth === this.activeMonth) {
        return;
      }

      this.selectContextMonth(nextMonth);
    },

    toggleMonthPicker(event) {
      this.closeProfileMenu();
      const opening = !this.monthPickerPanel.open;

      if (opening) {
        this.syncMonthPickerPanelYear(this.monthPicker || this.activeMonth);
      }

      const nextPanel = {
        ...this.monthPickerPanel,
        open: opening,
      };

      if (opening && event && event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        const popoverWidth = 280;
        const gutter = 16;
        const left = Math.min(Math.max(rect.left, gutter), window.innerWidth - popoverWidth - gutter);
        const top = rect.bottom + 10;
        nextPanel.position = { top, left };
      }

      this.monthPickerPanel = nextPanel;
    },

    closeMonthPicker() {
      this.monthPickerPanel = {
        ...this.monthPickerPanel,
        open: false,
      };
    },

    shiftMonthPickerYear(offset) {
      this.monthPickerPanel = {
        ...this.monthPickerPanel,
        year: this.monthPickerPanel.year + offset,
      };
    },

    selectMonthFromPicker(monthKey) {
      this.monthPicker = monthKey;
      this.closeMonthPicker();
      this.handleMonthSelection();
    },

    syncMonthPickerPanelYear(monthKey) {
      const year = Number(String(monthKey || "").slice(0, 4));
      if (!Number.isFinite(year)) {
        return;
      }

      this.monthPickerPanel = {
        ...this.monthPickerPanel,
        year,
      };
    },

    buildMonthKey(year, month) {
      return `${year}-${String(month).padStart(2, "0")}`;
    },

    isPickerMonthActive(monthKey) {
      return monthKey === (this.monthPicker || this.activeMonth);
    },

    openObservationModal(item, targetType) {
      this.observationModal = {
        open: true,
        title: item.name,
        text: item.observation || "",
        targetId: item.id,
        targetType,
      };
    },

    closeObservationModal() {
      this.observationModal = {
        open: false,
        title: "",
        text: "",
        targetId: "",
        targetType: "",
      };
    },

    async saveObservation() {
      const modal = this.observationModal;
      const isTemplate = modal.targetType === "template";
      const url = isTemplate
        ? `/api/templates/${modal.targetId}/observation`
        : `/api/entries/${modal.targetId}/observation`;

      try {
        const payload = await this.api(url, {
          method: "PATCH",
          body: JSON.stringify({
            monthKey: this.activeMonth,
            observation: modal.text,
          }),
        });
        this.applyPayload(payload);
        this.closeObservationModal();
      } catch (error) {
        this.error = error.message;
      }
    },

    async deleteEntry(entry) {
      this.openConfirmModal({
        title: "Excluir gasto",
        message: `Deseja excluir o gasto "${entry.name}" deste mês?`,
        confirmText: "Excluir",
        cancelText: "Cancelar",
        tone: "danger",
        action: "delete-entry",
        payload: entry,
      });
    },

    async deleteCurrentMonth() {
      if (!this.hasSavedActiveMonth) {
        const message = "Este mês ainda não foi salvo, então não há nada para excluir.";
        this.error = message;
        this.toast("warning", message);
        return;
      }

      this.openConfirmModal({
        title: `Excluir ${this.formatMonthLabel(this.activeMonth)}`,
        message:
          `Os lançamentos desse mês serão removidos. ` +
          `Cadastros recorrentes criados nesse mês passarão a valer a partir do mês seguinte.`,
        confirmText: "Excluir mês",
        cancelText: "Cancelar",
        tone: "danger",
        action: "delete-month",
        payload: { monthKey: this.activeMonth },
      });
    },

    async deleteTemplate(template) {
      this.openConfirmModal({
        title: "Excluir cadastro",
        message:
          `Deseja excluir o cadastro "${template.name}"? ` +
          `Ele será removido do mês atual e não aparecerá nos próximos meses.`,
        confirmText: "Excluir",
        cancelText: "Cancelar",
        tone: "danger",
        action: "delete-template",
        payload: template,
      });
    },

    async saveSalary() {
      this.savingSalary = true;
      this.error = "";

      try {
        const payload = await this.api("/api/salary", {
          method: "POST",
          body: JSON.stringify({
            monthKey: this.activeMonth,
            salary: this.parseMoneyInput(this.salaryInput),
          }),
        });
        this.applyPayload(payload);
        this.toast("success", "Salário salvo.");
      } catch (error) {
        this.error = error.message;
        this.toast("error", error.message);
      } finally {
        this.savingSalary = false;
      }
    },

    validateTemplateForm() {
      const errors = {};
      const amount = this.parseMoneyInput(this.templateAmountInput);

      if (!String(this.form.name || "").trim()) {
        errors.name = "Informe um nome.";
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        errors.amount = "Informe um valor maior que zero.";
      }

      if (!String(this.form.paymentMethod || "").trim()) {
        errors.paymentMethod = "Selecione a forma de pagamento.";
      }

      this.formErrors = errors;
      return Object.keys(errors).length === 0;
    },

    async createTemplate() {
      this.creatingTemplate = true;
      this.error = "";
      this.formErrors = {};

      if (!this.validateTemplateForm()) {
        this.creatingTemplate = false;
        this.toast("warning", "Revise os campos destacados.");
        return;
      }

      try {
        const targetMonth = this.activeMonth;
        const payload = await this.api("/api/templates", {
          method: "POST",
          body: JSON.stringify({
            monthKey: targetMonth,
            name: this.form.name,
            amount: this.parseMoneyInput(this.templateAmountInput),
            cycle: this.form.cycle,
            paymentMethod: this.form.paymentMethod,
            observation: this.form.observation,
            isVariable: this.form.isVariable,
          }),
        });

        this.applyPayload(payload);
        this.form.name = "";
        this.form.cycle = "Inicio Do Mes";
        this.form.paymentMethod = "";
        this.form.observation = "";
        this.form.isVariable = true;
        this.templateAmountInput = "";
        this.toast("success", "Cadastro adicionado.");
      } catch (error) {
        this.error = error.message;
        this.toast("error", error.message);
      } finally {
        this.creatingTemplate = false;
      }
    },

    async saveEntry(entry) {
      this.savingEntries = { ...this.savingEntries, [entry.id]: true };
      this.error = "";

      try {
        const payload = await this.api(`/api/entries/${entry.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            amount: this.parseMoneyInput(this.entryAmountInputs[entry.id]),
            cycle: entry.cycle,
            status: entry.status,
          }),
        });
        this.applyPayload(payload);
        this.toast("success", "Gasto salvo.");
      } catch (error) {
        this.error = error.message;
        this.toast("error", error.message);
      } finally {
        this.savingEntries = { ...this.savingEntries, [entry.id]: false };
      }
    },

    selectMonth(monthKey) {
      if (monthKey === this.activeMonth) {
        return;
      }

      this.selectContextMonth(monthKey);
    },

    async api(url, options = {}) {
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
        },
        ...options,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const isPasswordResetApi = String(url || "").startsWith("/api/password-reset/");
        if (response.status === 401 && !isPasswordResetApi) {
          this.resetAppState();
        }
        throw new Error(payload.message || "Falha ao falar com a API.");
      }

      return payload;
    },

    getResetTokenFromLocation() {
      const params = new URLSearchParams(window.location.search);
      const tokenFromSearch = params.get("token") || params.get("resetToken");
      if (tokenFromSearch) {
        return tokenFromSearch;
      }

      const hash = String(window.location.hash || "");
      const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
      return hashParams.get("token") || hashParams.get("resetToken") || "";
    },

    formatCurrency(value) {
      return currencyFormatter.format(Number(value) || 0);
    },

    formatMoneyInput(value) {
      const cents = Math.round((Number(value) || 0) * 100);
      return (cents / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },

    parseMoneyInput(value) {
      const normalized = String(value || "")
        .replace(/\./g, "")
        .replace(",", ".")
        .replace(/[^\d.-]/g, "");
      return Number(normalized) || 0;
    },

    maskMoneyValue(rawValue) {
      const digits = String(rawValue || "").replace(/\D/g, "");
      if (!digits) {
        return "";
      }

      return (Number(digits) / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },

    updateSalaryInput(value) {
      this.salaryInput = this.maskMoneyValue(value);
    },

    updateTemplateAmountInput(value) {
      this.templateAmountInput = this.maskMoneyValue(value);
    },

    updateEntryAmountInput(entryId, value) {
      this.entryAmountInputs = {
        ...this.entryAmountInputs,
        [entryId]: this.maskMoneyValue(value),
      };
    },

    formatDateTime(value) {
      return value ? dateTimeFormatter.format(new Date(value)) : "-";
    },

    formatMonthLabel(monthKey) {
      return this.capitalize(monthFormatter.format(new Date(`${monthKey}-01T12:00:00`)));
    },

    capitalize(text) {
      return text.charAt(0).toUpperCase() + text.slice(1);
    },

    statusLabel(status) {
      return {
        pending: "Pendente",
        paid: "Pago",
        saved: "Guardado",
      }[status] || status;
    },

    statusClass(status) {
      return {
        pending: "status-pending",
        paid: "status-paid",
        saved: "status-saved",
      }[status] || "";
    },

    handleKeydown(event) {
      if (event.key !== "Escape") {
        return;
      }

      if (this.observationModal.open) {
        this.closeObservationModal();
      }

      if (this.passwordModal.open) {
        this.closePasswordModal();
      }

      if (this.forgotPasswordModal.open) {
        this.closeForgotPasswordModal();
      }

      if (this.monthPickerPanel.open) {
        this.closeMonthPicker();
      }
    },

    handleViewportChange() {
      if (this.monthPickerPanel.open) {
        this.closeMonthPicker();
      }

      if (this.profileMenuOpen) {
        this.closeProfileMenu();
      }
    },

    handleDocumentClick(event) {
      if (!this.profileMenuOpen) {
        return;
      }

      const root = this.$refs.profileMenu;
      if (root && root.contains && root.contains(event.target)) {
        return;
      }

      this.closeProfileMenu();
    },
  },

  mounted() {
    window.addEventListener("keydown", this.handleKeydown);
    window.addEventListener("popstate", this.handlePopState);
    window.addEventListener("resize", this.handleViewportChange);
    window.addEventListener("scroll", this.handleViewportChange, { passive: true });
    document.addEventListener("click", this.handleDocumentClick);
    this.restoreSession();
  },

  beforeUnmount() {
    window.removeEventListener("keydown", this.handleKeydown);
    window.removeEventListener("popstate", this.handlePopState);
    window.removeEventListener("resize", this.handleViewportChange);
    window.removeEventListener("scroll", this.handleViewportChange);
    document.removeEventListener("click", this.handleDocumentClick);
  },

  template: `
    <div class="shell">
      <section v-if="authLoading" class="panel">
        Carregando sessão...
      </section>

      <section v-if="!authLoading && !user && passwordResetView.token" class="panel auth-panel">
        <div class="auth-copy">
          <h2>Redefinir senha</h2>
          <p class="template-meta" v-if="passwordResetView.valid">
            Link valido para {{ passwordResetView.email }} ate {{ formatDateTime(passwordResetView.expiresAt) }}.
          </p>
          <p class="template-meta" v-if="!passwordResetView.valid">
            Confira se o link ainda esta valido.
          </p>
        </div>

        <section v-if="passwordResetView.loading" class="empty-state">
          Validando link de redefinicao...
        </section>

        <form v-if="!passwordResetView.loading && passwordResetView.valid" class="auth-form" @submit.prevent="completePasswordReset">
          <input
            v-model="passwordResetView.newPassword"
            class="auth-input"
            :class="{ 'field-invalid': !!error }"
            type="password"
            autocomplete="new-password"
            placeholder="Nova senha"
            @input="error = ''"
            required
          >

          <input
            v-model="passwordResetView.passwordConfirmation"
            class="auth-input"
            :class="{ 'field-invalid': !!error }"
            type="password"
            autocomplete="new-password"
            placeholder="Confirmar nova senha"
            @input="error = ''"
            required
          >

          <button type="submit" class="auth-submit" :disabled="resettingPassword">
            {{ resettingPassword ? 'Salvando...' : 'Salvar nova senha' }}
          </button>

          <button
            type="button"
            class="auth-secondary-button"
            @click="exitPasswordResetFlow"
          >
            Voltar para entrar
          </button>
        </form>

        <div v-if="!passwordResetView.loading && !passwordResetView.valid" class="auth-form">
          <button
            type="button"
            class="auth-secondary-button"
            @click="exitPasswordResetFlow"
          >
            Voltar para entrar
          </button>
        </div>

      </section>

      <section v-if="!authLoading && !user && !passwordResetView.token" class="panel auth-panel">
        <div class="auth-copy">
          <h2>{{ authMode === 'login' ? 'Entrar no Dindin' : 'Criar nova conta' }}</h2>
          <p v-if="authMode !== 'login'" class="template-meta">Crie um acesso próprio para manter seus dados separados dos demais usuários.</p>
        </div>

        <form v-if="authMode === 'login'" class="auth-form" @submit.prevent="login">
          <input
            v-model.trim="loginForm.username"
            class="auth-input"
            :class="{ 'field-invalid': !!error }"
            type="text"
            autocomplete="username"
            placeholder="Usuário"
            @input="error = ''"
            required
          >

          <input
            v-model="loginForm.password"
            class="auth-input"
            :class="{ 'field-invalid': !!error }"
            type="password"
            autocomplete="current-password"
            placeholder="Senha"
            @input="error = ''"
            required
          >

          <button type="submit" class="auth-submit" :disabled="loggingIn">
            {{ loggingIn ? 'Entrando...' : 'Entrar' }}
          </button>

          <button type="button" class="auth-text-button" @click="openForgotPasswordModal">
            Esqueceu a senha?
          </button>

          <button type="button" class="auth-link-button" @click="setAuthMode('register')">
            Criar nova conta
          </button>
        </form>

        <form v-if="authMode !== 'login'" class="auth-form" @submit.prevent="register">
          <input
            v-model.trim="registerForm.username"
            class="auth-input"
            type="text"
            autocomplete="username"
            placeholder="Usuário"
            required
          >

          <input
            v-model.trim="registerForm.email"
            class="auth-input"
            type="email"
            autocomplete="email"
            placeholder="E-mail"
            required
          >

          <input
            v-model.trim="registerForm.displayName"
            class="auth-input"
            type="text"
            autocomplete="nickname"
            placeholder="Nome de exibição"
            required
          >

          <input
            v-model="registerForm.password"
            class="auth-input"
            type="password"
            autocomplete="new-password"
            placeholder="Senha"
            required
          >

          <input
            v-model="registerForm.passwordConfirmation"
            class="auth-input"
            type="password"
            autocomplete="new-password"
            placeholder="Confirmar senha"
            required
          >

          <p class="auth-helper">Usuário com 3 a 24 caracteres, e-mail válido e senha com pelo menos 6 caracteres.</p>

          <button type="submit" class="auth-submit" :disabled="registering">
            {{ registering ? 'Criando conta...' : 'Criar conta' }}
          </button>

          <button type="button" class="auth-secondary-button" @click="setAuthMode('login')">
            Voltar para entrar
          </button>
        </form>

        <section v-if="notice" class="success-panel">
          <strong>Sucesso:</strong> {{ notice }}
        </section>

        <section v-if="error" class="error-panel">
          <strong>Erro:</strong> {{ error }}
        </section>
      </section>

      <div v-if="forgotPasswordModal.open" class="modal-backdrop" @click.self="closeForgotPasswordModal">
        <section class="modal-card modal-card-compact" role="dialog" aria-modal="true" aria-label="Recuperar senha">
          <div class="section-heading modal-heading">
            <div>
              <p class="section-kicker">Acesso</p>
              <h2>Encontre sua conta</h2>
              <p class="template-meta">Insira seu e-mail para receber um link temporário válido por 60 minutos.</p>
            </div>
            <button class="collapse-button" type="button" @click="closeForgotPasswordModal" aria-label="Fechar recuperacao de senha">
              <span class="collapse-arrow">&larr;</span>
            </button>
          </div>

          <form class="stack-form" @submit.prevent="requestPasswordReset">
            <label>
              E-mail
              <input v-model.trim="forgotPasswordModal.email" type="email" autocomplete="email" placeholder="nome@exemplo.com" required>
            </label>

            <div class="templates-actions-row">
              <button type="submit" :disabled="resettingPassword">
                {{ resettingPassword ? 'Enviando...' : 'Continuar' }}
              </button>
              <button class="ghost-button detail-button" type="button" @click="closeForgotPasswordModal">
                Cancelar
              </button>
            </div>
          </form>
        </section>
      </div>

      <template v-if="!authLoading && user">
      <header class="hero">
        <div class="hero-copy">
          <div class="brand-block">
            <p class="eyebrow">Controle financeiro local</p>
            <h1>Dindin</h1>
            <p class="hero-lead">Seus meses, cadastros e lançamentos em um fluxo simples e direto.</p>
          </div>
        </div>

        <aside class="hero-card">
          <template v-if="adminMode">
            <p class="hero-card-label">Administração</p>
            <h2>Usuários</h2>
            <p class="hero-card-meta">Administrador: {{ user.displayName }}</p>
            <p class="hero-card-meta">Gerencie criação e edição de contas do Dindin.</p>
          </template>
          <template v-if="!adminMode">
            <p class="hero-card-label">Mês selecionado</p>
            <h2>{{ monthTitle }}</h2>
            <p class="hero-card-meta">Usuário: {{ user.displayName }}</p>
            <p v-if="hasSavedActiveMonth" class="hero-card-meta">Última geração: {{ formatDateTime(lastAutoRolloverAt) }}</p>
            <p v-if="!hasSavedActiveMonth" class="hero-card-meta">Mês em pré-visualização. Os dados só serão gravados quando você salvar algo neste mês.</p>
          </template>
        </aside>
      </header>

      <div class="page-bar" v-if="!loading">
        <div class="page-bar-primary">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <button
              v-for="(item, index) in breadcrumbItems"
              :key="item.key"
              type="button"
              class="breadcrumb-link"
              :class="{ 'is-current': index === breadcrumbItems.length - 1 }"
              @click="setPage(item.key)"
            >
              {{ item.label }}
            </button>
          </nav>

          <div v-if="!adminMode" class="page-tabs">
            <button
              v-for="(label, key) in { overview: 'Visão geral', templates: 'Cadastros', entries: 'Lançamentos', details: 'Detalhes' }"
              :key="key"
              type="button"
              class="page-tab"
              :class="{ 'is-active': activePage === key }"
              @click="setPage(key)"
            >
              {{ label }}
            </button>
          </div>

          <div v-if="adminMode" class="page-tabs">
            <button type="button" class="page-tab is-active" @click="setPage('adminUsers')">
              Usuários
            </button>
            <button type="button" class="page-tab" @click="setPage('overview')">
              Voltar ao Dindin
            </button>
          </div>
        </div>

        <div class="month-switcher" v-if="!adminMode">
          <div class="month-switcher-field">
            <span class="month-switcher-label">Mês</span>
            <div class="month-picker-anchor">
              <button type="button" class="month-picker-trigger" @click="toggleMonthPicker($event)">
                <span>{{ monthPickerLabel }}</span>
                <span class="month-picker-icon">&#9662;</span>
              </button>
            </div>
          </div>
          <div class="profile-menu" ref="profileMenu">
            <button type="button" class="profile-trigger" @click.stop="toggleProfileMenu">
              <img class="profile-avatar" :src="avatarDataUrl" alt="" aria-hidden="true">
              <span class="profile-trigger-text">
                <span class="profile-trigger-name">{{ user.displayName }}</span>
                <span class="profile-trigger-sub">Conta</span>
              </span>
              <span class="profile-trigger-chevron">&#9662;</span>
            </button>

            <div v-if="profileMenuOpen" class="profile-dropdown" @click.stop>
              <button
                v-if="user.isAdmin"
                type="button"
                class="profile-item admin-nav-button"
                @click="closeProfileMenu(); setPage('adminUsers')"
              > <span class="admin-nav-text">{{ adminMenuLabel }}</span>
                AdministraÃ§Ã£o
              </button>
              <button type="button" class="profile-item" @click="openProfileModal">Editar perfil</button>
              <button type="button" class="profile-item" @click="openPasswordModal">Trocar senha</button>
              <button type="button" class="profile-item profile-item-danger" @click="logout">Sair</button>
            </div>
          </div>
        </div>

        <div class="month-switcher" v-if="adminMode">
          <div class="profile-menu" ref="profileMenu">
            <button type="button" class="profile-trigger" @click.stop="toggleProfileMenu">
              <img class="profile-avatar" :src="avatarDataUrl" alt="" aria-hidden="true">
              <span class="profile-trigger-text">
                <span class="profile-trigger-name">{{ user.displayName }}</span>
                <span class="profile-trigger-sub">Admin</span>
              </span>
              <span class="profile-trigger-chevron">&#9662;</span>
            </button>

            <div v-if="profileMenuOpen" class="profile-dropdown" @click.stop>
              <button type="button" class="profile-item" @click="openProfileModal">Editar perfil</button>
              <button type="button" class="profile-item" @click="openPasswordModal">Trocar senha</button>
              <button type="button" class="profile-item profile-item-danger" @click="logout">Sair</button>
            </div>
          </div>
        </div>
      </div>

      <teleport to="body">
        <div v-if="monthPickerPanel.open && !adminMode" class="month-picker-layer" aria-hidden="true">
          <div class="month-picker-backdrop" @click="closeMonthPicker"></div>
          <div
            class="month-picker-popover month-picker-popover-teleport"
            :style="{ top: monthPickerPanel.position.top + 'px', left: monthPickerPanel.position.left + 'px' }"
            @click.stop
          >
            <div class="month-picker-header">
              <button type="button" class="month-picker-nav" @click="shiftMonthPickerYear(-1)">&lsaquo;</button>
              <strong>{{ monthPickerPanel.year }}</strong>
              <button type="button" class="month-picker-nav" @click="shiftMonthPickerYear(1)">&rsaquo;</button>
            </div>
            <div class="month-picker-grid">
              <button
                v-for="item in monthPickerMonths"
                :key="item.monthKey"
                type="button"
                class="month-picker-cell"
                :class="{ 'is-active': isPickerMonthActive(item.monthKey) }"
                @click="selectMonthFromPicker(item.monthKey)"
              >
                {{ item.label }}
              </button>
            </div>
          </div>
        </div>
      </teleport>

      <main class="layout" v-if="!loading">
        <section v-if="activePage === 'overview'" class="panel months-panel">
          <div class="section-heading">
            <div>
              <p class="section-kicker">Histórico</p>
              <h2>Meses salvos</h2>
            </div>
            <div class="history-actions">
              <button class="ghost-button danger-button" type="button" @click="deleteCurrentMonth">Excluir mês</button>
            </div>
          </div>

          <div class="month-chips">
            <button
              v-for="item in months"
              :key="item.monthKey"
              type="button"
              class="month-chip"
              :class="{ active: item.monthKey === activeMonth }"
              @click="selectMonth(item.monthKey)"
            >
              <strong>{{ formatMonthLabel(item.monthKey) }}</strong>
              <span>{{ formatCurrency(item.salary) }}</span>
            </button>
          </div>
        </section>

        <section v-if="activePage === 'overview'" class="panel">
          <div class="section-heading">
            <div>
              <p class="section-kicker">Resumo</p>
              <h2>Visão geral do mês</h2>
            </div>
          </div>

          <div class="salary-box">
            <label for="salary">Salário do mês</label>
            <div class="salary-input-group">
              <input
                id="salary"
                :value="salaryInput"
                type="text"
                inputmode="decimal"
                placeholder="0,00"
                @input="updateSalaryInput($event.target.value)"
              >
              <button type="button" @click="saveSalary" :disabled="savingSalary">
                {{ savingSalary ? 'Salvando...' : 'Salvar salário' }}
              </button>
            </div>
          </div>

            <div class="summary-grid">
              <article class="summary-card" :class="'summary-tone-' + card.tone" v-for="card in summaryCards" :key="card.label">
                <p class="summary-label">{{ card.label }}</p>
                <strong class="summary-value">{{ card.value }}</strong>
                <span class="summary-meta">{{ card.meta }}</span>
              </article>
            </div>
          </section>

        <section v-if="activePage === 'entries'" class="panel">
          <div class="section-heading">
            <div>
              <p class="section-kicker">Lançamentos</p>
              <h2>Gastos do mês</h2>
            </div>
          </div>

          <div class="expense-groups">
            <section v-for="group in groupedEntries" :key="group.cycle">
              <div class="expense-group-title">
                <h3>{{ group.title }}</h3>
                <p class="expense-meta">{{ group.entries.length }} gasto(s) recorrente(s)</p>
              </div>

              <div class="expense-grid" v-if="group.entries.length">
                <article class="expense-card" v-for="entry in group.entries" :key="entry.id">
                  <div class="expense-main">
                    <div>
                      <div class="expense-topline">
                        <h3 class="expense-name">{{ entry.name }}</h3>
                        <div class="template-badges">
                          <span class="status-pill" :class="statusClass(entry.status)">{{ statusLabel(entry.status) }}</span>
                          <span class="flag-pill" :class="entry.isVariable ? 'flag-variable' : 'flag-fixed'">
                            {{ entry.isVariable ? 'Variável' : 'Fixo' }}
                          </span>
                        </div>
                      </div>
                      <p class="expense-meta">
                        {{ entry.paymentMethod || 'Sem forma de pagamento' }}
                      </p>
                    </div>
                    <strong class="expense-amount">{{ formatCurrency(entry.amount) }}</strong>
                  </div>

                  <div class="expense-actions">
                    <label>
                      Valor
                      <input
                        :value="entryAmountInputs[entry.id] || ''"
                        type="text"
                        inputmode="decimal"
                        placeholder="0,00"
                        @input="updateEntryAmountInput(entry.id, $event.target.value)"
                      >
                    </label>

                    <label>
                      Pagar na
                      <select v-model="entry.cycle">
                        <option value="Inicio Do Mes">Início do mês</option>
                        <option value="Quinzena">Quinzena</option>
                      </select>
                    </label>

                    <label>
                      Status
                      <select v-model="entry.status">
                        <option value="pending">Pendente</option>
                        <option value="paid">Pago</option>
                        <option value="saved">Guardado</option>
                      </select>
                    </label>

                    <button type="button" @click="saveEntry(entry)" :disabled="savingEntries[entry.id]">
                      {{ savingEntries[entry.id] ? 'Salvando...' : 'Salvar' }}
                    </button>
                  </div>

                  <div class="expense-secondary-actions">
                    <button class="ghost-button observation-button" type="button" @click="openObservationModal(entry, 'entry')">
                      Detalhar observação
                    </button>
                    <button class="ghost-button danger-button" type="button" @click="deleteEntry(entry)">
                      Excluir gasto
                    </button>
                  </div>
                </article>
              </div>

              <div class="empty-state" v-if="!group.entries.length">Nenhum gasto cadastrado para este ciclo.</div>
            </section>
          </div>
        </section>

        <section v-if="activePage === 'templates'" class="panel">
          <div class="section-heading">
            <div>
              <p class="section-kicker">Cadastro</p>
              <h2>Cadastros</h2>
            </div>
          </div>

          <div class="templates-single-column">
            <div class="subsection-heading">
              <h3>Novo gasto fixo</h3>
            </div>

            <form class="stack-form" @submit.prevent="createTemplate">
              <div class="form-row form-row-single">
                <label>
                  Nome
                  <input
                    v-model.trim="form.name"
                    type="text"
                    placeholder="Ex.: Internet"
                    :class="{ 'field-invalid': !!formErrors.name }"
                    :aria-invalid="!!formErrors.name"
                    :title="formErrors.name || ''"
                    required
                  >
                </label>

                <label>
                  Valor padrao
                  <input
                    :value="templateAmountInput"
                    type="text"
                    inputmode="decimal"
                    placeholder="0,00"
                    :class="{ 'field-invalid': !!formErrors.amount }"
                    :aria-invalid="!!formErrors.amount"
                    :title="formErrors.amount || ''"
                    @input="updateTemplateAmountInput($event.target.value)"
                  >
                </label>

                <label>
                  Pagar na
                  <select v-model="form.cycle">
                    <option value="Inicio Do Mes">Início do mês</option>
                    <option value="Quinzena">Quinzena</option>
                  </select>
                </label>

                <label>
                  Forma de pagamento
                  <select
                    v-model="form.paymentMethod"
                    :class="{ 'field-invalid': !!formErrors.paymentMethod }"
                    :aria-invalid="!!formErrors.paymentMethod"
                    :title="formErrors.paymentMethod || ''"
                  >
                    <option value="">Selecione</option>
                    <option value="Pix">Pix</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Outros">Outros</option>
                  </select>
                </label>
              </div>

              <label>
                Observação
                <textarea
                  v-model.trim="form.observation"
                  rows="3"
                  placeholder="Ex.: vencimento no dia 10, confirmar no portal ou alguma regra importante desse cadastro."
                ></textarea>
              </label>

              <label class="inline-check">
                <input v-model="form.isVariable" type="checkbox">
                Valor varia todo mês
              </label>

              <div class="templates-actions-row">
                <button type="submit" :disabled="creatingTemplate">
                  {{ creatingTemplate ? 'Adicionando...' : 'Adicionar gasto' }}
                </button>
                <button class="ghost-button detail-button" type="button" @click="setPage('details')">
                  Ir para detalhes
                </button>
              </div>
            </form>
          </div>
        </section>

        <section v-if="activePage === 'adminUsers'" class="panel admin-panel">
          <div class="section-heading">
            <div>
              <p class="section-kicker">Admin</p>
              <h2>Usuários</h2>
              <p class="template-meta">Gerencie contas locais do Dindin.</p>
            </div>
            <div class="history-actions">
              <button type="button" class="ghost-button detail-button" @click="loadAdminUsers" :disabled="adminLoading">
                {{ adminLoading ? 'Atualizando...' : 'Atualizar' }}
              </button>
              <button type="button" @click="openAdminCreateModal">Criar usuário</button>
            </div>
          </div>

          <div v-if="adminLoading" class="empty-state">Carregando usuários...</div>

          <div v-if="!adminLoading" class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Usuário</th>
                  <th>E-mail</th>
                  <th>Admin</th>
                  <th>Último login</th>
                  <th>Criado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in adminUsers" :key="item.id">
                  <td>
                    <div class="admin-user-cell">
                      <img class="profile-avatar admin-avatar" :src="item.avatarDataUrl || avatarFallbackDataUrlFor(item.displayName, item.username)" alt="" aria-hidden="true">
                      <div class="admin-user-copy">
                        <strong>{{ item.displayName }}</strong>
                        <span class="template-meta">id: {{ item.id.slice(0, 8) }}</span>
                      </div>
                    </div>
                  </td>
                  <td>{{ item.username }}</td>
                  <td>{{ item.email }}</td>
                  <td>
                    <span class="flag-pill" :class="item.isAdmin ? 'flag-variable' : 'flag-fixed'">
                      {{ item.isAdmin ? 'Sim' : 'Não' }}
                    </span>
                  </td>
                  <td>{{ formatAdminDate(item.lastLoginAt) }}</td>
                  <td>{{ formatAdminDate(item.createdAt) }}</td>
                  <td>
                    <button type="button" class="ghost-button detail-button admin-action" @click="openAdminEditModal(item)">
                      Editar
                    </button>
                  </td>
                </tr>
                <tr v-if="!adminUsers.length">
                  <td colspan="7" class="empty-state">Nenhum usuário encontrado.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-if="activePage === 'details'" class="panel">
          <div class="section-heading">
            <div>
              <p class="section-kicker">Detalhes</p>
              <h2>Todos os gastos cadastrados</h2>
              <p class="template-meta">Mostrando os lançamentos salvos de {{ monthTitle }}.</p>
            </div>
          </div>

          <div v-if="detailCards.length" class="modal-template-grid page-detail-grid">
            <article class="template-card" v-for="template in detailCards" :key="'page-' + template.id">
              <div class="template-card-header">
                <div>
                  <h3>{{ template.name }}</h3>
                  <p class="template-meta">{{ template.cycle }} &bull; {{ template.paymentMethod || 'Sem forma de pagamento' }}</p>
                  <div class="template-badges">
                    <span class="flag-pill" :class="template.isVariable ? 'flag-variable' : 'flag-fixed'">
                      {{ template.isVariable ? 'Variável' : 'Fixo' }}
                    </span>
                    <span class="status-pill" :class="statusClass(template.status)">
                      {{ statusLabel(template.status) }}
                    </span>
                  </div>
                </div>
                <strong>{{ formatCurrency(template.amount) }}</strong>
              </div>
              <p class="template-meta">
                {{ template.startMonth === activeMonth
                  ? 'Lançamento criado neste mês.'
                  : 'Lançamento recorrente exibido neste mês.' }}
              </p>
              <p class="template-meta">Valendo a partir de {{ formatMonthLabel(template.startMonth) }}</p>
              <div class="template-edit-grid template-readonly-grid">
                <label>
                  Valor em {{ monthTitle }}
                  <input :value="formatMoneyInput(template.amount)" type="text" readonly tabindex="-1">
                </label>

                <label>
                  Pagar na
                  <input :value="template.cycle" type="text" readonly tabindex="-1">
                </label>

                <label>
                  Forma de pagamento
                  <input :value="template.paymentMethod || ''" type="text" readonly tabindex="-1">
                </label>
              </div>
              <p class="template-meta">
                {{ template.isVariable ? 'Valor pode mudar a cada mês.' : 'Este valor será copiado para os próximos meses.' }}
              </p>
              <label v-if="template.observation" class="observation-field template-readonly-observation">
                Observação
                <textarea :value="template.observation" rows="4" readonly tabindex="-1"></textarea>
              </label>
            </article>
          </div>
          <div v-if="!detailCards.length" class="empty-state">Nenhum lançamento salvo neste mês.</div>
        </section>

        <section v-if="error" class="panel error-panel">
          <strong>Erro:</strong> {{ error }}
        </section>

        <section v-if="notice" class="panel success-panel">
          <strong>Sucesso:</strong> {{ notice }}
        </section>
      </main>

      <section class="panel" v-if="loading">
        Carregando aplicacao...
      </section>

      <div v-if="observationModal.open" class="modal-backdrop" @click.self="closeObservationModal">
        <section class="modal-card modal-card-compact" role="dialog" aria-modal="true" aria-label="Observação do cadastro">
          <div class="section-heading modal-heading">
            <div>
              <p class="section-kicker">Observação</p>
              <h2>{{ observationModal.title }}</h2>
            </div>
            <button class="collapse-button" type="button" @click="closeObservationModal" aria-label="Fechar observação">
              <span class="collapse-arrow">&larr;</span>
            </button>
          </div>

          <div class="observation-copy">
            <label class="observation-field">
              Texto da observação
              <textarea v-model.trim="observationModal.text" rows="6"></textarea>
            </label>
          </div>

          <div class="templates-actions-row">
            <button type="button" @click="saveObservation">
              Salvar observação
            </button>
            <button class="ghost-button detail-button" type="button" @click="closeObservationModal">
              Cancelar
            </button>
          </div>
        </section>
      </div>

      <div v-if="passwordModal.open" class="modal-backdrop" @click.self="closePasswordModal">
        <section class="modal-card modal-card-compact" role="dialog" aria-modal="true" aria-label="Alterar senha">
          <div class="section-heading modal-heading">
            <div>
              <p class="section-kicker">Conta</p>
              <h2>Alterar senha</h2>
              <p class="template-meta">Usuario: {{ user.displayName }}</p>
            </div>
            <button class="collapse-button" type="button" @click="closePasswordModal" aria-label="Fechar alteracao de senha">
              <span class="collapse-arrow">&larr;</span>
            </button>
          </div>

          <form class="stack-form" @submit.prevent="changePassword">
            <label>
              Senha atual
              <input v-model="passwordModal.currentPassword" type="password" autocomplete="current-password" required>
            </label>

            <label>
              Nova senha
              <input v-model="passwordModal.newPassword" type="password" autocomplete="new-password" required>
            </label>

            <label>
              Confirmar nova senha
              <input v-model="passwordModal.passwordConfirmation" type="password" autocomplete="new-password" required>
            </label>

            <div class="templates-actions-row">
              <button type="submit" :disabled="changingPassword">
                {{ changingPassword ? 'Salvando...' : 'Salvar nova senha' }}
              </button>
              <button class="ghost-button detail-button" type="button" @click="closePasswordModal">
                Cancelar
              </button>
            </div>
          </form>
        </section>
      </div>

      <div v-if="profileModal.open" class="modal-backdrop" @click.self="closeProfileModal">
        <section class="modal-card modal-card-compact" role="dialog" aria-modal="true" aria-label="Perfil">
          <div class="section-heading modal-heading">
            <div>
              <p class="section-kicker">Conta</p>
              <h2>Editar perfil</h2>
            </div>
            <button class="collapse-button" type="button" @click="closeProfileModal" aria-label="Fechar perfil">
              <span class="collapse-arrow">&larr;</span>
            </button>
          </div>

          <form class="stack-form" @submit.prevent="saveProfile">
            <div class="profile-editor">
              <img
                class="profile-avatar profile-avatar-lg"
                :src="profileModal.avatarDataUrl || avatarFallbackDataUrl"
                alt=""
                aria-hidden="true"
              >
              <div class="profile-editor-actions">
                <input
                  ref="avatarFile"
                  class="sr-only"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  @change="onAvatarFileSelected"
                >
                <div class="profile-editor-buttons">
                  <button
                    type="button"
                    class="ghost-button detail-button"
                    :disabled="profileModal.saving"
                    @click="pickAvatarFile"
                  >
                    Alterar foto
                  </button>
                  <button
                    v-if="profileModal.avatarDataUrl"
                    type="button"
                    class="ghost-button danger-button"
                    :disabled="profileModal.saving"
                    @click="clearAvatarFile"
                  >
                    Remover
                  </button>
                </div>
                <p class="template-meta">PNG, JPG, WEBP ou GIF (até 250 KB).</p>
              </div>
            </div>

            <label>
              Nome de exibição
              <input v-model.trim="profileModal.displayName" type="text" autocomplete="name" required>
            </label>

            <div class="templates-actions-row">
              <button type="submit" :disabled="profileModal.saving">
                {{ profileModal.saving ? 'Salvando...' : 'Salvar' }}
              </button>
              <button class="ghost-button detail-button" type="button" :disabled="profileModal.saving" @click="closeProfileModal">
                Cancelar
              </button>
            </div>
          </form>
        </section>
      </div>

      <div v-if="adminCreateModal.open" class="modal-backdrop" @click.self="closeAdminCreateModal">
        <section class="modal-card modal-card-compact" role="dialog" aria-modal="true" aria-label="Criar usuário">
          <div class="section-heading modal-heading">
            <div>
              <p class="section-kicker">Admin</p>
              <h2>Criar usuário</h2>
              <p class="template-meta">Defina um usuário, e-mail e senha.</p>
            </div>
            <button class="collapse-button" type="button" @click="closeAdminCreateModal" aria-label="Fechar criação de usuário">
              <span class="collapse-arrow">&larr;</span>
            </button>
          </div>

          <form class="stack-form" @submit.prevent="createAdminUser">
            <label>
              Nome de exibição
              <input v-model.trim="adminCreateModal.displayName" type="text" autocomplete="name" required>
            </label>

            <label>
              Usuário
              <input v-model.trim="adminCreateModal.username" type="text" autocomplete="username" required>
            </label>

            <label>
              E-mail
              <input v-model.trim="adminCreateModal.email" type="email" autocomplete="email" required>
            </label>

            <label>
              Senha
              <input v-model="adminCreateModal.password" type="password" autocomplete="new-password" required>
            </label>

            <label>
              Confirmar senha
              <input v-model="adminCreateModal.passwordConfirmation" type="password" autocomplete="new-password" required>
            </label>

            <label class="inline-check">
              <input v-model="adminCreateModal.isAdmin" type="checkbox">
              Conceder acesso de administrador
            </label>

            <div class="templates-actions-row">
              <button type="submit" :disabled="adminCreateModal.saving">
                {{ adminCreateModal.saving ? 'Criando...' : 'Criar usuário' }}
              </button>
              <button class="ghost-button detail-button" type="button" :disabled="adminCreateModal.saving" @click="closeAdminCreateModal">
                Cancelar
              </button>
            </div>
          </form>
        </section>
      </div>

      <div v-if="adminEditModal.open" class="modal-backdrop" @click.self="closeAdminEditModal">
        <section class="modal-card modal-card-compact" role="dialog" aria-modal="true" aria-label="Editar usuÃ¡rio">
          <div class="section-heading modal-heading">
            <div>
              <p class="section-kicker">Admin</p>
              <h2>Editar usuÃ¡rio</h2>
              <p class="template-meta">Atualize nome, usuÃ¡rio, e-mail e permissÃµes.</p>
            </div>
            <button class="collapse-button" type="button" @click="closeAdminEditModal" aria-label="Fechar ediÃ§Ã£o de usuÃ¡rio">
              <span class="collapse-arrow">&larr;</span>
            </button>
          </div>

          <form class="stack-form" @submit.prevent="saveAdminUserEdit">
            <label>
              Nome de exibiÃ§Ã£o
              <input v-model.trim="adminEditModal.displayName" type="text" autocomplete="name" required>
            </label>

            <label>
              UsuÃ¡rio
              <input v-model.trim="adminEditModal.username" type="text" autocomplete="username" required>
            </label>

            <label>
              E-mail
              <input v-model.trim="adminEditModal.email" type="email" autocomplete="email" required>
            </label>

            <label class="inline-check">
              <input v-model="adminEditModal.isAdmin" type="checkbox">
              Conceder acesso de administrador
            </label>

            <div class="templates-actions-row">
              <button type="submit" :disabled="adminEditModal.saving">
                {{ adminEditModal.saving ? 'Salvando...' : 'Salvar alteraÃ§Ãµes' }}
              </button>
              <button class="ghost-button detail-button" type="button" :disabled="adminEditModal.saving" @click="closeAdminEditModal">
                Cancelar
              </button>
            </div>
          </form>
        </section>
      </div>

      <div v-if="confirmModal.open" class="modal-backdrop" @click.self="closeConfirmModal">
        <section class="modal-card modal-card-compact" role="dialog" aria-modal="true" aria-label="Confirmação">
          <div class="section-heading modal-heading">
            <div>
              <p class="section-kicker">Confirmação</p>
              <h2>{{ confirmModal.title }}</h2>
            </div>
            <button class="collapse-button" type="button" @click="closeConfirmModal" aria-label="Fechar confirmação">
              <span class="collapse-arrow">&larr;</span>
            </button>
          </div>

          <p class="template-meta confirm-copy">{{ confirmModal.message }}</p>

          <div class="templates-actions-row">
            <button
              type="button"
              :class="confirmModal.tone === 'danger' ? 'danger-solid' : ''"
              :disabled="confirmModal.busy"
              @click="confirmModalConfirm"
            >
              {{ confirmModal.busy ? 'Processando...' : confirmModal.confirmText }}
            </button>
            <button class="ghost-button detail-button" type="button" :disabled="confirmModal.busy" @click="closeConfirmModal">
              {{ confirmModal.cancelText }}
            </button>
          </div>
        </section>
      </div>

      <teleport to="body">
        <div class="toast-stack" aria-live="polite" aria-relevant="additions">
          <div
            v-for="toast in toasts"
            :key="toast.id"
            class="toast"
            :class="toast.type === 'error' ? 'toast-error' : toast.type === 'warning' ? 'toast-warning' : 'toast-success'"
            role="status"
            @click="dismissToast(toast.id)"
          >
            <strong class="toast-title">{{ toast.type === 'error' ? 'Erro' : toast.type === 'warning' ? 'Alerta' : 'Sucesso' }}</strong>
            <span class="toast-message">{{ toast.message }}</span>
          </div>
        </div>
      </teleport>
      </template>
    </div>
  `,
}).mount("#app");
