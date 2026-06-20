import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { getDashboard } from "../api/dashboard";

export function useMonthlyBootstrap() {
  const router = useRouter();
  const payload = ref(null);
  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref("");
  const selectedMonth = ref("");

  const month = computed(() => payload.value?.month || null);
  const entries = computed(() => month.value?.entries || []);
  const templates = computed(() => payload.value?.templates || []);

  function applyPayload(nextPayload) {
    payload.value = nextPayload;
    selectedMonth.value = nextPayload.activeMonth;
  }

  async function load(monthKey = "", { initial = false } = {}) {
    if (initial) loading.value = true;
    else refreshing.value = true;
    error.value = "";
    try {
      let nextPayload = await getDashboard(monthKey);
      if (initial) {
        const latestMonth = nextPayload.months?.[0]?.monthKey;
        if (latestMonth && latestMonth !== nextPayload.activeMonth) nextPayload = await getDashboard(latestMonth);
      }
      applyPayload(nextPayload);
    } catch (loadError) {
      if (loadError.status === 401) {
        await router.replace({ name: "login" });
        return;
      }
      error.value = loadError.message;
    } finally {
      loading.value = false;
      refreshing.value = false;
    }
  }

  async function selectMonth(monthKey) {
    if (monthKey && monthKey !== selectedMonth.value) await load(monthKey);
  }

  async function changeMonth(event) {
    await selectMonth(event.target.value);
  }

  return { payload, month, entries, templates, loading, refreshing, error, selectedMonth, applyPayload, load, selectMonth, changeMonth };
}
