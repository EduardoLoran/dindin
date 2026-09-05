<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { Dialog, DialogPanel, DialogTitle, Tab, TabGroup, TabList, TabPanel, TabPanels, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "../components/AppIcon.vue";
import CategoryManagerDialog from "../components/CategoryManagerDialog.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import DataGrid from "../components/DataGrid.vue";
import SalarySuggestionsDialog from "../components/SalarySuggestionsDialog.vue";
import { confirmBankImport, getBankImport, getBankImports, previewOfx, undoBankImport } from "../api/bankImports";
import { getCategories } from "../api/categories";
import { formatCurrency, formatMonth } from "../utils/formatters";

const fileInput = ref(null);
const tabIndex = ref(0);
const dragActive = ref(false);
const pendingFile = ref(null);
const directionDialogOpen = ref(false);
const salaryDialogOpen = ref(false);
const importDirections = reactive({ expense: true, income: true });
const preview = ref(null);
const rows = ref([]);
const categories = ref([]);
const categoryManagerOpen = ref(false);
const history = ref([]);
const pagination = ref({ page: 1, totalPages: 1, total: 0 });
const loadingHistory = ref(false);
const uploading = ref(false);
const confirming = ref(false);
const undoing = ref(false);
const undoTarget = ref(null);
const detailImport = ref(null);
const loadingDetails = ref(false);
const error = ref("");
const notice = ref("");

const selectedRows = computed(() => rows.value.filter((item) => item.action !== "ignore" && !item.blockedReason && !item.duplicate));
const selectedExpenses = computed(() => selectedRows.value.filter((item) => item.direction === "expense").reduce((total, item) => total + Number(item.amount || 0), 0));
const selectedIncome = computed(() => selectedRows.value.filter((item) => item.direction === "income").reduce((total, item) => total + Number(item.amount || 0), 0));
const blockedCount = computed(() => rows.value.filter((item) => item.blockedReason).length);
const duplicateCount = computed(() => rows.value.filter((item) => item.duplicate).length);
const salaryCandidates = computed(() => rows.value.filter((item) => item.direction === "income" && !item.blockedReason && !item.duplicate));

const columns = computed(() => [
  { title: "Data", field: "postedDate", width: 108, formatter: (cell) => formatDate(cell.getValue()), headerValueFilter: true },
  { title: "Descrição", field: "description", minWidth: 220, widthGrow: 2, editor: "input", editable: editableRow, headerValueFilter: true },
  { title: "Valor", field: "amount", width: 125, hozAlign: "right", formatter: (cell) => formatCurrency(cell.getValue()) },
  { title: "Tipo", field: "direction", width: 105, formatter: (cell) => tag(directionLabel(cell.getValue()), cell.getValue()), headerValueFilter: { formatter: directionLabel } },
  { title: "Período", field: "monthKey", width: 135, formatter: (cell) => formatMonth(cell.getValue()), headerValueFilter: { formatter: formatMonth } },
  {
    title: "Categoria", field: "categoryId", width: 165, editor: "list", editable: actionableRow,
    editorParams: (cell) => ({ values: categoryOptions(cell.getRow().getData().direction) }),
    formatter: (cell) => categoryTag(cell.getValue()),
    headerValueFilter: { formatter: categoryName },
  },
  {
    title: "Decisão", field: "action", width: 190, editor: "list", editable: (cell) => !isLocked(cell.getRow().getData()),
    editorParams: (cell) => ({ values: actionOptions(cell.getRow().getData()) }),
    formatter: (cell) => actionLabel(cell.getValue(), cell.getRow().getData()),
    headerValueFilter: { formatter: (value) => actionLabel(value) },
  },
  {
    title: "Ciclo", field: "cycle", width: 140, editor: "list", editable: actionableRow,
    editorParams: { values: { "Inicio Do Mes": "Início do mês", Quinzena: "Quinzena" } },
    formatter: (cell) => cell.getValue() === "Inicio Do Mes" ? "Início do mês" : "Quinzena",
    headerValueFilter: { formatter: (value) => value === "Inicio Do Mes" ? "Início do mês" : "Quinzena" },
  },
  { title: "Pagamento", field: "paymentMethod", width: 150, editor: "input", editable: actionableRow, headerValueFilter: true },
  { title: "Situação", field: "reviewStatus", width: 135, formatter: (cell) => statusTag(cell.getRow().getData()), headerValueFilter: true },
]);

const gridOptions = {
  clipboard: "copy",
  history: true,
  rowHeader: false,
  selectableRangeRows: true,
  columnDefaults: { resizable: "header", tooltip: true, headerSort: true },
  maxHeight: "min(58vh, 650px)",
  placeholder: "Nenhuma movimentação encontrada.",
};

function editableRow(cell) { return !isLocked(cell.getRow().getData()); }
function actionableRow(cell) { return !isLocked(cell.getRow().getData()) && cell.getRow().getData().action !== "ignore"; }
function isLocked(row) { return Boolean(row.blockedReason || row.duplicate); }
function directionLabel(value) { return value === "income" ? "Receita" : "Gasto"; }
function blockedLabel(value) { return value === "month_closed" ? "Mês fechado" : value === "unsupported_currency" ? "Moeda não suportada" : "Bloqueado"; }
function actionLabel(value, row = {}) {
  return ({ create: "Criar novo gasto", match: row.suggestedEntryName ? `Conciliar: ${row.suggestedEntryName}` : "Conciliar lançamento", income: "Receita extra", salary: "Vincular ao salário", ignore: "Ignorar" }[value] || value);
}
function actionOptions(row) {
  if (row.direction === "income") return { income: "Receita extra", salary: "Vincular ao salário", ignore: "Ignorar" };
  return row.suggestedEntryId
    ? { match: `Conciliar com ${row.suggestedEntryName}`, create: "Criar novo gasto", ignore: "Ignorar" }
    : { create: "Criar novo gasto", ignore: "Ignorar" };
}
function tag(label, tone) {
  const element = document.createElement("span");
  element.className = `import-tag import-tag--${tone}`;
  element.textContent = label;
  return element;
}
function statusTag(row) {
  if (row.duplicate) return tag("Duplicado", "duplicate");
  if (row.blockedReason) return tag(blockedLabel(row.blockedReason), "blocked");
  return tag(row.action === "ignore" ? "Ignorado" : "Pronto", row.action === "ignore" ? "ignored" : "ready");
}
function categoryOptions(direction) {
  return Object.fromEntries(categories.value
    .filter((category) => category.direction === "both" || category.direction === direction)
    .map((category) => [category.id, category.name]));
}
function categoryName(categoryId) {
  return categories.value.find((category) => category.id === categoryId)?.name || "Outros";
}
function categoryTag(categoryId) {
  const category = categories.value.find((item) => item.id === categoryId);
  const element = document.createElement("span");
  element.className = "import-category-tag";
  const dot = document.createElement("i");
  dot.style.backgroundColor = category?.color || "#8C8492";
  const label = document.createElement("span");
  label.textContent = category?.name || "Outros";
  element.append(dot, label);
  return element;
}
function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function updateRow(nextRow, field, oldValue) {
  const changedCategory = field === "categoryId" && nextRow.categoryId !== oldValue;
  rows.value = rows.value.map((item) => item.id === nextRow.id
    ? { ...nextRow, rememberCategory: changedCategory || nextRow.rememberCategory, reviewStatus: reviewStatus(nextRow) }
    : item);
}

function selectFile(file) {
  if (!file) return;
  error.value = "";
  notice.value = "";
  if (!file.name.toLowerCase().endsWith(".ofx")) {
    error.value = "Selecione um arquivo com extensão .ofx.";
    return;
  }
  pendingFile.value = file;
  directionDialogOpen.value = true;
  if (fileInput.value) fileInput.value.value = "";
}

async function uploadSelectedFile() {
  if (!pendingFile.value || (!importDirections.expense && !importDirections.income)) return;
  const file = pendingFile.value;
  directionDialogOpen.value = false;
  uploading.value = true;
  try {
    const directions = [importDirections.expense ? "expense" : "", importDirections.income ? "income" : ""].filter(Boolean);
    const payload = await previewOfx(file, directions);
    preview.value = payload.import;
    rows.value = payload.import.items.map((item) => {
      const draft = { ...item, action: item.defaultAction, cycle: item.suggestedCycle, categoryId: item.suggestedCategoryId, rememberCategory: false };
      return { ...draft, reviewStatus: reviewStatus(draft) };
    });
    salaryDialogOpen.value = importDirections.income && salaryCandidates.value.length > 0;
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    uploading.value = false;
    pendingFile.value = null;
  }
}

function cancelDirectionSelection() {
  directionDialogOpen.value = false;
  pendingFile.value = null;
}

function reviewStatus(item) {
  if (item.duplicate) return "Duplicado";
  if (item.blockedReason) return blockedLabel(item.blockedReason);
  return item.action === "ignore" ? "Ignorado" : "Pronto";
}

function onDrop(event) {
  dragActive.value = false;
  selectFile(event.dataTransfer?.files?.[0]);
}

async function confirmImport() {
  if (!preview.value || confirming.value) return;
  if (!selectedRows.value.length) {
    error.value = duplicateCount.value
      ? "Todas as movimentações deste arquivo já foram importadas. Exclua ou desfaça a importação anterior antes de tentar novamente."
      : "Selecione pelo menos uma movimentação para importar.";
    return;
  }
  const processedCount = selectedRows.value.length;
  confirming.value = true;
  error.value = "";
  try {
    const decisions = rows.value.map((item) => ({
      itemId: item.id,
      action: item.action,
      entryId: item.action === "match" ? item.suggestedEntryId : undefined,
      description: item.description,
      cycle: item.cycle,
      paymentMethod: item.paymentMethod,
      categoryId: item.categoryId,
      rememberCategory: Boolean(item.rememberCategory),
    }));
    const result = await confirmBankImport(preview.value.id, decisions);
    preview.value = result.import;
    notice.value = `${processedCount} ${processedCount === 1 ? "movimentação processada" : "movimentações processadas"} com sucesso.`;
    await loadHistory(1);
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    confirming.value = false;
  }
}

function applySalarySelection(selectedIds) {
  const selected = new Set(selectedIds);
  rows.value = rows.value.map((row) => {
    if (row.direction !== "income" || row.blockedReason || row.duplicate) return row;
    const next = { ...row, action: selected.has(row.id) ? "salary" : "income" };
    return { ...next, reviewStatus: reviewStatus(next) };
  });
  salaryDialogOpen.value = false;
}

function startNewImport() {
  preview.value = null;
  rows.value = [];
  error.value = "";
  notice.value = "";
}

async function loadHistory(page = 1) {
  loadingHistory.value = true;
  try {
    const payload = await getBankImports(page, 20);
    history.value = payload.items;
    pagination.value = payload.pagination;
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    loadingHistory.value = false;
  }
}

async function confirmUndo() {
  if (!undoTarget.value) return;
  undoing.value = true;
  error.value = "";
  try {
    await undoBankImport(undoTarget.value.id);
    undoTarget.value = null;
    notice.value = "Importação desfeita com sucesso.";
    await loadHistory(pagination.value.page);
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    undoing.value = false;
  }
}

async function openDetails(item) {
  loadingDetails.value = true;
  error.value = "";
  try {
    const payload = await getBankImport(item.id);
    detailImport.value = payload.import;
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    loadingDetails.value = false;
  }
}

async function loadCategories() {
  try {
    const payload = await getCategories();
    categories.value = payload.categories;
  } catch (requestError) {
    error.value = requestError.message;
  }
}

function applyCategoryUpdate(nextCategories) {
  categories.value = nextCategories;
  rows.value = rows.value.map((row) => {
    if (nextCategories.some((category) => category.id === row.categoryId)) return row;
    const fallback = nextCategories.find((category) => category.slug === (row.direction === "income" ? "receitas" : "outros"))
      || nextCategories.find((category) => category.slug === "outros");
    return { ...row, categoryId: fallback?.id || "", rememberCategory: false };
  });
}

onMounted(() => Promise.all([loadHistory(), loadCategories()]));
</script>

<template>
  <div class="workspace-page bank-import-page">
    <header class="workspace-hero bank-import-hero">
      <div><p class="dashboard-eyebrow">Integração financeira</p><h1>Importação bancária</h1><p>Traga seu extrato OFX, confira cada movimentação e mantenha o Dindin atualizado sem digitação repetitiva.</p></div>
      <div class="bank-import-hero__actions">
        <span class="bank-import-privacy"><AppIcon name="check" :size="17" />O arquivo original não é armazenado</span>
        <button class="workspace-secondary" type="button" @click="categoryManagerOpen = true"><AppIcon name="tag" :size="17" />Gerenciar categorias</button>
      </div>
    </header>

    <p v-if="error" class="workspace-error" role="alert">{{ error }}</p>
    <div v-if="notice" class="templates-toast"><AppIcon name="check" />{{ notice }}</div>

    <TabGroup :selected-index="tabIndex" @change="tabIndex = $event">
      <TabList class="bank-import-tabs">
        <Tab v-slot="{ selected }" as="template"><button type="button" :class="{ 'is-active': selected }"><AppIcon name="upload" :size="17" />Nova importação</button></Tab>
        <Tab v-slot="{ selected }" as="template"><button type="button" :class="{ 'is-active': selected }"><AppIcon name="receipt" :size="17" />Histórico <span>{{ pagination.total }}</span></button></Tab>
      </TabList>

      <TabPanels>
        <TabPanel>
          <section v-if="!preview" class="workspace-panel import-upload-panel">
            <div class="import-steps"><span class="is-active" data-short-label="Arquivo"><b>1</b>Arquivo</span><i></i><span data-short-label="Revisão"><b>2</b>Conferência</span><i></i><span data-short-label="Conclusão"><b>3</b>Conclusão</span></div>
            <button class="import-dropzone" :class="{ 'is-dragging': dragActive }" type="button" :disabled="uploading" @click="fileInput?.click()" @dragover.prevent="dragActive = true" @dragleave.prevent="dragActive = false" @drop.prevent="onDrop">
              <span><AppIcon name="upload" :size="28" /></span>
              <strong>{{ uploading ? "Lendo seu extrato..." : "Selecione ou arraste um arquivo OFX" }}</strong>
              <small>Conta-corrente ou cartão · máximo de 5 MB</small>
            </button>
            <input ref="fileInput" class="sr-only" type="file" accept=".ofx,application/x-ofx" @change="selectFile($event.target.files?.[0])" />
            <div class="import-help"><AppIcon name="bank-import" :size="19" /><div><strong>Como obter o arquivo?</strong><p>No aplicativo ou internet banking, procure por “Extrato”, “Exportar” ou “Baixar OFX”.</p></div></div>
          </section>

          <template v-else>
            <section class="import-steps import-steps--review"><span data-short-label="Arquivo"><b>1</b>Arquivo</span><i></i><span data-short-label="Revisão" :class="{ 'is-active': preview.status === 'draft' }"><b>2</b>Conferência</span><i></i><span data-short-label="Conclusão" :class="{ 'is-active': preview.status === 'completed' }"><b>3</b>Conclusão</span></section>
            <section class="workspace-panel import-file-summary">
              <div><span><AppIcon name="bank-import" /></span><div><small>{{ preview.bankName }}</small><strong>{{ preview.filename }}</strong><p>{{ preview.accountLabel }} · {{ formatDate(preview.dateFrom) }} a {{ formatDate(preview.dateTo) }}</p></div></div>
              <dl><div><dt>Gastos</dt><dd>{{ formatCurrency(preview.expenseTotal) }}</dd></div><div><dt>Receitas</dt><dd>{{ formatCurrency(preview.incomeTotal) }}</dd></div><div><dt>Movimentações</dt><dd>{{ preview.itemCount }}</dd></div></dl>
              <button v-if="preview.status === 'draft'" type="button" @click="startNewImport">Trocar arquivo</button>
            </section>

            <section v-if="preview.status === 'draft'" class="workspace-panel import-review-panel">
              <div class="workspace-panel__heading"><div><h2>Confira antes de importar</h2><p>Edite com duplo clique. Ao corrigir uma categoria, o Dindin aprende para as próximas importações.</p></div><div class="import-review-badges"><span v-if="duplicateCount">{{ duplicateCount }} duplicado(s)</span><span v-if="blockedCount">{{ blockedCount }} bloqueado(s)</span></div></div>
              <DataGrid :rows="rows" :columns="columns" :options="gridOptions" :refresh-key="preview.id" @cell-edited="updateRow" />
            </section>

            <section v-else class="workspace-panel import-complete">
              <span><AppIcon name="check" :size="30" /></span><h2>Importação concluída</h2><p>As movimentações confirmadas já aparecem nos lançamentos e nos resumos dos respectivos meses.</p>
              <div><RouterLink class="workspace-primary" to="/lancamentos">Ver lançamentos</RouterLink><button class="workspace-secondary" type="button" @click="startNewImport">Importar outro arquivo</button></div>
            </section>

            <aside v-if="preview.status === 'draft'" class="import-confirm-bar">
              <div><strong>{{ selectedRows.length }} {{ selectedRows.length === 1 ? "movimentação selecionada" : "movimentações selecionadas" }}</strong><span v-if="selectedRows.length">Gastos {{ formatCurrency(selectedExpenses) }} · Receitas {{ formatCurrency(selectedIncome) }}</span><span v-else>Nenhuma movimentação disponível para importar.</span></div>
              <button class="workspace-primary" type="button" :disabled="confirming || selectedRows.length === 0" @click="confirmImport"><AppIcon name="check" :size="17" />{{ confirming ? "Importando..." : "Confirmar importação" }}</button>
            </aside>
          </template>
        </TabPanel>

        <TabPanel>
          <section class="workspace-panel import-history-panel">
            <div class="workspace-panel__heading"><div><h2>Importações realizadas</h2><p>Consulte os arquivos processados e desfaça um lote quando necessário.</p></div></div>
            <div v-if="loadingHistory" class="workspace-empty workspace-empty--compact">Carregando histórico...</div>
            <div v-else-if="history.length" class="dynamic-table-wrap">
              <table class="dynamic-table import-history-table"><thead><tr><th>Arquivo</th><th>Instituição</th><th>Período</th><th>Gastos</th><th>Receitas</th><th>Situação</th><th></th></tr></thead><tbody>
                <tr v-for="item in history" :key="item.id"><td data-label="Arquivo"><strong>{{ item.filename }}</strong><small>{{ formatDateTime(item.completedAt || item.createdAt) }}</small></td><td data-label="Instituição">{{ item.bankName }}<small>{{ item.accountLabel }}</small></td><td data-label="Período">{{ formatDate(item.dateFrom) }}<small>até {{ formatDate(item.dateTo) }}</small></td><td data-label="Gastos">{{ formatCurrency(item.expenseTotal) }}</td><td data-label="Receitas">{{ formatCurrency(item.incomeTotal) }}</td><td data-label="Situação"><span class="import-tag" :class="item.status === 'undone' ? 'import-tag--ignored' : 'import-tag--ready'">{{ item.status === "undone" ? "Desfeita" : "Concluída" }}</span></td><td class="dynamic-table__actions import-history-actions"><button type="button" :disabled="loadingDetails" @click="openDetails(item)">Detalhes</button><button v-if="item.status === 'completed'" class="is-danger" type="button" @click="undoTarget = item">Desfazer</button></td></tr>
              </tbody></table>
            </div>
            <div v-else class="workspace-empty"><AppIcon name="bank-import" :size="34" /><h3>Nenhuma importação realizada.</h3><p>Seus arquivos processados aparecerão aqui.</p></div>
            <footer v-if="pagination.totalPages > 1" class="import-pagination"><button :disabled="pagination.page <= 1" @click="loadHistory(pagination.page - 1)">Anterior</button><span>Página {{ pagination.page }} de {{ pagination.totalPages }}</span><button :disabled="pagination.page >= pagination.totalPages" @click="loadHistory(pagination.page + 1)">Próxima</button></footer>
          </section>
        </TabPanel>
      </TabPanels>
    </TabGroup>

    <ConfirmDialog :open="Boolean(undoTarget)" title="Desfazer importação?" :message="`Os lançamentos criados por “${undoTarget?.filename || ''}” serão removidos e os conciliados serão restaurados.`" confirm-label="Desfazer importação" :busy="undoing" @close="undoTarget = null" @confirm="confirmUndo" />

    <TransitionRoot :show="Boolean(detailImport)" as="template">
      <Dialog class="dialog-root" @close="detailImport = null">
        <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden"><div class="dialog-backdrop"></div></TransitionChild>
        <div class="dialog-positioner">
          <TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden">
            <DialogPanel class="dialog-panel import-detail-dialog">
              <div class="dialog-heading"><div class="dialog-panel__icon"><AppIcon name="bank-import" /></div><button type="button" aria-label="Fechar" @click="detailImport = null"><AppIcon name="close" /></button></div>
              <DialogTitle>Detalhes da importação</DialogTitle>
              <p>{{ detailImport?.filename }} · {{ detailImport?.accountLabel }}</p>
              <div class="dynamic-table-wrap"><table class="dynamic-table import-detail-table"><thead><tr><th>Data</th><th>Descrição</th><th>Movimento</th><th>Categoria</th><th>Valor</th><th>Decisão</th></tr></thead><tbody><tr v-for="item in detailImport?.items || []" :key="item.id"><td data-label="Data">{{ formatDate(item.postedDate) }}</td><td data-label="Descrição"><strong>{{ item.description }}</strong><small>{{ item.memo || item.accountLabel }}</small></td><td data-label="Movimento">{{ directionLabel(item.direction) }}</td><td data-label="Categoria"><span class="category-inline"><i :style="{ backgroundColor: item.categoryColor }"></i>{{ item.categoryName }}</span></td><td data-label="Valor">{{ formatCurrency(item.amount) }}</td><td data-label="Decisão">{{ actionLabel(item.decision, item) }}</td></tr></tbody></table></div>
              <div class="dialog-actions"><button class="dialog-cancel" type="button" @click="detailImport = null">Fechar</button></div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </TransitionRoot>

    <TransitionRoot :show="directionDialogOpen" as="template">
      <Dialog class="dialog-root" @close="cancelDirectionSelection">
        <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden"><div class="dialog-backdrop"></div></TransitionChild>
        <div class="dialog-positioner">
          <TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden">
            <DialogPanel class="dialog-panel import-direction-dialog">
              <div class="dialog-heading"><div class="dialog-panel__icon"><AppIcon name="bank-import" /></div><button type="button" aria-label="Fechar" @click="cancelDirectionSelection"><AppIcon name="close" /></button></div>
              <DialogTitle>O que deseja importar?</DialogTitle>
              <p>Escolha quais movimentações do arquivo OFX devem entrar na conferência.</p>
              <div class="import-direction-options">
                <label :class="{ 'is-selected': importDirections.expense }"><input v-model="importDirections.expense" type="checkbox" /><span><AppIcon name="receipt" /><strong>Gastos</strong><small>Compras, pagamentos e débitos</small></span></label>
                <label :class="{ 'is-selected': importDirections.income }"><input v-model="importDirections.income" type="checkbox" /><span><AppIcon name="income" /><strong>Receitas</strong><small>Créditos e valores recebidos</small></span></label>
              </div>
              <p v-if="!importDirections.expense && !importDirections.income" class="workspace-error" role="alert">Selecione pelo menos uma opção.</p>
              <div class="dialog-actions"><button class="dialog-cancel" type="button" @click="cancelDirectionSelection">Cancelar</button><button class="workspace-primary" type="button" :disabled="!importDirections.expense && !importDirections.income" @click="uploadSelectedFile">Continuar</button></div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </TransitionRoot>

    <CategoryManagerDialog :open="categoryManagerOpen" :categories="categories" @close="categoryManagerOpen = false" @updated="applyCategoryUpdate" />
    <SalarySuggestionsDialog :open="salaryDialogOpen" :items="salaryCandidates" @confirm="applySalarySelection" />
  </div>
</template>
