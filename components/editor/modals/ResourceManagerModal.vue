<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import {
  X,
  Upload,
  Trash2,
  Check,
  Image as ImageIcon,
  Search,
  Loader2,
  Plus,
  AlertCircle,
} from "lucide-vue-next";
import { useEditorState } from "~/composables/useEditorState";
import { useBlockEditor } from "~/composables/useBlockEditor";

const vFocus = {
  mounted: (el: HTMLElement) => el.focus(),
};

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits(["close", "select"]);

const images = ref<{ name: string; url: string; size: string }[]>([]);
const loading = ref(false);
const uploading = ref(false);
const searchQuery = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

async function fetchImages() {
  loading.value = true;
  try {
    const data = await $fetch("/api/uploads");
    images.value = data as any;
  } catch (error) {
    console.error("Error fetching images:", error);
  } finally {
    loading.value = false;
  }
}

async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files?.length) return;

  uploading.value = true;
  const formData = new FormData();
  for (const file of target.files) {
    formData.append("files", file);
  }

  try {
    const results = await $fetch<any[]>("/api/uploads", {
      method: "POST",
      body: formData,
    });

    if (!results || results.length === 0) {
      console.warn("Upload response was empty. This might mean the server couldn't process the files.");
      // You could add a toast or alert here if you had one
    } else {
      console.log(`Successfully uploaded ${results.length} files`);
    }
    
    await fetchImages();
  } catch (error) {
    console.error("Error uploading files:", error);
    alert(t("common.error_uploading") || "Error al subir la imagen. Verifica el tamaño y formato.");
  } finally {
    uploading.value = false;
    if (fileInput.value) fileInput.value.value = "";
  }
}

const { t } = useI18n();
const { confirmData } = useEditorState();

const editingFile = ref<string | null>(null);
const tempName = ref("");
const renameError = ref(false);

function startRenaming(image: any) {
  editingFile.value = image.name;
  // Strip extension for easier editing
  const dotIndex = image.name.lastIndexOf(".");
  tempName.value =
    dotIndex !== -1 ? image.name.substring(0, dotIndex) : image.name;
  renameError.value = false;
}

async function finishRenaming(image: any) {
  if (!editingFile.value || !tempName.value.trim()) {
    cancelRenaming();
    return;
  }

  const dotIndex = image.name.lastIndexOf(".");
  const ext = dotIndex !== -1 ? image.name.substring(dotIndex) : "";
  const newFullName = tempName.value.trim() + ext;

  if (newFullName === image.name) {
    cancelRenaming();
    return;
  }

  try {
    await $fetch("/api/uploads", {
      method: "PATCH",
      body: {
        oldName: image.name,
        newName: newFullName,
      },
    });

    // If successful, update local state if needed (or just refetch)
    await fetchImages();
    cancelRenaming();
  } catch (error: any) {
    if (error.statusCode === 409) {
      renameError.value = true;
    } else {
      console.error("Error renaming:", error);
      cancelRenaming();
    }
  }
}

function cancelRenaming() {
  editingFile.value = null;
  tempName.value = "";
  renameError.value = false;
}

async function deleteImage(filename: string) {
  confirmData.title = t("editor.image_delete_title");
  confirmData.message = t("editor.resource_manager_delete_confirm");
  confirmData.variant = "danger";
  confirmData.confirmLabel = t("editor.sidebar_delete");
  confirmData.onConfirm = async () => {
    try {
      await $fetch(`/api/uploads?filename=${filename}`, {
        method: "DELETE",
      });

      // Reset URL if it matches the deleted image
      const fullUrl = `${window.location.origin}/uploads/${filename}`;
      const relativeUrl = `/uploads/${filename}`;
      const { imageModal } = useEditorState();
      if (imageModal.src === fullUrl || imageModal.src === relativeUrl) {
        imageModal.src = "";
        // Force re-render/autosave and show placeholder
        const { applyImageSettings } = useBlockEditor();
        applyImageSettings();
      }

      await fetchImages();
    } catch (error) {
      console.error("Error deleting image:", error);
    }
  };
  confirmData.visible = true;
}

function selectImage(url: string) {
  // Use absolute URL with origin for better compatibility in emails
  const fullUrl = `${window.location.origin}${url}`;
  emit("select", fullUrl);
  emit("close");
}

const filteredImages = computed(() => {
  if (!searchQuery.value) return images.value;
  return images.value.filter((img) =>
    img.name.toLowerCase().includes(searchQuery.value.toLowerCase()),
  );
});

onMounted(() => {
  if (props.visible) {
    fetchImages();
  }
});

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      fetchImages();
    }
  },
);
</script>

<template>
  <Transition name="fade">
    <div v-if="visible" class="modal-overlay resource-manager-overlay">
      <div class="modal-backdrop" @click="$emit('close')"></div>
      <div class="modal-window resource-modal">
        <div class="modal-header">
          <div class="header-info">
            <h2>{{ $t("editor.resource_manager_title") }}</h2>
            <p>{{ $t("editor.resource_manager_subtitle") }}</p>
          </div>
          <button @click="$emit('close')" class="btn-close-minimal">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <div class="resource-toolbar">
            <div class="search-box">
              <Search :size="18" class="search-icon" />
              <input
                v-model="searchQuery"
                type="text"
                :placeholder="$t('editor.resource_manager_search')"
              />
            </div>

            <div class="toolbar-actions">
              <input
                ref="fileInput"
                type="file"
                multiple
                accept="image/*"
                class="hidden-input"
                @change="handleFileUpload"
              />
              <button
                @click="fileInput?.click()"
                class="premium-button small"
                :disabled="uploading"
              >
                <template v-if="uploading">
                  <Loader2 :size="16" class="animate-spin" />
                  {{ $t("editor.resource_manager_uploading") }}
                </template>
                <template v-else>
                  <Plus :size="16" />
                  {{ $t("editor.resource_manager_upload") }}
                </template>
              </button>
            </div>
          </div>

          <div v-if="loading" class="loading-state">
            <Loader2 :size="40" class="animate-spin" />
            <p>{{ $t("common.loading") }}</p>
          </div>

          <div v-else-if="filteredImages.length === 0" class="empty-state">
            <p v-if="searchQuery">
              {{
                $t("editor.resource_manager_empty_search", {
                  query: searchQuery,
                })
              }}
            </p>
            <button
              v-if="!searchQuery"
              @click="fileInput?.click()"
              class="premium-empty-action"
            >
              <div class="action-icon">
                <Plus :size="24" />
              </div>
              <div class="action-text">
                <span class="main-text">{{
                  $t("editor.resource_manager_first")
                }}</span>
                <span class="sub-text">{{
                  $t("editor.resource_manager_upload_sub")
                }}</span>
              </div>
            </button>
          </div>

          <div v-else class="image-grid">
            <div
              v-for="image in filteredImages"
              :key="image.name"
              class="image-card"
            >
              <div class="image-preview-box" @click="selectImage(image.url)">
                <img :src="image.url" :alt="image.name" loading="lazy" />
                <div class="image-overlay">
                  <div class="select-indicator">
                    <Check :size="20" />
                  </div>
                </div>
              </div>
              <div class="image-info">
                <div
                  v-if="editingFile === image.name"
                  class="name-edit-wrapper"
                >
                  <div class="input-container">
                    <input
                      v-model="tempName"
                      class="inline-rename-input"
                      @keyup.enter="finishRenaming(image)"
                      @keyup.esc="cancelRenaming"
                      @blur="finishRenaming(image)"
                      v-focus
                    />
                    <span class="extension-label">{{
                      image.name.substring(image.name.lastIndexOf("."))
                    }}</span>
                  </div>
                  <div v-if="renameError" class="error-badge">
                    <AlertCircle :size="12" />
                    {{ $t("editor.image_name_exists") }}
                  </div>
                </div>
                <template v-else>
                  <span
                    class="image-name"
                    :title="image.name"
                    @click.stop="startRenaming(image)"
                  >
                    {{ image.name }}
                  </span>
                  <span class="image-size">{{ image.size }}</span>
                </template>
                <button
                  @click.stop="deleteImage(image.name)"
                  class="btn-delete-img"
                  title="Eliminar"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.resource-manager-overlay {
  z-index: 10001; /* Above other modals */
}

.resource-modal {
  width: 1000px;
  max-width: 95vw;
  height: 85vh;
  display: flex;
  flex-direction: column;
  background: #0a0f1d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 50px 100px -20px rgba(0, 0, 0, 0.7),
    0 0 40px rgba(99, 102, 241, 0.1);
}

.modal-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
}

.resource-toolbar {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  align-items: center;
  width: 100%;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 0 1.25rem;
  height: 48px; /* Standard premium height */
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.search-box:focus-within {
  border-color: #6366f1;
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
}

.search-icon {
  color: #6b7280;
  flex-shrink: 0;
}

.search-box input {
  background: transparent;
  border: none;
  color: white;
  height: 100%;
  width: 100%;
  outline: none;
  font-size: 0.95rem;
  padding: 0;
}

.toolbar-actions {
  display: flex;
  align-items: center;
}

.toolbar-actions .premium-button {
  height: 48px;
  margin-top: 0 !important;
  white-space: nowrap;
  padding: 0 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.hidden-input {
  display: none;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  grid-auto-rows: min-content;
  align-items: start;
  gap: 2rem;
  overflow-y: auto;
  padding: 1rem;
  padding-right: 1.5rem;
  flex: 1;
}

/* Custom Scrollbar */
.image-grid::-webkit-scrollbar {
  width: 8px;
}

.image-grid::-webkit-scrollbar-track {
  background: transparent;
}

.image-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}

.image-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}

.image-card {
  background: rgba(30, 41, 59, 0.4);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
  display: flex;
  flex-direction: column;
  position: relative;
  height: auto;
}

.image-card:hover {
  border-color: rgba(99, 102, 241, 0.4);
  background: rgba(30, 41, 59, 0.6);
  box-shadow:
    0 20px 40px -12px rgba(0, 0, 0, 0.5),
    0 0 20px rgba(99, 102, 241, 0.1);
}

.image-preview-box {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  cursor: pointer;
  background-color: #0f172a;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.02) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.02) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.02) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.02) 75%);
  background-size: 10px 10px;
  background-position:
    0 0,
    0 5px,
    5px 5px,
    5px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.image-preview-box img {
  width: 100%;
  height: 100%;
  object-fit: cover; /* Cover for a cleaner grid look */
  transition: all 0.5s cubic-bezier(0.165, 0.84, 0.44, 1);
}

.image-card:hover .image-preview-box img {
  transform: scale(1.05);
  padding: 0;
}

.image-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(99, 102, 241, 0.4), transparent);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.3s ease;
}

.image-preview-box:hover .image-overlay {
  opacity: 1;
}

.select-indicator {
  width: 52px;
  height: 52px;
  background: white;
  color: #6366f1;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: scale(0.5) translateY(20px);
  opacity: 0;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.image-preview-box:hover .select-indicator {
  transform: scale(1) translateY(0);
  opacity: 1;
}

.image-info {
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background: rgba(15, 23, 42, 0.2);
}

.image-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: white;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}

.image-name:hover {
  color: var(--primary);
  text-decoration: underline;
}

.name-edit-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.input-container {
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--primary);
  border-radius: 6px;
  padding: 2px 6px;
}

.inline-rename-input {
  background: transparent;
  border: none;
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
  width: 100%;
  outline: none;
  padding: 0;
}

.extension-label {
  color: #64748b;
  font-size: 0.8rem;
  user-select: none;
}

.error-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #ef4444;
  font-size: 0.7rem;
  font-weight: 600;
  background: rgba(239, 68, 68, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.image-size {
  font-size: 0.75rem;
  color: #64748b;
}

.image-card:hover .image-name {
  color: #fff;
}

.btn-delete-img {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.btn-delete-img:hover {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
  transform: rotate(10deg) scale(1.1);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  color: #64748b;
  text-align: center;
  animation: fadeIn 0.5s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.empty-state svg {
  color: #334155;
  filter: drop-shadow(0 0 20px rgba(99, 102, 241, 0.1));
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.hidden {
  display: none;
}

.premium-empty-action {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem 2.5rem;
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.1),
    rgba(129, 140, 248, 0.05)
  );
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 24px;
  color: white;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  margin-top: 1rem;
  max-width: 400px;
  text-align: left;
}

.premium-empty-action:hover {
  transform: scale(1.05) translateY(-5px);
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.2),
    rgba(129, 140, 248, 0.1)
  );
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 20px 40px -10px rgba(99, 102, 241, 0.2);
}

.action-icon {
  width: 56px;
  height: 56px;
  background: var(--primary);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 20px rgba(99, 102, 241, 0.3);
  transition: all 0.3s ease;
}

.premium-empty-action:hover .action-icon {
  transform: rotate(90deg) scale(1.1);
}

.action-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.main-text {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.sub-text {
  font-size: 0.85rem;
  color: #94a3b8;
  font-weight: 500;
}
</style>
