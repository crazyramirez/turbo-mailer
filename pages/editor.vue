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

const { t } = useI18n();
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
  document.body.style.overflow = "hidden";
  setupEditorWatches();
  await loadTemplates();

  const lastTemplate = localStorage.getItem("last_edited_template");
  if (lastTemplate) {
    await loadTemplate(lastTemplate, false);
  } else {
    injectIframeContent();
  }

  (window as any).editorState = editorDragState;
  (window as any).openLinkPrompt = (callback: (val: string) => void) => {
    openPrompt(
      t("editor.prompt_link_title"),
      t("editor.prompt_link_label"),
      "https://",
      "text",
      callback,
    );
  };
  (window as any).openColorPrompt = (callback: (val: string) => void) => {
    openPrompt(
      t("editor.prompt_color_title"),
      t("editor.prompt_color_label"),
      "#000000",
      "color",
      callback,
      "primary",
      undefined,
      "text",
    );
  };
  (window as any).triggerAutosave = () => triggerAutosave(true);

  window.addEventListener("keydown", handleGlobalKeydown);
});

onUnmounted(() => {
  document.body.style.overflow = "";
  window.removeEventListener("keydown", handleGlobalKeydown);
  resetEditorState();
});
</script>

<template>
  <div class="editor-container">
    <div class="mobile-overlay">
      <div class="mobile-overlay-content">
        <NuxtLink to="/" class="mobile-close-btn" :title="$t('common.close')">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </NuxtLink>
        <svg
          class="mobile-icon"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25"
          />
        </svg>
        <h2>{{ $t("nav.editor_desktop_only_title") }}</h2>
        <p>{{ $t("nav.editor_desktop_only_desc") }}</p>
        <div class="mobile-glow"></div>
      </div>
    </div>

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

.mobile-overlay {
  display: none;
}

@media (max-width: 1024px) {
  .mobile-overlay {
    display: flex;
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100%;
    z-index: 999999;
    background: rgba(10, 10, 15, 0.75);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: white;
  }

  .mobile-overlay-content {
    background: linear-gradient(
      145deg,
      rgba(30, 30, 40, 0.8),
      rgba(15, 15, 20, 0.9)
    );
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 28px;
    padding: 3.5rem 2rem;
    text-align: center;
    max-width: 420px;
    width: 100%;
    position: relative;
    overflow: hidden;
    box-shadow:
      0 25px 50px -12px rgba(0, 0, 0, 0.5),
      0 0 60px rgba(99, 102, 241, 0.15);
    animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .mobile-close-btn {
    position: absolute;
    top: 1.25rem;
    right: 1.25rem;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #9ca3af;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    z-index: 10;
  }

  .mobile-close-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    color: white;
    transform: scale(1.05);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .mobile-close-btn svg {
    width: 20px;
    height: 20px;
  }

  .mobile-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 1.5rem auto;
    color: #818cf8;
    filter: drop-shadow(0 0 12px rgba(129, 140, 248, 0.6));
    animation: floatIcon 3s ease-in-out infinite;
  }

  .mobile-overlay-content h2 {
    font-size: 1.75rem;
    font-weight: 700;
    margin-bottom: 1rem;
    font-family:
      "Inter",
      "Outfit",
      system-ui,
      -apple-system,
      sans-serif;
    background: linear-gradient(to right, #ffffff, #a5b4fc);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: -0.025em;
  }

  .mobile-overlay-content p {
    font-size: 1rem;
    line-height: 1.6;
    color: #9ca3af;
    margin: 0;
    font-family:
      "Inter",
      system-ui,
      -apple-system,
      sans-serif;
  }

  .mobile-glow {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 150%;
    height: 150%;
    background: radial-gradient(
      circle at 50% 0%,
      rgba(99, 102, 241, 0.15) 0%,
      transparent 50%
    );
    pointer-events: none;
    z-index: -1;
  }

  @keyframes slideUpFade {
    0% {
      opacity: 0;
      transform: translateY(20px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes floatIcon {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-8px);
    }
  }

  /* Ocultar el resto del editor cuando se muestra el overlay */
  .editor-container > :not(.mobile-overlay) {
    display: none !important;
  }
}
</style>
