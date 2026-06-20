import { computed, reactive } from "vue";
import { getSession, logout as logoutRequest } from "../api/auth";

const session = reactive({
  checked: false,
  loading: false,
  authenticated: false,
  user: null,
});

export async function ensureSession({ force = false } = {}) {
  if (session.checked && !force) {
    return session;
  }

  session.loading = true;
  try {
    const payload = await getSession();
    session.authenticated = Boolean(payload.authenticated);
    session.user = payload.user || null;
  } catch {
    session.authenticated = false;
    session.user = null;
  } finally {
    session.checked = true;
    session.loading = false;
  }

  return session;
}

export function setAuthenticatedUser(user) {
  session.checked = true;
  session.authenticated = Boolean(user);
  session.user = user || null;
}

export async function endSession() {
  try {
    await logoutRequest();
  } finally {
    session.checked = true;
    session.authenticated = false;
    session.user = null;
  }
}

export function useSession() {
  return {
    state: session,
    user: computed(() => session.user),
    authenticated: computed(() => session.authenticated),
  };
}
