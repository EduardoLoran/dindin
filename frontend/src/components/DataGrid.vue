<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { TabulatorFull as Tabulator } from "tabulator-tables";

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  options: { type: Object, default: () => ({}) },
  refreshKey: { type: [String, Number, Boolean], default: "" },
});
const emit = defineEmits(["cell-edited", "cell-selected", "data-filtered", "ready"]);
const element = ref(null);
let table = null;
let externalFilter = null;
const valueFilters = new Map();

onMounted(() => {
  buildTable();
  window.addEventListener("dindin-value-privacy-change", refreshSensitiveValues);
});
onBeforeUnmount(() => {
  window.removeEventListener("dindin-value-privacy-change", refreshSensitiveValues);
  destroyTable();
});

watch(() => props.refreshKey, buildTable);
watch(() => props.rows, async (rows) => {
  await nextTick();
  if (!table) {
    await buildTable();
    return;
  }
  await table.replaceData(cloneRows(rows));
  table.clearHistory?.();
}, { deep: false });

async function buildTable() {
  await nextTick();
  destroyTable();
  if (!element.value) return;
  externalFilter = null;
  valueFilters.clear();
  table = new Tabulator(element.value, {
    index: "id",
    data: cloneRows(props.rows),
    columns: prepareColumns(props.columns),
    layout: "fitColumns",
    placeholder: "Nenhum lançamento encontrado.",
    history: true,
    editTriggerEvent: "dblclick",
    selectableRange: 1,
    selectableRangeColumns: true,
    selectableRangeRows: true,
    headerSortClickElement: "icon",
    rowHeader: {
      field: "_rownum",
      formatter: "rownum",
      accessorClipboard: "rownum",
      width: 46,
      minWidth: 46,
      frozen: true,
      resizable: false,
      headerSort: false,
      hozAlign: "center",
      headerHozAlign: "center",
    },
    clipboard: true,
    clipboardCopyStyled: false,
    clipboardPasteAction: "range",
    ...props.options,
  });
  table.on("cellEdited", (cell) => emit("cell-edited", cell.getRow().getData(), cell.getField(), cell.getOldValue()));
  table.on("cellClick", (_event, cell) => emitSelectedCell(cell));
  table.on("rangeChanged", (range) => {
    const cell = range.getCells().flat(Infinity).find((item) => typeof item?.getField === "function");
    if (cell) emitSelectedCell(cell);
  });
  table.on("dataFiltered", (_filters, rows) => emit("data-filtered", rows.map((row) => row.getData())));
  table.on("tableBuilt", () => emit("ready"));
}

function destroyTable() {
  if (table) table.destroy();
  table = null;
}

function cloneRows(rows) {
  return rows.map((row) => ({ ...row }));
}

function prepareColumns(columns) {
  return columns.map((column) => {
    const prepared = { ...column };
    if (column.columns) prepared.columns = prepareColumns(column.columns);

    if (column.field && column.headerValueFilter) {
      const filterOptions = column.headerValueFilter === true ? {} : column.headerValueFilter;
      prepared.headerPopup = (_event, component, onRendered) => buildValueFilterPopup(component, filterOptions, onRendered);
      prepared.headerPopupIcon = '<span class="dindin-column-filter__trigger" aria-hidden="true">&#9662;</span>';
    }

    delete prepared.headerValueFilter;
    return prepared;
  });
}

function buildValueFilterPopup(column, options, onRendered) {
  const field = column.getField();
  const values = uniqueColumnValues(field, options);
  const allKeys = new Set(values.map((item) => item.key));
  const applied = valueFilters.get(field);
  const selectedKeys = new Set(applied ? applied.keys : allKeys);
  const popup = document.createElement("section");
  popup.className = "dindin-column-filter";
  popup.setAttribute("aria-label", `Filtro da coluna ${column.getDefinition().title}`);

  const sortActions = document.createElement("div");
  sortActions.className = "dindin-column-filter__sort-actions";
  const currentSort = table?.getSorters?.().find((sorter) => sorter.field === field)?.dir;
  const sortAscending = popupButton(options.sortAscendingLabel || "Ordenar crescente", () => {
    table?.setSort(field, "asc");
    closeColumnPopup();
  });
  const sortDescending = popupButton(options.sortDescendingLabel || "Ordenar decrescente", () => {
    table?.setSort(field, "desc");
    closeColumnPopup();
  });
  sortAscending.classList.toggle("is-active", currentSort === "asc");
  sortDescending.classList.toggle("is-active", currentSort === "desc");
  sortActions.append(sortAscending, sortDescending);

  const filterLabel = document.createElement("strong");
  filterLabel.className = "dindin-column-filter__label";
  filterLabel.textContent = "Filtrar por valor:";

  const search = document.createElement("input");
  search.className = "dindin-column-filter__search";
  search.type = "search";
  search.placeholder = options.searchPlaceholder || "Buscar valores";
  search.setAttribute("aria-label", `Buscar valores em ${column.getDefinition().title}`);

  const selectionActions = document.createElement("div");
  selectionActions.className = "dindin-column-filter__selection-actions";
  const selectAll = popupButton("Selecionar tudo", () => {
    values.forEach((item) => selectedKeys.add(item.key));
    syncCheckboxes();
  });
  const clear = popupButton("Limpar", () => {
    selectedKeys.clear();
    syncCheckboxes();
  });
  selectionActions.append(selectAll, clear);

  const list = document.createElement("div");
  list.className = "dindin-column-filter__values";
  const checkboxByKey = new Map();
  values.forEach((item) => {
    const label = document.createElement("label");
    label.dataset.search = normalizeSearchText(item.label);
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedKeys.has(item.key);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedKeys.add(item.key);
      else selectedKeys.delete(item.key);
    });
    const text = document.createElement("span");
    text.textContent = item.label;
    label.append(checkbox, text);
    list.append(label);
    checkboxByKey.set(item.key, checkbox);
  });

  const empty = document.createElement("p");
  empty.className = "dindin-column-filter__empty";
  empty.textContent = "Nenhum valor encontrado.";
  empty.hidden = true;

  search.addEventListener("input", () => {
    const term = normalizeSearchText(search.value.trim());
    let visible = 0;
    list.querySelectorAll("label").forEach((label) => {
      const matches = !term || label.dataset.search.includes(term);
      label.hidden = !matches;
      if (matches) visible += 1;
    });
    empty.hidden = visible > 0;
  });

  const footer = document.createElement("footer");
  const cancel = popupButton("Cancelar", closeColumnPopup);
  cancel.className = "dindin-column-filter__cancel";
  const apply = popupButton("OK", () => {
    if (selectedKeys.size === allKeys.size) valueFilters.delete(field);
    else valueFilters.set(field, { keys: new Set(selectedKeys) });
    column.getElement().classList.toggle("has-value-filter", valueFilters.has(field));
    applyCompositeFilter();
    closeColumnPopup();
  });
  apply.className = "dindin-column-filter__apply";
  footer.append(apply, cancel);

  popup.append(sortActions, filterLabel, search, selectionActions, list, empty, footer);
  onRendered(() => search.focus());
  return popup;

  function syncCheckboxes() {
    checkboxByKey.forEach((checkbox, key) => { checkbox.checked = selectedKeys.has(key); });
  }
}

function uniqueColumnValues(field, options) {
  const byKey = new Map();
  const formatter = typeof options.formatter === "function" ? options.formatter : defaultValueLabel;
  for (const row of table?.getData() || props.rows) {
    const value = row[field];
    const key = valueKey(value);
    const formatted = formatter(value, row);
    const label = formatted === undefined || formatted === null || formatted === "" ? defaultValueLabel(value) : String(formatted);
    if (!byKey.has(key)) byKey.set(key, { key, value, label });
  }
  return [...byKey.values()].sort((left, right) => left.label.localeCompare(right.label, "pt-BR", { numeric: true }));
}

function refreshSensitiveValues() {
  table?.getRows().forEach((row) => row.reformat());
  table?.redraw(true);
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function defaultValueLabel(value) {
  if (value === undefined || value === null || value === "") return "(Vazio)";
  return String(value);
}

function valueKey(value) {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function popupButton(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function closeColumnPopup() {
  window.setTimeout(() => {
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  }, 0);
}

function applyCompositeFilter() {
  if (!table) return;
  if (!externalFilter && !valueFilters.size) {
    table.clearFilter();
    return;
  }

  table.setFilter((row) => {
    if (typeof externalFilter === "function" && !externalFilter(row)) return false;
    for (const [field, filter] of valueFilters) {
      if (!filter.keys.has(valueKey(row[field]))) return false;
    }
    return true;
  });
}

function emitSelectedCell(cell) {
  const field = cell.getField();
  const columnIndex = leafFields(props.columns).indexOf(field);
  if (columnIndex < 0) return;
  emit("cell-selected", {
    address: `${columnName(columnIndex)}${cell.getRow().getPosition() || 1}`,
    field,
    value: cell.getValue(),
  });
}

function leafFields(columns) {
  return columns.flatMap((column) => column.columns ? leafFields(column.columns) : [column.field]).filter(Boolean);
}

function columnName(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function getData(range) {
  return table?.getData(range) || [];
}

function replaceData(rows) {
  return table?.replaceData(cloneRows(rows)).then(() => table.clearHistory?.());
}

function undo() { table?.undo(); }
function redo() { table?.redo(); }
function refreshGroups() {
  if (props.options.groupHeader) table?.setGroupHeader(props.options.groupHeader);
}
function setFilter(filter) {
  if (!table) return;
  externalFilter = Array.isArray(filter) && !filter.length ? null : filter;
  applyCompositeFilter();
}
function clearFilters() {
  externalFilter = null;
  valueFilters.clear();
  leafColumnComponents(table?.getColumns() || []).forEach((column) => column.getElement().classList.remove("has-value-filter"));
  table?.clearFilter(true);
}

function leafColumnComponents(columns) {
  return columns.flatMap((column) => {
    const children = column.getSubColumns?.() || [];
    return children.length ? leafColumnComponents(children) : [column];
  });
}

defineExpose({ getData, replaceData, undo, redo, refreshGroups, setFilter, clearFilters });
</script>

<template><div ref="element" class="dindin-data-grid"></div></template>
