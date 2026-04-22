<script setup lang="ts">
import {
  X,
  Hash,
  Pipette,
  AlertCircle,
  Image as ImageIcon,
} from "lucide-vue-next";
import { useEditorState } from "~/composables/useEditorState";
import { usePrompt } from "~/composables/usePrompt";
import { colorPalettes } from "~/utils/editorColors";

const { promptData } = useEditorState();
const { submitPrompt, handlePromptInput } = usePrompt();

function handleHexInput() {
  if (promptData.value !== 'transparent' && !promptData.value.startsWith('#')) {
    promptData.value = '#' + promptData.value;
  }
  handlePromptInput(promptData.value);
}
</script>

<template>
  <Transition name="fade">
    <div
      v-if="promptData.visible"
      class="modal-overlay"
      :class="{ 'lighter-backdrop': promptData.mode === 'color' }"
    >
      <div class="modal-backdrop" @click="promptData.visible = false"></div>
      <div
        class="modal-window"
        :class="{
          'wide-modal': promptData.mode === 'font',
          'side-modal': promptData.mode === 'color',
        }"
      >
        <div class="modal-header">
          <div class="header-info">
            <h2>{{ promptData.title }}</h2>
            <p>{{ promptData.label }}</p>
          </div>
          <button @click="promptData.visible = false" class="btn-close-minimal">
            <X :size="20" />
          </button>
        </div>

        <div class="modal-body">
          <!-- Color Picker -->
          <div v-if="promptData.mode === 'color'" class="premium-color-picker">
            <div class="picker-main">
              <div
                class="main-preview"
                :style="{ background: promptData.value }"
              >
                <div
                  v-if="promptData.value === 'transparent'"
                  class="transparent-indicator"
                >
                  ✕
                </div>
                <div class="checker-bg"></div>
              </div>
              <div class="picker-controls">
                <div class="hex-box">
                  <Hash :size="14" class="hex-icon" />
                  <input
                    v-model="promptData.value"
                    type="text"
                    maxlength="7"
                    spellcheck="false"
                    @input="handleHexInput"
                  />
                </div>
                <label for="nat-pick" class="btn-open-system">
                  <Pipette :size="14" /> Avanzado
                </label>
                <input
                  v-model="promptData.value"
                  type="color"
                  class="hidden-picker"
                  id="nat-pick"
                  @input="handlePromptInput(promptData.value)"
                />
              </div>
            </div>
            <div class="palette-sections custom-scrollbar">
              <div class="palette-group">
                <span class="p-title">Sistemas y Marca</span>
                <div class="p-grid">
                  <button
                    class="swatch-transparent"
                    @click="
                      promptData.value = 'transparent';
                      handlePromptInput('transparent');
                    "
                    title="Reseteo"
                  ></button>
                  <button
                    v-for="c in colorPalettes.brand"
                    :key="c"
                    :style="{ background: c }"
                    @click="
                      promptData.value = c;
                      handlePromptInput(c);
                    "
                    :class="{ selected: promptData.value === c }"
                  ></button>
                </div>
              </div>
              <div class="palette-group">
                <span class="p-title">Neutros Professional</span>
                <div class="p-grid">
                  <button
                    v-for="c in colorPalettes.neutrals"
                    :key="c"
                    :style="{ background: c }"
                    @click="
                      promptData.value = c;
                      handlePromptInput(c);
                    "
                    :class="{ selected: promptData.value === c }"
                  ></button>
                </div>
              </div>
              <div class="palette-group">
                <span class="p-title">Fondos Soft (Pastel)</span>
                <div class="p-grid">
                  <button
                    v-for="c in colorPalettes.softPastels"
                    :key="c"
                    :style="{ background: c }"
                    @click="
                      promptData.value = c;
                      handlePromptInput(c);
                    "
                    :class="{ selected: promptData.value === c }"
                  ></button>
                </div>
              </div>
            </div>
          </div>

          <!-- Text Input -->
          <div v-if="promptData.mode === 'text'" class="input-modern-group">
            <input
              v-model="promptData.value"
              type="text"
              placeholder="https://..."
              @keyup.enter="submitPrompt"
              autofocus
            />
            <ImageIcon :size="18" class="input-icon" />
          </div>

          <!-- Confirm -->
          <div v-if="promptData.mode === 'confirm'" class="confirm-message">
            <AlertCircle :size="32" class="warn-icon" />
            <p>Esta acción eliminará permanentemente la plantilla.</p>
          </div>

          <div class="modal-footer-actions">
            <button
              @click="submitPrompt"
              :class="[
                promptData.variant === 'danger'
                  ? 'btn-modal-danger'
                  : 'premium-button',
              ]"
            >
              {{ promptData.confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
