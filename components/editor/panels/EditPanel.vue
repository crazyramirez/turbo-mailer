<script setup lang="ts">
import {
  Square,
  Sparkles,
  Layout,
  Monitor,
  Eye,
  EyeOff,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  CaseSensitive,
  Palette,
  Image as ImageIcon,
  MousePointer2,
  Code,
  Trash2,
  Zap,
  Plus,
} from "lucide-vue-next";
import { useEditorState } from "~/composables/useEditorState";
import { useBlockEditor } from "~/composables/useBlockEditor";

const {
  selectedElement,
  selectedSubElement,
  fontSizeRef,
  logoWidthRef,
  gridImageHeightRef,
} = useEditorState();

const {
  deleteSelectedBlock,
  toggleCardLayout,
  getCardLayout,
  toggleButtonLayout,
  getButtonLayout,
  toggleVisibility,
  isVisible,
  updateTextAlign,
  getTextAlign,
  updateFont,
  updateFontSize,
  updateLogoWidth,
  updateGridImageHeight,
  updateBgColor,
  updateTextColor,
  updateImage,
  updateButtonColor,
  updateThisButtonColor,
  updateButtonLink,
  removeThisButton,
  addButton,
  improveBlockWithAI,
  isImprovingAI,
} = useBlockEditor();

const editableTypes = [
  "Header",
  "Grid",
  "Tarjeta",
  "Imagen",
  "Metodología",
  "Presencia",
  "Firma",
  "Texto",
  "Botón",
];
</script>

<template>
  <div v-if="selectedElement" class="edit-controls">
    <!-- Module Settings -->
    <div
      class="edit-section"
      v-if="
        selectedElement?.dataset.type &&
        editableTypes.includes(selectedElement.dataset.type)
      "
    >
      <!-- Card Layout -->
      <div
        class="control-group"
        v-if="selectedElement.dataset.type === 'Tarjeta'"
      >
        <label>{{ $t('editor.edit_card_style') }}</label>
        <div class="layout-pill-selector">
          <button
            @click="toggleCardLayout"
            :class="{ active: getCardLayout() === 'standard' }"
          >
            <Square :size="14" /> <span>{{ $t('editor.edit_card_classic') }}</span>
          </button>
          <button
            @click="toggleCardLayout"
            :class="{ active: getCardLayout() === 'premium' }"
          >
            <Sparkles :size="14" /> <span>{{ $t('editor.edit_card_premium') }}</span>
          </button>
        </div>
      </div>

      <div class="control-group">
        <label>{{ $t('editor.edit_module_config') }}</label>

        <!-- Button Layout -->
        <div
          v-if="selectedElement.dataset.type === 'Botón'"
          class="layout-pill-selector"
          style="margin-top: 10px"
        >
          <button
            @click="toggleButtonLayout"
            :class="{ active: getButtonLayout() === 'auto' }"
          >
            <Layout :size="14" /> <span>{{ $t('editor.edit_btn_auto') }}</span>
          </button>
          <button
            @click="toggleButtonLayout"
            :class="{ active: getButtonLayout() === 'full' }"
          >
            <Monitor :size="14" /> <span>{{ $t('editor.edit_btn_full') }}</span>
          </button>
        </div>

        <!-- Non-button toggles -->
        <div
          v-if="selectedElement.dataset.type !== 'Botón'"
          class="compact-toggles"
        >
          <!-- Text alignment (Texto block only) -->
          <div
            v-if="selectedElement.dataset.type === 'Texto'"
            class="toggle-item full-width-toggle"
          >
            <span class="label">{{ $t('editor.edit_text_align') }}</span>
            <div class="layout-pill-selector mini">
              <button
                @click="updateTextAlign('left')"
                :class="{ active: getTextAlign() === 'left' }"
                :title="$t('editor.edit_align_left')"
              >
                <AlignLeft :size="14" />
              </button>
              <button
                @click="updateTextAlign('center')"
                :class="{ active: getTextAlign() === 'center' }"
                :title="$t('editor.edit_align_center')"
              >
                <AlignCenter :size="14" />
              </button>
              <button
                @click="updateTextAlign('right')"
                :class="{ active: getTextAlign() === 'right' }"
                :title="$t('editor.edit_align_right')"
              >
                <AlignRight :size="14" />
              </button>
              <button
                @click="updateTextAlign('justify')"
                :class="{ active: getTextAlign() === 'justify' }"
                :title="$t('editor.edit_align_justify')"
              >
                <AlignJustify :size="14" />
              </button>
            </div>
          </div>

          <!-- Visibility toggles (non-text blocks) -->
          <template v-if="selectedElement.dataset.type !== 'Texto'">
            <div
              v-if="selectedElement.dataset.type === 'Header'"
              class="toggle-item"
            >
              <span class="label">{{ $t('editor.edit_logo') }}</span>
              <button
                @click="toggleVisibility('logo')"
                :class="{ active: isVisible('logo') }"
              >
                <Eye v-if="isVisible('logo')" :size="14" />
                <EyeOff v-else :size="14" />
              </button>
            </div>

            <!-- Logo width slider -->
            <div
              v-if="
                selectedElement.dataset.type === 'Header' && isVisible('logo')
              "
              class="toggle-item full-width-toggle no-border"
            >
              <div class="slider-row" style="width: 100%; margin-top: 8px">
                <div class="slider-header">
                  <span class="s-label">{{ $t('editor.edit_logo_size') }}</span>
                  <span class="s-value">{{ logoWidthRef }}px</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="300"
                  v-model="logoWidthRef"
                  @input="updateLogoWidth(logoWidthRef)"
                  class="premium-slider"
                />
              </div>
            </div>

            <div
              v-if="selectedElement.dataset.type === 'Grid'"
              class="toggle-item full-width-toggle no-border"
            >
              <div class="slider-row" style="width: 100%; margin-top: 8px">
                <div class="slider-header">
                  <span class="s-label">{{ $t('editor.edit_grid_height') }}</span>
                  <span class="s-value">{{ gridImageHeightRef }}px</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="400"
                  v-model="gridImageHeightRef"
                  @input="updateGridImageHeight()"
                  class="premium-slider"
                />
              </div>
            </div>

            <div
              v-if="selectedElement.querySelector('[data-toggle=\'image\']')"
              class="toggle-item"
            >
              <span class="label">{{
                selectedElement.dataset.type === "Firma"
                  ? $t('editor.edit_logo')
                  : $t('editor.edit_image_resource')
              }}</span>
              <button
                @click="toggleVisibility('image')"
                :class="{ active: isVisible('image') }"
              >
                <Eye v-if="isVisible('image')" :size="14" />
                <EyeOff v-else :size="14" />
              </button>
            </div>

            <div
              v-if="selectedElement.querySelector('[data-toggle=\'badge\']')"
              class="toggle-item"
            >
              <span class="label">{{
                selectedElement.dataset.type === "Firma"
                  ? $t('editor.edit_ps_note')
                  : $t('editor.edit_badge')
              }}</span>
              <button
                @click="toggleVisibility('badge')"
                :class="{ active: isVisible('badge') }"
              >
                <Eye v-if="isVisible('badge')" :size="14" />
                <EyeOff v-else :size="14" />
              </button>
            </div>

            <div
              v-if="selectedElement.querySelector('[data-toggle=\'ps\']')"
              class="toggle-item"
            >
              <span class="label">{{ $t('editor.edit_ps_note_full') }}</span>
              <button
                @click="toggleVisibility('ps')"
                :class="{ active: isVisible('ps') }"
              >
                <Eye v-if="isVisible('ps')" :size="14" />
                <EyeOff v-else :size="14" />
              </button>
            </div>

            <div
              v-if="selectedElement.querySelector('[data-toggle=\'contact\']')"
              class="toggle-item"
            >
              <span class="label">{{ $t('editor.edit_contact_data') }}</span>
              <button
                @click="toggleVisibility('contact')"
                :class="{ active: isVisible('contact') }"
              >
                <Eye v-if="isVisible('contact')" :size="14" />
                <EyeOff v-else :size="14" />
              </button>
            </div>

            <div
              v-if="selectedElement.querySelector('[data-toggle=\'title\']')"
              class="toggle-item"
            >
              <span class="label">{{
                selectedElement.dataset.type === "Firma"
                  ? $t('editor.edit_name_signature')
                  : $t('editor.edit_titles')
              }}</span>
              <button
                @click="toggleVisibility('title')"
                :class="{ active: isVisible('title') }"
              >
                <Eye v-if="isVisible('title')" :size="14" />
                <EyeOff v-else :size="14" />
              </button>
            </div>

            <div
              v-if="selectedElement.querySelector('[data-toggle=\'subtitle\']')"
              class="toggle-item"
            >
              <span class="label">{{
                selectedElement.dataset.type === "Firma"
                  ? $t('editor.edit_position')
                  : $t('editor.edit_subtitles')
              }}</span>
              <button
                @click="toggleVisibility('subtitle')"
                :class="{ active: isVisible('subtitle') }"
              >
                <Eye v-if="isVisible('subtitle')" :size="14" />
                <EyeOff v-else :size="14" />
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Typography -->
    <div class="control-group">
      <label>{{ $t('editor.edit_typography') }}</label>
      <div class="typography-controls">
        <button @click="updateFont" class="c-btn full-width">
          <CaseSensitive :size="16" /> {{ $t('editor.edit_font_label') }}
          <span class="font-active-name">{{
            selectedElement.style.fontFamily.split(",")[0] || "Arial"
          }}</span>
        </button>
        <div class="slider-row">
          <div class="slider-header">
            <span class="s-label">{{ $t('editor.edit_font_size') }}</span>
            <span class="s-value">{{ fontSizeRef }}px</span>
          </div>
          <input
            type="range"
            min="8"
            max="20"
            v-model="fontSizeRef"
            @input="updateFontSize(fontSizeRef)"
            class="premium-slider"
          />
        </div>
      </div>
    </div>

    <!-- AI Copywriting -->
    <div
      class="control-group"
      v-if="
        selectedElement.dataset.type !== 'Botón' &&
        selectedElement.dataset.type !== 'Imagen'
      "
    >
      <label>{{ $t('editor.edit_ai_copy') }}</label>
      <div class="ai-controls">
        <button
          @click="improveBlockWithAI()"
          class="c-btn ai-magic-btn"
          :disabled="isImprovingAI"
        >
          <Sparkles :size="14" :class="{ 'anim-spin': isImprovingAI }" />
          <span>{{
            isImprovingAI ? $t('editor.edit_ai_improving') : $t('editor.edit_ai_optimize')
          }}</span>
        </button>
      </div>
    </div>

    <!-- Visual Style -->
    <div class="control-group">
      <label>{{ $t('editor.edit_visual_style') }}</label>
      <div class="control-grid">
        <button @click="updateBgColor" class="c-btn">
          <Palette :size="14" /> {{ $t('editor.edit_bg') }}
        </button>
        <button
          v-if="selectedElement.querySelector('img')"
          @click="updateImage"
          class="c-btn"
        >
          <ImageIcon :size="14" /> {{ $t('editor.edit_image') }}
        </button>

        <template v-if="selectedElement.dataset.type === 'Botón'">
          <div
            v-if="selectedSubElement?.closest('[data-toggle=\'button\']')"
            class="sub-edit-grid"
          >
            <div class="sub-edit-header">
              <MousePointer2 :size="12" />
              <span>
                {{ $t('editor.edit_btn_prefix') }} "<strong
                  >{{ (selectedSubElement?.innerText || "").substring(0, 30)
                  }}{{
                    (selectedSubElement?.innerText || "").length > 30
                      ? "..."
                      : ""
                  }}</strong
                >"
              </span>
            </div>
            <button @click="updateThisButtonColor" class="c-btn highlight-btn">
              <Palette :size="14" /> {{ $t('editor.edit_color') }}
            </button>
            <button @click="updateButtonLink" class="c-btn highlight-btn">
              <Code :size="14" /> {{ $t('editor.edit_link') }}
            </button>
            <button @click="removeThisButton" class="c-btn btn-danger-soft">
              <Trash2 :size="14" /> {{ $t('editor.edit_delete_btn') }}
            </button>
          </div>
          <div v-else class="info-badge-premium">
            <Zap :size="14" />
            <span>{{ $t('editor.edit_btn_hint') }}</span>
          </div>
          <button @click="addButton" class="c-btn full-width mt-10">
            <Plus :size="14" /> {{ $t('editor.edit_add_btn') }}
          </button>
        </template>
      </div>
    </div>

    <button @click="deleteSelectedBlock" class="btn-block-remove">
      {{ $t('editor.edit_delete_block') }}
    </button>
  </div>
</template>
