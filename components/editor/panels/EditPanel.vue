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

const { selectedElement, selectedSubElement, fontSizeRef, logoWidthRef } =
  useEditorState();

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
        <label>Estilo de Tarjeta</label>
        <div class="layout-pill-selector">
          <button
            @click="toggleCardLayout"
            :class="{ active: getCardLayout() === 'standard' }"
          >
            <Square :size="14" /> <span>Clásica</span>
          </button>
          <button
            @click="toggleCardLayout"
            :class="{ active: getCardLayout() === 'premium' }"
          >
            <Sparkles :size="14" /> <span>Premium</span>
          </button>
        </div>
      </div>

      <div class="control-group">
        <label>Configuración de Módulo</label>

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
            <Layout :size="14" /> <span>Ajuste Auto</span>
          </button>
          <button
            @click="toggleButtonLayout"
            :class="{ active: getButtonLayout() === 'full' }"
          >
            <Monitor :size="14" /> <span>Expandido (100%)</span>
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
            <span class="label">Alineación de Texto</span>
            <div class="layout-pill-selector mini">
              <button
                @click="updateTextAlign('left')"
                :class="{ active: getTextAlign() === 'left' }"
                title="Izquierda"
              >
                <AlignLeft :size="14" />
              </button>
              <button
                @click="updateTextAlign('center')"
                :class="{ active: getTextAlign() === 'center' }"
                title="Centro"
              >
                <AlignCenter :size="14" />
              </button>
              <button
                @click="updateTextAlign('right')"
                :class="{ active: getTextAlign() === 'right' }"
                title="Derecha"
              >
                <AlignRight :size="14" />
              </button>
              <button
                @click="updateTextAlign('justify')"
                :class="{ active: getTextAlign() === 'justify' }"
                title="Justificado"
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
              <span class="label">Logotipo</span>
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
                  <span class="s-label">Tamaño del Logo</span>
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
              v-if="selectedElement.querySelector('[data-toggle=\'image\']')"
              class="toggle-item"
            >
              <span class="label">{{
                selectedElement.dataset.type === "Firma"
                  ? "Logo"
                  : "Imagen / Recurso"
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
                  ? "Nota Posdata"
                  : "Etiqueta / Badge"
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
              <span class="label">Nota Posdata (P.D.)</span>
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
              <span class="label">Datos de Contacto</span>
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
                  ? "Nombre / Firma"
                  : "Títulos Principales"
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
                  ? "Cargo / Empresa"
                  : "Subtítulos / Descr."
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
      <label>Texto y Tipografía</label>
      <div class="typography-controls">
        <button @click="updateFont" class="c-btn full-width">
          <CaseSensitive :size="16" /> Tipografía:
          <span class="font-active-name">{{
            selectedElement.style.fontFamily.split(",")[0] || "Arial"
          }}</span>
        </button>
        <div class="slider-row">
          <div class="slider-header">
            <span class="s-label">Tamaño Base (Jerárquico)</span>
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
      <label>IA Copywriting</label>
      <div class="ai-controls">
        <button
          @click="improveBlockWithAI()"
          class="c-btn ai-magic-btn"
          :disabled="isImprovingAI"
        >
          <Sparkles :size="14" :class="{ 'anim-spin': isImprovingAI }" />
          <span>{{
            isImprovingAI ? "Mejorando..." : "Optimizar Texto con IA"
          }}</span>
        </button>
      </div>
    </div>

    <!-- Visual Style -->
    <div class="control-group">
      <label>Estilo Visual</label>
      <div class="control-grid">
        <button @click="updateBgColor" class="c-btn">
          <Palette :size="14" /> Fondo
        </button>
        <button
          v-if="selectedElement.querySelector('img')"
          @click="updateImage"
          class="c-btn"
        >
          <ImageIcon :size="14" /> Imagen
        </button>

        <template v-if="selectedElement.dataset.type === 'Botón'">
          <div
            v-if="selectedSubElement?.closest('[data-toggle=\'button\']')"
            class="sub-edit-grid"
          >
            <div class="sub-edit-header">
              <MousePointer2 :size="12" />
              <span>
                Botón: "<strong
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
              <Palette :size="14" /> Color
            </button>
            <button @click="updateButtonLink" class="c-btn highlight-btn">
              <Code :size="14" /> Enlace
            </button>
            <button @click="removeThisButton" class="c-btn btn-danger-soft">
              <Trash2 :size="14" /> Borrar
            </button>
          </div>
          <div v-else class="info-badge-premium">
            <Zap :size="14" />
            <span
              >Toca un botón en el diseño para editar su color y enlace</span
            >
          </div>
          <button @click="addButton" class="c-btn full-width mt-10">
            <Plus :size="14" /> Nuevo Botón
          </button>
        </template>
      </div>
    </div>

    <button @click="deleteSelectedBlock" class="btn-block-remove">
      Eliminar Bloque
    </button>
  </div>
</template>
