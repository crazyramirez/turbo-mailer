<script setup lang="ts">
import { useEditorState } from "~/composables/useEditorState";
import { editorStyleBases, type EditorStyleBase } from "~/utils/editorStyles";
import { Check, Info, Palette } from "lucide-vue-next";
import { usePrompt } from "~/composables/usePrompt";
import { safeFonts } from "~/utils/editorFonts";

const { currentStyle, iframeRef } = useEditorState();
const { applyStyleBase, triggerAutosave } = useIframeEngine();

const selectStyle = (style: EditorStyleBase) => {
  currentStyle.value = style;
  applyStyleBase(style, true);
  triggerAutosave(true);
};

const { openPrompt } = usePrompt();

const openGlobalColorPicker = () => {
  const i18n = (useNuxtApp().$i18n as any);
  openPrompt(
    i18n.t('editor.style_global_color_title'),
    i18n.t('editor.style_global_color_label'),
    currentStyle.value.config.bodyBg,
    'color',
    (color) => {
      if (color) {
        // Clone and update config
        const newStyle = JSON.parse(JSON.stringify(currentStyle.value));
        newStyle.config.bodyBg = color;
        currentStyle.value = newStyle;
        
        const doc = iframeRef.value?.contentDocument;
        if (doc) {
          doc.body.style.backgroundColor = color;
          doc.body.setAttribute('data-style-body-bg', color);
        }
        triggerAutosave(true);
      }
    },
    'primary',
    undefined,
    'body'
  );
};

const updateCardRadius = (radiusVal: string) => {
  const radius = `${radiusVal}px`;
  const newStyle = JSON.parse(JSON.stringify(currentStyle.value));
  newStyle.config.cardRadius = radius;
  currentStyle.value = newStyle;

  const doc = iframeRef.value?.contentDocument;
  if (doc) {
    const mainCard = doc.querySelector('.main-card') as HTMLElement;
    if (mainCard) {
      mainCard.style.borderRadius = radius;
    }
    doc.body.setAttribute('data-style-card-radius', radius);
  }
  triggerAutosave(true);
};

const isFontActive = (fontFamily: string) => {
  if (!currentStyle.value?.config?.fontFamily) return false;
  const currentFirst = currentStyle.value.config.fontFamily.split(',')[0].trim().replace(/['"]/g, '').toLowerCase();
  const targetFirst = fontFamily.split(',')[0].trim().replace(/['"]/g, '').toLowerCase();
  return currentFirst === targetFirst;
};

const updateGlobalFont = (family: string) => {
  const newStyle = JSON.parse(JSON.stringify(currentStyle.value));
  newStyle.config.fontFamily = family;
  currentStyle.value = newStyle;

  const doc = iframeRef.value?.contentDocument;
  if (doc) {
    doc.body.style.fontFamily = family;
    doc.body.setAttribute('data-style-font-family', family);
    doc.querySelectorAll(".editable-block").forEach((block: any) => {
      delete block.dataset.customFont;
      block.removeAttribute('data-custom-font');
      block.style.fontFamily = family;
      block.querySelectorAll("*").forEach((el: any) => {
        delete el.dataset.customFont;
        el.removeAttribute('data-custom-font');
        if (!el.dataset.toggle?.includes('badge')) {
          el.style.fontFamily = family;
        }
      });
    });
  }
  triggerAutosave(true);
};

const updateCardShadow = (shadow: string) => {
  const newStyle = JSON.parse(JSON.stringify(currentStyle.value));
  newStyle.config.cardShadow = shadow;
  currentStyle.value = newStyle;

  const doc = iframeRef.value?.contentDocument;
  if (doc) {
    const mainCard = doc.querySelector('.main-card') as HTMLElement;
    if (mainCard) {
      mainCard.style.boxShadow = shadow;
    }
    doc.body.setAttribute('data-style-card-shadow', shadow);
  }
  triggerAutosave(true);
};
</script>

<template>
  <div class="styles-panel" style="user-select: none">
    <div class="panel-header">
      <h3>{{ $t("editor.style_title") }}</h3>
      <p>{{ $t("editor.style_subtitle") }}</p>
    </div>

    <div class="styles-grid">
      <div
        v-for="style in editorStyleBases"
        :key="style.id"
        class="style-card"
        :class="{ active: currentStyle.id === style.id }"
        @click="selectStyle(style)"
      >
        <div
          class="style-preview"
          :style="{ backgroundColor: style.config.bodyBg }"
        >
          <div
            class="preview-card"
            :style="{
              backgroundColor: style.config.cardBg,
              borderRadius: style.id === 'corporate' ? '0px' : '8px',
              boxShadow: style.config.cardShadow,
              border: style.config.cardBorder,
            }"
          >
            <div
              class="preview-header"
              :style="{ backgroundColor: style.config.headerBg }"
            ></div>
            <div
              class="preview-content"
              :style="{ backgroundColor: style.config.contentBg }"
            >
              <div
                class="preview-line"
                :style="{ backgroundColor: style.config.titleColor }"
              ></div>
              <div
                class="preview-line short"
                :style="{ backgroundColor: style.config.subtitleColor }"
              ></div>
              <div
                class="preview-button"
                :style="{
                  backgroundColor: style.config.accentColor,
                  borderRadius:
                    style.config.buttonRadius === '0px' ? '0px' : '2px',
                }"
              ></div>
            </div>
          </div>
          <div v-if="currentStyle.id === style.id" class="active-badge">
            <Check :size="12" />
          </div>
        </div>
        <div class="style-info">
          <span class="style-name">{{ $t(style.name) }}</span>
          <span class="style-desc">{{ $t(style.description) }}</span>
        </div>
      </div>
    </div>

    <div class="style-notice">
      <Info :size="14" />
      <span>{{ $t("editor.style_notice") }}</span>
    </div>

    <div class="global-controls">
      <button @click="openGlobalColorPicker" class="global-color-btn">
        <Palette :size="14" />
        <span>{{ $t("editor.style_global_color_title") }}</span>
        <div class="color-indicator" :style="{ backgroundColor: currentStyle.config.bodyBg }"></div>
      </button>
    </div>

    <div class="advanced-controls" v-if="currentStyle">
      <div class="control-group">
        <label class="control-label">
          <span>{{ $t("editor.card_border_radius") || 'Bordes de la tarjeta' }}</span>
          <span class="control-val">{{ currentStyle.config.cardRadius || '0px' }}</span>
        </label>
        <input 
          type="range" 
          min="0" 
          max="40" 
          step="2" 
          :value="parseInt(currentStyle.config.cardRadius) || 0"
          @input="updateCardRadius(($event.target as HTMLInputElement).value)"
          class="control-slider" 
        />
      </div>

      <div class="control-group">
        <label class="control-label">
          <span>{{ $t("editor.card_shadow") || 'Sombra de la tarjeta' }}</span>
        </label>
        <select 
          :value="currentStyle.config.cardShadow" 
          @change="updateCardShadow(($event.target as HTMLSelectElement).value)"
          class="control-select"
        >
          <option value="none">Ninguna</option>
          <option value="0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)">Suave</option>
          <option value="0 10px 40px rgba(15, 23, 42, 0.08)">Media</option>
          <option value="0 20px 50px rgba(0, 0, 0, 0.5)">Intensa</option>
          <option value="0 28px 90px rgba(0, 0, 0, 0.48)">Muy intensa</option>
          <option v-if="currentStyle.config.cardShadow && !['none', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', '0 10px 40px rgba(15, 23, 42, 0.08)', '0 20px 50px rgba(0, 0, 0, 0.5)', '0 28px 90px rgba(0, 0, 0, 0.48)'].includes(currentStyle.config.cardShadow)" :value="currentStyle.config.cardShadow">Personalizada</option>
        </select>
      </div>

      <div class="control-group">
        <label class="control-label">
          <span>{{ $t("editor.style_global_font") || 'Tipografía Global' }}</span>
        </label>
        <select 
          @change="updateGlobalFont(($event.target as HTMLSelectElement).value)"
          class="control-select"
        >
          <optgroup v-for="group in safeFonts" :key="group.group" :label="group.group">
            <option 
              v-for="font in group.fonts" 
              :key="font.name" 
              :value="font.family"
              :selected="isFontActive(font.family)"
            >
              {{ font.name }}
            </option>
          </optgroup>
        </select>
        <p class="control-help">
          {{ $t("editor.style_global_font_override_hint") || 'Al cambiar la tipografía global se sobrescribirá cualquier tipografía asignada previamente.' }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.styles-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
  margin-bottom: 4px;
}

.panel-header p {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
}

.styles-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.style-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  gap: 12px;
  align-items: center;
}

.style-card:hover {
  border-color: #475569;
  background: #232e42;
  transform: translateY(-2px);
}

.style-card.active {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.1);
}

.style-preview {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  flex-shrink: 0;
}

.preview-card {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-header {
  height: 30%;
  width: 100%;
}

.preview-content {
  flex: 1;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preview-line {
  height: 2px;
  background: #e2e8f0;
  width: 100%;
  border-radius: 1px;
}

.preview-line.short {
  width: 60%;
}

.preview-button {
  height: 4px;
  width: 40%;
  margin-top: 2px;
  border-radius: 1px;
}

.active-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: #6366f1;
  color: white;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #1e293b;
}

.style-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.style-name {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
}

.style-desc {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.3;
}

.style-notice {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 10px;
  color: #94a3b8;
  font-size: 11px;
  line-height: 1.4;
  align-items: flex-start;
}

.style-notice span {
  flex: 1;
}

.global-controls {
  margin-top: 10px;
  padding-top: 20px;
  border-top: 1px solid #334155;
}

.global-color-btn {
  width: 100%;
  background: #1e293b;
  border: 1px solid #334155;
  color: #f1f5f9;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.global-color-btn:hover {
  background: #2d3a4f;
  border-color: #475569;
}

.color-indicator {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  margin-left: auto;
}

.advanced-controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 10px;
  padding-top: 16px;
  border-top: 1px solid #334155;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
}

.control-val {
  font-family: monospace;
  font-size: 11px;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.control-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 6px;
  background: #334155;
  border-radius: 3px;
  outline: none;
}

.control-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: #6366f1;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s;
}

.control-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.control-select {
  width: 100%;
  background: #1e293b;
  border: 1px solid #334155;
  color: #f1f5f9;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.2s;
}

.control-select:focus {
  border-color: #6366f1;
}

.control-help {
  font-size: 11px;
  color: #64748b;
  line-height: 1.35;
  margin-top: 4px;
}
</style>
