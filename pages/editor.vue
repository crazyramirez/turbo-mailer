<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import "@/assets/css/editor.css";

import { useEditorState } from "~/composables/useEditorState";
import { useIframeEngine } from "~/composables/useIframeEngine";
import { useTemplateManager } from "~/composables/useTemplateManager";
import { usePrompt } from "~/composables/usePrompt";

import EditorHeader from "~/components/editor/EditorHeader.vue";
import EditorLeftSidebar from "~/components/editor/EditorLeftSidebar.vue";
import EditorCanvas from "~/components/editor/EditorCanvas.vue";
import EditorRightSidebar from "~/components/editor/EditorRightSidebar.vue";
import ToastNotification from "~/components/editor/ToastNotification.vue";
import PromptModal from "~/components/editor/modals/PromptModal.vue";
import ImageModal from "~/components/editor/modals/ImageModal.vue";
import TemplateModal from "~/components/editor/modals/TemplateModal.vue";

const { editorDragState, resetEditorState } = useEditorState();
const { injectIframeContent, triggerAutosave, setupEditorWatches } =
  useIframeEngine();
const { loadTemplates, loadTemplate, handleSave } = useTemplateManager();
const { openPrompt } = usePrompt();

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    handleSave();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    useIframeEngine().undo();
  }
  if (
    (e.ctrlKey || e.metaKey) &&
    (e.key === "y" || (e.shiftKey && e.key === "Z"))
  ) {
    e.preventDefault();
    useIframeEngine().redo();
  }
  if (e.key === "Delete" || e.key === "Suppress") {
    const isEditing =
      (e.target as HTMLElement)?.isContentEditable ||
      ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName);
    if (!isEditing) {
      const { selectedElement } = useEditorState();
      if (selectedElement.value) {
        e.preventDefault();
        import("~/composables/useBlockEditor").then(({ useBlockEditor }) => {
          useBlockEditor().deleteSelectedBlock();
        });
      }
    }
  }
}

onMounted(async () => {
  setupEditorWatches();
  await loadTemplates();

  const lastTemplate = localStorage.getItem("last_edited_template");
  if (lastTemplate && lastTemplate !== "email_demo") {
    await loadTemplate(lastTemplate, false);
  } else {
    injectIframeContent();
  }

  (window as any).editorState = editorDragState;
  (window as any).openLinkPrompt = (callback: (val: string) => void) => {
    openPrompt(
      "Insertar Enlace",
      "URL del hipervínculo:",
      "https://",
      "text",
      callback,
    );
  };
  (window as any).openColorPrompt = (callback: (val: string) => void) => {
    openPrompt(
      "Color de Selección",
      "Elige un color para el texto resaltado:",
      "#000000",
      "color",
      callback,
    );
  };
  (window as any).triggerAutosave = () => triggerAutosave(true);

  window.addEventListener("keydown", handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
  resetEditorState();
});
</script>

<template>
  <div class="editor-container">
    <ToastNotification />
    <PromptModal />
    <ImageModal />
    <TemplateModal />

    <EditorHeader />

    <div class="editor-layout">
      <EditorLeftSidebar />
      <EditorCanvas />
      <EditorRightSidebar />
    </div>
  </div>
</template>

<style scoped>
/* Styles live in assets/css/editor.css */
</style>
