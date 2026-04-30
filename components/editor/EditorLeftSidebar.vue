<script setup lang="ts">
import { Plus, Edit3, Trash2, Lock } from "lucide-vue-next";
import { useEditorState } from "~/composables/useEditorState";
import { useTemplateManager } from "~/composables/useTemplateManager";
import { useBlockEditor } from "~/composables/useBlockEditor";
import { editorBlocks } from "~/utils/editorBlocks";

const { templates, currentTemplate, showTemplateModal } = useEditorState();
const { loadTemplate, deleteTemplate, renameTemplate } = useTemplateManager();
const { handleSidebarDragStart, handleSidebarDragEnd } = useBlockEditor();
</script>

<template>
  <aside class="side-nav left" style="user-select: none">
    <!-- Templates -->
    <div class="nav-group">
      <div class="group-header">
        <h3>{{ $t("editor.sidebar_templates") }}</h3>
        <button @click="showTemplateModal = true" class="btn-small-add">
          <Plus :size="14" />
        </button>
      </div>
      <div class="nav-list custom-scrollbar">
        <div v-for="t in templates" :key="t.name" class="nav-item-wrapper">
          <button
            @click="loadTemplate(t.name)"
            :class="{ active: currentTemplate === t.name }"
            class="nav-item"
          >
            <div class="nav-item-content">
              <span>{{ t.name }}</span>
            </div>
            <div class="nav-item-actions">
              <button
                @click.stop="renameTemplate(t.name)"
                class="btn-item-action"
                :title="$t('editor.sidebar_rename')"
              >
                <Edit3 :size="12" />
              </button>
              <button
                @click.stop="deleteTemplate(t.name)"
                class="btn-item-action delete"
                :title="$t('editor.sidebar_delete')"
              >
                <Trash2 :size="12" />
              </button>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Modules -->
    <div class="nav-group modules">
      <div class="group-header">
        <h3>{{ $t("editor.sidebar_modules") }}</h3>
      </div>
      <div class="modules-grid custom-scrollbar">
        <div
          v-for="block in editorBlocks"
          :key="block.id"
          draggable="true"
          @dragstart="handleSidebarDragStart(block.content, $event)"
          @dragend="handleSidebarDragEnd($event)"
          class="module-card"
        >
          <component :is="block.icon" :size="20" class="mod-icon" />
          <span>{{ $t("editor.module_" + block.id) }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>
