<script setup lang="ts">
import { computed } from 'vue';
import { CaseSensitive, Code, MousePointer2, Palette, Plus, Trash2 } from 'lucide-vue-next';
import { useEditorState } from '~/composables/useEditorState';
import { useBlockEditor } from '~/composables/useBlockEditor';

const {
  selectedElement, selectedSubElement, layoutTrigger, refreshLayersTrigger,
  buttonRadiusRef, buttonFontSizeRef, buttonPaddingXRef, buttonPaddingYRef,
} = useEditorState();
const {
  selectElement, updateThisButtonColor, updateThisButtonTextColor, updateThisButtonText,
  updateButtonLink, updateThisButtonRadius, updateThisButtonFontSize,
  updateThisButtonPadding, removeThisButton, addButton,
} = useBlockEditor();

const buttons = computed(() => {
  // The canvas contains raw DOM nodes; structural edits explicitly invalidate this list.
  void layoutTrigger.value;
  void refreshLayersTrigger.value;
  void selectedSubElement.value;
  return Array.from(selectedElement.value?.querySelectorAll<HTMLElement>('[data-toggle="button"]') || []);
});
const selectedButton = computed(() => {
  const button = selectedSubElement.value?.closest<HTMLElement>('[data-toggle="button"]');
  return button && buttons.value.includes(button) ? button : null;
});

function selectButton(button: HTMLElement) {
  if (selectedElement.value) selectElement(selectedElement.value, button, true);
}
</script>

<template>
  <div v-if="buttons.length" class="control-group button-controls">
    <label>{{ $t('editor.edit_module_buttons') }}</label>
    <div class="button-choices">
      <button
        v-for="(button, index) in buttons"
        :key="index"
        type="button"
        class="c-btn button-choice"
        :class="{ active: selectedButton === button }"
        :aria-pressed="selectedButton === button"
        @click="selectButton(button)"
      >
        <MousePointer2 :size="14" />
        <span>{{ button.textContent?.trim() || `${$t('editor.edit_btn_prefix')} ${index + 1}` }}</span>
      </button>
    </div>

    <div v-if="selectedButton" class="sub-edit-grid">
      <div class="sub-edit-header">
        <MousePointer2 :size="12" />
        <span>{{ $t('editor.edit_btn_prefix') }} <strong>{{ selectedButton.textContent?.trim() }}</strong></span>
      </div>
      <button type="button" @click="updateThisButtonText" class="c-btn highlight-btn">
        <CaseSensitive :size="14" /> {{ $t('editor.edit_btn_text') }}
      </button>
      <button type="button" @click="updateButtonLink" class="c-btn highlight-btn">
        <Code :size="14" /> {{ $t('editor.edit_link') }}
      </button>
      <button type="button" @click="updateThisButtonColor" class="c-btn highlight-btn">
        <Palette :size="14" /> {{ $t('editor.edit_bg') }}
      </button>
      <button type="button" @click="updateThisButtonTextColor" class="c-btn highlight-btn">
        <Palette :size="14" /> {{ $t('editor.edit_btn_text_color') }}
      </button>

      <div class="slider-row sub-grid-full">
        <div class="slider-header">
          <label for="button-font-size" class="s-label">{{ $t('editor.edit_btn_font_size') }}</label>
          <span class="s-value">{{ buttonFontSizeRef }}px</span>
        </div>
        <input id="button-font-size" type="range" min="8" max="60" v-model="buttonFontSizeRef" @input="updateThisButtonFontSize()" class="premium-slider" />
      </div>
      <div class="slider-row sub-grid-full">
        <div class="slider-header">
          <label for="button-padding-x" class="s-label">{{ $t('editor.edit_btn_padding_x') }}</label>
          <span class="s-value">{{ buttonPaddingXRef }}px</span>
        </div>
        <input id="button-padding-x" type="range" min="0" max="100" v-model="buttonPaddingXRef" @input="updateThisButtonPadding()" class="premium-slider" />
      </div>
      <div class="slider-row sub-grid-full">
        <div class="slider-header">
          <label for="button-padding-y" class="s-label">{{ $t('editor.edit_btn_padding_y') }}</label>
          <span class="s-value">{{ buttonPaddingYRef }}px</span>
        </div>
        <input id="button-padding-y" type="range" min="0" max="60" v-model="buttonPaddingYRef" @input="updateThisButtonPadding()" class="premium-slider" />
      </div>
      <div class="slider-row sub-grid-full">
        <div class="slider-header">
          <label for="button-radius" class="s-label">{{ $t('editor.edit_btn_radius') }}</label>
          <span class="s-value">{{ buttonRadiusRef }}px</span>
        </div>
        <input id="button-radius" type="range" min="0" max="100" v-model="buttonRadiusRef" @input="updateThisButtonRadius()" class="premium-slider" />
      </div>
      <button v-if="selectedElement?.dataset.type === 'Botón'" type="button" @click="removeThisButton" class="c-btn btn-danger-soft sub-grid-full">
        <Trash2 :size="14" /> {{ $t('editor.edit_delete_btn') }}
      </button>
    </div>
    <div v-else class="info-badge-premium">
      <MousePointer2 :size="14" />
      <span>{{ $t('editor.edit_btn_hint') }}</span>
    </div>
    <button v-if="selectedElement?.dataset.type === 'Botón'" type="button" @click="addButton" class="c-btn full-width mt-10">
      <Plus :size="14" /> {{ $t('editor.edit_add_btn') }}
    </button>
  </div>
</template>

<style scoped>
.button-choices { display: flex; flex-direction: column; gap: 6px; }
.button-choice { justify-content: flex-start; min-width: 0; text-align: left; }
.button-choice span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.button-choice svg { flex-shrink: 0; }
.button-choice.active { border-color: #818cf8; background: #6366f11a; color: #c7d2fe; }
.sub-edit-header span { min-width: 0; overflow-wrap: anywhere; }
.slider-header label.s-label { margin: 0; text-transform: none; letter-spacing: normal; }
</style>
