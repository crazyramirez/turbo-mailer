<script setup lang="ts">
import { ref } from "vue";
import {
  X,
  Image as ImageIcon,
  MousePointer2,
  FolderOpen,
} from "lucide-vue-next";
import { useEditorState } from "~/composables/useEditorState";
import { useBlockEditor } from "~/composables/useBlockEditor";
import ResourceManagerModal from "./ResourceManagerModal.vue";

const { imageModal } = useEditorState();
const { applyImageSettings } = useBlockEditor();

const showResourceManager = ref(false);

function selectFromManager(url: string) {
  imageModal.src = url;
}
</script>

<template>
  <Transition name="fade">
    <div v-if="imageModal.visible" class="modal-overlay">
      <div class="modal-backdrop" @click="imageModal.visible = false"></div>

      <ResourceManagerModal
        :visible="showResourceManager"
        @close="showResourceManager = false"
        @select="selectFromManager"
      />

      <div class="modal-window wide-modal" role="dialog" aria-modal="true" aria-labelledby="image-settings-title">
        <div class="modal-header">
          <div class="header-info">
            <h2 id="image-settings-title">{{ $t("editor.image_modal_title") }}</h2>
            <p>{{ $t("editor.image_modal_subtitle") }}</p>
          </div>
          <button @click="imageModal.visible = false" class="btn-close-minimal" :aria-label="$t('common.close')">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <div class="image-settings-layout">
            <div class="preview-capsule">
              <div
                class="premium-img-preview"
                :style="{ backgroundImage: `url(${imageModal.src})` }"
              >
                <div v-if="!imageModal.src" class="no-img-msg">
                  {{ $t("editor.image_modal_no_image") }}
                </div>
              </div>
              <div class="preview-tag">
                {{ $t("editor.image_modal_preview") }}
              </div>
            </div>
            <div class="settings-form-side">
              <div class="premium-field-group">
                <label for="image-settings-url">{{ $t("editor.image_modal_url") }}</label>
                <div class="premium-input-box">
                  <ImageIcon :size="18" class="field-icon" />
                  <input
                    v-model="imageModal.src"
                    id="image-settings-url"
                    type="text"
                    placeholder="https://..."
                  />
                  <button
                    @click="showResourceManager = true"
                    class="btn-input-action"
                    :title="$t('editor.resource_manager_btn')"
                    :aria-label="$t('editor.resource_manager_btn')"
                  >
                    <FolderOpen :size="18" />
                  </button>
                </div>
              </div>
              <div class="premium-field-group">
                <label for="image-settings-alt">{{ $t('editor.studio_alt') }}</label>
                <div class="premium-input-box">
                  <input id="image-settings-alt" v-model="imageModal.alt" :disabled="imageModal.decorative" :placeholder="$t('editor.studio_alt_placeholder')" aria-describedby="image-alt-help" type="text" maxlength="500" />
                </div>
                <p id="image-alt-help" class="image-alt-help">{{ $t('editor.studio_alt_help') }}</p>
                <label class="image-decorative-option"><input v-model="imageModal.decorative" type="checkbox" />{{ $t('editor.studio_decorative') }}</label>
              </div>
              <div class="premium-field-group">
                <label for="image-settings-link">{{ $t("editor.image_modal_link") }}</label>
                <div class="premium-input-box">
                  <MousePointer2 :size="18" class="field-icon" />
                  <input
                    v-model="imageModal.link"
                    id="image-settings-link"
                    type="text"
                    placeholder="https://..."
                  />
                </div>
              </div>
              <div class="premium-toggle-card">
                <div class="toggle-info">
                  <span class="t-label">{{
                    $t("editor.image_modal_new_tab")
                  }}</span>
                  <span class="t-sub">{{
                    $t("editor.image_modal_new_tab_sub")
                  }}</span>
                </div>
                <button
                  @click="
                    imageModal.target =
                      imageModal.target === '_blank' ? '_self' : '_blank'
                  "
                  :class="{ active: imageModal.target === '_blank' }"
                  :aria-pressed="imageModal.target === '_blank'"
                  :aria-label="$t('editor.image_modal_new_tab')"
                  class="premium-switch"
                >
                  {{
                    imageModal.target === "_blank"
                      ? $t("editor.image_modal_on")
                      : $t("editor.image_modal_off")
                  }}
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer-actions">
            <button
              @click="imageModal.visible = false"
              class="btn-modal-secondary"
            >
              {{ $t("editor.image_modal_cancel") }}
            </button>
            <button
              @click="applyImageSettings"
              class="premium-button"
              style="margin-top: 0"
            >
              {{ $t("editor.image_modal_update") }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.image-alt-help { color: #94a3b8; font-size: 12px; line-height: 1.5; margin-top: 8px; }
.image-decorative-option { display: flex; align-items: flex-start; gap: 8px; color: #cbd5e1; font-size: 12px; line-height: 1.5; margin-top: 10px; cursor: pointer; }
.image-decorative-option input { margin-top: 3px; accent-color: #6366f1; }
.premium-input-box input:disabled { opacity: .45; }
.premium-img-preview {
  background-color: #0f172a;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.02) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.02) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.02) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.02) 75%);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.btn-input-action {
  align-self: stretch;
  background: rgba(255, 255, 255, 0.03);
  border: none;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  color: #6366f1; /* Primary color for the icon */
  padding: 0 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  border-radius: 0 16px 16px 0; /* Match input box corners */
}

.btn-input-action:hover {
  background: rgba(99, 102, 241, 0.1);
  color: #818cf8;
}

.btn-input-action::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at center,
    rgba(99, 102, 241, 0.2) 0%,
    transparent 70%
  );
  opacity: 0;
  transition: opacity 0.3s ease;
}

.btn-input-action:hover::after {
  opacity: 1;
}

.btn-input-action svg {
  position: relative;
  z-index: 1;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.btn-input-action:hover svg {
  transform: scale(1.1) rotate(-5deg);
}
</style>
