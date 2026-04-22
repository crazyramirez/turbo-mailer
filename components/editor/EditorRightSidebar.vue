<script setup lang="ts">
import { useEditorState } from '~/composables/useEditorState'
import { useBlockEditor } from '~/composables/useBlockEditor'
import LayersPanel from '~/components/editor/panels/LayersPanel.vue'
import EditPanel from '~/components/editor/panels/EditPanel.vue'
import FontsPanel from '~/components/editor/panels/FontsPanel.vue'

const { activePanel, selectedElement, isTemplateLoading } = useEditorState()
const { switchToEditPanel } = useBlockEditor()
</script>

<template>
  <aside class="side-nav right">
    <div class="tab-switcher">
      <button @click="activePanel = 'layers'" :class="{ active: activePanel === 'layers' }">
        Capas
      </button>
      <button
        @click="switchToEditPanel"
        :class="{ active: activePanel === 'edit' || activePanel === 'fonts' }"
      >
        Edición
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
      </Transition>
    </div>
  </aside>
</template>
