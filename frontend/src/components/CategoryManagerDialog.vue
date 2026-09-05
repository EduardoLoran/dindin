<script setup>
import { reactive, ref, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";
import { createCategory, deactivateCategory, updateCategory } from "../api/categories";

const props = defineProps({
  open: { type: Boolean, default: false },
  categories: { type: Array, default: () => [] },
});
const emit = defineEmits(["close", "updated"]);

const drafts = ref([]);
const creating = reactive({ name: "", color: "#7A41C0", direction: "expense" });
const busyId = ref("");
const error = ref("");

watch(() => props.categories, syncDrafts, { immediate: true });
watch(() => props.open, (open) => {
  if (open) {
    error.value = "";
    syncDrafts();
  }
});

function syncDrafts() {
  drafts.value = props.categories.map((category) => ({ ...category }));
}

async function addCategory() {
  busyId.value = "new";
  error.value = "";
  try {
    const payload = await createCategory(creating);
    emit("updated", payload.categories);
    Object.assign(creating, { name: "", color: "#7A41C0", direction: "expense" });
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    busyId.value = "";
  }
}

async function saveCategory(category) {
  busyId.value = category.id;
  error.value = "";
  try {
    const payload = await updateCategory(category.id, {
      name: category.name,
      color: category.color,
      direction: category.direction,
    });
    emit("updated", payload.categories);
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    busyId.value = "";
  }
}

async function disableCategory(category) {
  busyId.value = category.id;
  error.value = "";
  try {
    const payload = await deactivateCategory(category.id);
    emit("updated", payload.categories);
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    busyId.value = "";
  }
}
</script>

<template>
  <TransitionRoot :show="open" as="template">
    <Dialog class="dialog-root" @close="emit('close')">
      <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden">
        <div class="dialog-backdrop"></div>
      </TransitionChild>
      <div class="dialog-positioner">
        <TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden">
          <DialogPanel class="dialog-panel category-manager-dialog">
            <div class="dialog-heading">
              <div class="dialog-panel__icon"><AppIcon name="tag" /></div>
              <button type="button" aria-label="Fechar" @click="emit('close')"><AppIcon name="close" /></button>
            </div>
            <DialogTitle>Categorias financeiras</DialogTitle>
            <p>Personalize as categorias usadas na importação e nos relatórios.</p>

            <p v-if="error" class="workspace-error" role="alert">{{ error }}</p>

            <form class="category-create-form" @submit.prevent="addCategory">
              <label><span>Nova categoria</span><input v-model="creating.name" required maxlength="40" placeholder="Ex.: Pets" /></label>
              <label><span>Aplicar em</span><select v-model="creating.direction"><option value="expense">Gastos</option><option value="income">Receitas</option><option value="both">Ambos</option></select></label>
              <label class="category-color-field"><span>Cor</span><input v-model="creating.color" type="color" /></label>
              <button class="workspace-primary" type="submit" :disabled="busyId === 'new'">{{ busyId === "new" ? "Criando..." : "Criar categoria" }}</button>
            </form>

            <div class="category-manager-list">
              <article v-for="category in drafts" :key="category.id">
                <input v-model="category.color" class="category-color-picker" type="color" :aria-label="`Cor de ${category.name}`" />
                <input v-model="category.name" maxlength="40" :aria-label="`Nome de ${category.name}`" />
                <select v-model="category.direction" :aria-label="`Tipo de ${category.name}`"><option value="expense">Gastos</option><option value="income">Receitas</option><option value="both">Ambos</option></select>
                <button type="button" :disabled="Boolean(busyId)" @click="saveCategory(category)">Salvar</button>
                <button v-if="!category.protected" class="is-danger" type="button" :disabled="Boolean(busyId)" @click="disableCategory(category)">Inativar</button>
                <span v-else class="category-protected">Padrão</span>
              </article>
            </div>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
