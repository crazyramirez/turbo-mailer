<script setup lang="ts">
import { useEditorState } from "~/composables/useEditorState";
import { useBlockEditor } from "~/composables/useBlockEditor";
import LayersPanel from "~/components/editor/panels/LayersPanel.vue";
import EditPanel from "~/components/editor/panels/EditPanel.vue";
import FontsPanel from "~/components/editor/panels/FontsPanel.vue";
import StylesPanel from "~/components/editor/StylesPanel.vue";
import QualityPanel from "~/components/editor/panels/QualityPanel.vue";
import { ShieldCheck } from "lucide-vue-next";

const { activePanel, selectedElement, isTemplateLoading } = useEditorState();
const { switchToEditPanel } = useBlockEditor();
</script>

<template>
  <aside class="side-nav right" style="user-select: none">
    <div class="tab-switcher">
      <button
        @click="activePanel = 'layers'"
        :class="{ active: activePanel === 'layers' }"
        :aria-pressed="activePanel === 'layers'"
      >
        {{ $t("editor.panel_layers") }}
      </button>
      <button
        @click="switchToEditPanel"
        :class="{ active: activePanel === 'edit' || activePanel === 'fonts' }"
        :aria-pressed="activePanel === 'edit' || activePanel === 'fonts'"
      >
        {{ $t("editor.panel_edit") }}
      </button>
      <button
        @click="activePanel = 'styles'"
        :class="{ active: activePanel === 'styles' }"
        :aria-pressed="activePanel === 'styles'"
      >
        {{ $t("editor.panel_style") || "Estilo" }}
      </button>
      <button @click="activePanel = 'quality'" :class="{ active: activePanel === 'quality' }" :aria-pressed="activePanel === 'quality'" class="quality-tab">
        <ShieldCheck :size="14" />{{ $t('editor.studio_quality') }}
      </button>
    </div>

    <div class="side-panel custom-scrollbar">
      <Transition :name="isTemplateLoading ? '' : 'panel-fade'" mode="out-in">
        <LayersPanel v-if="activePanel === 'layers'" key="layers" />

        <EditPanel
          v-else-if="activePanel === 'edit' && selectedElement"
          key="edit"
        />

        <FontsPanel v-else-if="activePanel === 'fonts'" key="fonts" />

        <StylesPanel v-else-if="activePanel === 'styles'" key="styles" />
        <QualityPanel v-else-if="activePanel === 'quality'" key="quality" />
      </Transition>
    </div>
  </aside>
</template>
