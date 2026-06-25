import { computed, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import { getDashboard } from "../api/dashboard";
import { useGlobalPeriod } from "./useGlobalPeriod";

export function useMonthlyBootstrap() {
  const router = useRouter();
  const { selectedMonth, setSelectedMonth } = useGlobalPeriod();
  const payload = ref(null);
  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref("");

  const month = computed(() => payload.value?.month || null);
  const entries = computed(() => month.value?.entries || []);
  const templates = computed(() => payload.value?.templates || []);

  function applyPayload(nextPayload) {
    payload.value = nextPayload;
    setSelectedMonth(nextPayload.activeMonth);
  }

  async function load(monthKey = "", { initial = false } = {}) {
    if (initial) loading.value = true;
    else refreshing.value = true;
    error.value = "";
    try {
      let nextPayload = await getDashboard(monthKey || selectedMonth.value);
      if (initial) {
        const latestMonth = nextPayload.months?.[0]?.monthKey;
        if (!selectedMonth.value && latestMonth && latestMonth !== nextPayload.activeMonth) nextPayload = await getDashboard(latestMonth);
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

  function listenPeriodChanges(afterLoad) {
    const handler = async (event) => {
      const monthKey = event.detail?.monthKey;
      if (!monthKey || monthKey === payload.value?.activeMonth) return;
      await load(monthKey);
      afterLoad?.(payload.value);
    };
    window.addEventListener("dindin-period-change", handler);
    onBeforeUnmount(() => window.removeEventListener("dindin-period-change", handler));
  }

  return { payload, month, entries, templates, loading, refreshing, error, selectedMonth, applyPayload, load, selectMonth, changeMonth, listenPeriodChanges };
}
