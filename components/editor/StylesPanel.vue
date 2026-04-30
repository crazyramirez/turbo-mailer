<script setup lang="ts">
import { useEditorState } from "~/composables/useEditorState";
import { editorStyleBases, type EditorStyleBase } from "~/utils/editorStyles";
import { Check, Info, Palette } from "lucide-vue-next";
import { usePrompt } from "~/composables/usePrompt";

const { currentStyle } = useEditorState();

const selectStyle = (style: EditorStyleBase) => {
  currentStyle.value = style;
  import("~/composables/useIframeEngine").then(({ useIframeEngine }) => {
    useIframeEngine().applyStyleBase(style, true);
    useIframeEngine().triggerAutosave(true);
  });
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
        newStyle.config.cardBg = color;
        newStyle.config.contentBg = color;
        currentStyle.value = newStyle;
        
        import("~/composables/useIframeEngine").then(({ useIframeEngine }) => {
          useIframeEngine().applyStyleBase(newStyle, true);
          useIframeEngine().triggerAutosave(true);
        });
      }
    }
  );
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
              borderRadius: style.config.id === 'corporate' ? '0px' : '8px',
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
</style>
