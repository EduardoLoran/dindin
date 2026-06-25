<script setup>
import { computed, reactive, ref, watch } from "vue";
import { Dialog, DialogPanel, DialogTitle, TransitionChild, TransitionRoot } from "@headlessui/vue";
import AppIcon from "./AppIcon.vue";
import FormField from "./FormField.vue";
import PasswordField from "./PasswordField.vue";

const props = defineProps({
  open: Boolean,
  user: { type: Object, default: null },
  savingProfile: Boolean,
  savingPassword: Boolean,
  profileError: { type: String, default: "" },
  passwordError: { type: String, default: "" },
  notice: { type: String, default: "" },
});

const emit = defineEmits(["close", "save-profile", "change-password"]);
const profile = reactive({ displayName: "", avatarDataUrl: "" });
const password = reactive({ currentPassword: "", newPassword: "", passwordConfirmation: "" });
const errors = reactive({ displayName: "", avatar: "", currentPassword: "", newPassword: "", passwordConfirmation: "" });
const fileInput = ref(null);
const avatarSource = ref("");
const cropFrameSize = 118;
const crop = reactive({ x: 0, y: 0, zoom: 1, dragging: false, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 });

const initials = computed(() => {
  const name = String(profile.displayName || props.user?.username || "D").trim();
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
});

const cropImageStyle = computed(() => ({
  transform: `translate(${crop.x}px, ${crop.y}px) scale(${crop.zoom})`,
}));

watch(() => props.open, (open) => {
  if (!open) return;
  profile.displayName = props.user?.displayName || props.user?.username || "";
  profile.avatarDataUrl = props.user?.avatarDataUrl || "";
  avatarSource.value = profile.avatarDataUrl;
  resetCrop();
  password.currentPassword = "";
  password.newPassword = "";
  password.passwordConfirmation = "";
  Object.keys(errors).forEach((key) => { errors[key] = ""; });
});

function validateProfile() {
  errors.displayName = profile.displayName.trim().length >= 3 ? "" : "Informe ao menos 3 caracteres.";
  return !errors.displayName && !errors.avatar;
}

function validatePassword() {
  errors.currentPassword = password.currentPassword ? "" : "Informe sua senha atual.";
  errors.newPassword = password.newPassword.length >= 6 ? "" : "Use ao menos 6 caracteres.";
  errors.passwordConfirmation = password.passwordConfirmation === password.newPassword ? "" : "As senhas nao coincidem.";
  return !errors.currentPassword && !errors.newPassword && !errors.passwordConfirmation;
}

async function submitProfile() {
  if (!validateProfile()) return;
  const avatarDataUrl = avatarSource.value ? await createCroppedAvatar() : "";
  if (errors.avatar) return;
  emit("save-profile", { displayName: profile.displayName.trim(), avatarDataUrl });
}

function submitPassword() {
  if (!validatePassword()) return;
  emit("change-password", { ...password });
}

function chooseAvatar() {
  fileInput.value?.click();
}

function clearAvatar() {
  profile.avatarDataUrl = "";
  avatarSource.value = "";
  errors.avatar = "";
  resetCrop();
}

function handleAvatar(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  errors.avatar = "";
  if (!file) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    errors.avatar = "Use PNG, JPG, WEBP ou GIF.";
    return;
  }
  if (file.size > 260000) {
    errors.avatar = "Use uma imagem menor, ate cerca de 250 KB.";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    profile.avatarDataUrl = String(reader.result || "");
    avatarSource.value = profile.avatarDataUrl;
    resetCrop();
  };
  reader.onerror = () => { errors.avatar = "Nao foi possivel carregar a imagem."; };
  reader.readAsDataURL(file);
}

function resetCrop() {
  Object.assign(crop, { x: 0, y: 0, zoom: 1, dragging: false, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 });
}

function startCropDrag(event) {
  if (!avatarSource.value) return;
  crop.dragging = true;
  crop.startX = event.clientX;
  crop.startY = event.clientY;
  crop.startOffsetX = crop.x;
  crop.startOffsetY = crop.y;
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function moveCropDrag(event) {
  if (!crop.dragging) return;
  const limit = cropFrameSize * 0.45 * crop.zoom;
  crop.x = Math.max(-limit, Math.min(limit, crop.startOffsetX + event.clientX - crop.startX));
  crop.y = Math.max(-limit, Math.min(limit, crop.startOffsetY + event.clientY - crop.startY));
}

function stopCropDrag() {
  crop.dragging = false;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function createCroppedAvatar() {
  try {
    const image = await loadImage(avatarSource.value);
    const outputSize = 384;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    const baseScale = Math.max(cropFrameSize / image.naturalWidth, cropFrameSize / image.naturalHeight) * crop.zoom;
    const drawWidth = image.naturalWidth * baseScale;
    const drawHeight = image.naturalHeight * baseScale;
    const factor = outputSize / cropFrameSize;
    const drawX = ((cropFrameSize - drawWidth) / 2 + crop.x) * factor;
    const drawY = ((cropFrameSize - drawHeight) / 2 + crop.y) * factor;
    context.drawImage(image, drawX, drawY, drawWidth * factor, drawHeight * factor);
    const dataUrl = canvas.toDataURL("image/webp", 0.86);
    if (dataUrl.length > 320000) {
      errors.avatar = "Avatar muito grande. Tente uma imagem menor ou com menos detalhes.";
      return "";
    }
    return dataUrl;
  } catch {
    errors.avatar = "Nao foi possivel recortar a imagem.";
    return "";
  }
}
</script>

<template>
  <TransitionRoot :show="open" as="template">
    <Dialog class="dialog-root" @close="savingProfile || savingPassword ? undefined : emit('close')">
      <TransitionChild as="template" enter="overlay-transition" enter-from="overlay-hidden" enter-to="overlay-visible" leave="overlay-transition" leave-from="overlay-visible" leave-to="overlay-hidden">
        <div class="dialog-backdrop"></div>
      </TransitionChild>
      <div class="dialog-positioner">
        <TransitionChild as="template" enter="dialog-transition" enter-from="dialog-hidden" enter-to="dialog-visible" leave="dialog-transition" leave-from="dialog-visible" leave-to="dialog-hidden">
          <DialogPanel class="dialog-panel profile-dialog">
            <div class="profile-dialog__hero">
              <div>
                <span class="profile-dialog__icon"><AppIcon name="user" /></span>
                <div>
                  <p class="dashboard-eyebrow">Conta Dindin</p>
                  <DialogTitle>Meu perfil</DialogTitle>
                  <span>Personalize sua conta, foto e seguranca de acesso.</span>
                </div>
              </div>
              <button type="button" aria-label="Fechar" :disabled="savingProfile || savingPassword" @click="emit('close')"><AppIcon name="close" /></button>
            </div>

            <div v-if="notice" class="profile-notice" role="status"><AppIcon name="check" :size="17" />{{ notice }}</div>

            <form class="profile-section profile-section--identity" @submit.prevent="submitProfile">
              <div class="profile-section__head">
                <strong>Identidade visual</strong>
                <small>Essas informacoes aparecem no topo do sistema e no menu de perfil.</small>
              </div>

              <div class="profile-avatar-field">
                <div class="profile-cropper" :class="{ 'is-dragging': crop.dragging }">
                  <div
                    v-if="avatarSource"
                    class="profile-cropper__frame"
                    role="application"
                    aria-label="Arraste para reposicionar a foto do perfil"
                    @pointerdown="startCropDrag"
                    @pointermove="moveCropDrag"
                    @pointerup="stopCropDrag"
                    @pointercancel="stopCropDrag"
                    @pointerleave="stopCropDrag"
                  >
                    <img :src="avatarSource" alt="" :style="cropImageStyle" draggable="false" />
                    <span class="profile-cropper__hint">Arraste para ajustar</span>
                  </div>
                  <span v-else class="profile-avatar-preview"><b>{{ initials }}</b></span>
                  <label v-if="avatarSource" class="profile-zoom-control">
                    <span>Zoom</span>
                    <input v-model.number="crop.zoom" type="range" min="1" max="2.5" step="0.05" />
                  </label>
                </div>
                <div>
                  <strong>{{ profile.displayName || user?.username }}</strong>
                  <small>{{ user?.email || "Conta pessoal" }}</small>
                  <div class="profile-avatar-actions">
                    <button type="button" :disabled="savingProfile" @click="chooseAvatar">Escolher foto</button>
                    <button type="button" :disabled="savingProfile || !avatarSource" @click="resetCrop">Centralizar</button>
                    <button type="button" :disabled="savingProfile || !avatarSource" @click="clearAvatar">Remover</button>
                  </div>
                  <small class="profile-avatar-hint">PNG, JPG, WEBP ou GIF ate 250 KB.</small>
                  <small v-if="errors.avatar" class="profile-field-error">{{ errors.avatar }}</small>
                </div>
                <input ref="fileInput" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="handleAvatar" />
              </div>

              <div class="profile-field-grid">
                <FormField id="profile-name" v-model="profile.displayName" label="Nome de exibicao" autocomplete="name" :error="errors.displayName" :disabled="savingProfile" required @update:model-value="errors.displayName = ''">
                  <template #icon><AppIcon name="user" :size="18" /></template>
                </FormField>
                <div class="profile-readonly-field">
                  <span>Usuario</span>
                  <strong>@{{ user?.username }}</strong>
                  <small>O usuario e usado para entrar no sistema.</small>
                </div>
              </div>

              <p v-if="profileError" class="dialog-error">{{ profileError }}</p>
              <div class="dialog-actions profile-actions">
                <button class="dialog-cancel" type="button" :disabled="savingProfile || savingPassword" @click="emit('close')">Cancelar</button>
                <button class="dialog-save" type="submit" :disabled="savingProfile">{{ savingProfile ? "Salvando..." : "Salvar perfil" }}</button>
              </div>
            </form>

            <form class="profile-section profile-section--password" @submit.prevent="submitPassword">
              <div class="profile-section__head">
                <strong>Alterar senha</strong>
                <small>Use sua senha atual para confirmar a troca.</small>
              </div>
              <div class="profile-password-grid">
                <PasswordField id="profile-current-password" v-model="password.currentPassword" label="Senha atual" autocomplete="current-password" :error="errors.currentPassword" :disabled="savingPassword" @update:model-value="errors.currentPassword = ''" />
                <PasswordField id="profile-new-password" v-model="password.newPassword" label="Nova senha" autocomplete="new-password" :error="errors.newPassword" :disabled="savingPassword" @update:model-value="errors.newPassword = ''" />
                <PasswordField id="profile-confirm-password" v-model="password.passwordConfirmation" label="Confirmar nova senha" autocomplete="new-password" :error="errors.passwordConfirmation" :disabled="savingPassword" @update:model-value="errors.passwordConfirmation = ''" />
              </div>
              <p v-if="passwordError" class="dialog-error">{{ passwordError }}</p>
              <div class="dialog-actions profile-actions">
                <button class="dialog-save" type="submit" :disabled="savingPassword">{{ savingPassword ? "Alterando..." : "Alterar senha" }}</button>
              </div>
            </form>
          </DialogPanel>
        </TransitionChild>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
