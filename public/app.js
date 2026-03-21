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
      theme: "light",
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

    isDarkTheme() {
      return this.theme === "dark";
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

    detailTotalAmount() {
      return this.detailCards.reduce((total, item) => total + Number(item.amount || 0), 0);
    },
  },

  methods: {
    loadThemePreference() {
      try {
        const stored = window.localStorage.getItem("dindin-theme");
        if (stored === "dark" || stored === "light") {
          return stored;
        }
      } catch (error) {
        // Ignore storage issues and keep default theme.
      }
      return "light";
    },

    applyTheme(theme) {
      const normalized = theme === "dark" ? "dark" : "light";
      this.theme = normalized;
      document.documentElement.setAttribute("data-theme", normalized);

      try {
        window.localStorage.setItem("dindin-theme", normalized);
      } catch (error) {
        // Ignore persistence errors.
      }
    },

    toggleTheme() {
      this.applyTheme(this.theme === "dark" ? "light" : "dark");
      this.closeProfileMenu();
    },

    groupTotal(entries) {
      return entries.reduce((total, entry) => total + Number(entry.amount || 0), 0);
    },

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

    cycleDisplayLabel(cycle) {
      return {
        "Inicio Do Mes": "Início do mês",
        Quinzena: "Quinzena",
      }[cycle] || cycle;
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
    this.applyTheme(this.loadThemePreference());
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

  template: document.getElementById("app-template").innerHTML,
}).mount("#app");

