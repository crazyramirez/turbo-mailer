<script setup lang="ts">
import { computed, ref } from "vue";
import { Plus, Edit3, Copy, Trash2, History, Search, X } from "lucide-vue-next";
import { useEditorState } from "~/composables/useEditorState";
import { useTemplateManager } from "~/composables/useTemplateManager";
import { useBlockEditor } from "~/composables/useBlockEditor";
import { editorBlocks } from "~/utils/editorBlocks";
import VersionsModal from "~/components/editor/modals/VersionsModal.vue";

const { t } = useI18n();
const { templates, currentTemplate, showTemplateModal, isTemplateLoading, isMorphing } = useEditorState();
const { loadTemplate, deleteTemplate, duplicateTemplate, renameTemplate } = useTemplateManager();
const { handleSidebarDragStart, handleSidebarDragEnd, insertBlock } = useBlockEditor();
const versionsFor = ref<string | null>(null);
const search = ref("");
const category = ref("all");
const groups: Record<string, string[]> = {
  content: ["header-pro", "hero", "text", "image", "card", "note", "video"],
  layouts: ["grid-2", "grid-3", "grid-4", "divider", "spacer"],
  conversion: ["button", "product", "pricing", "coupon", "testimonials", "faq", "metrics"],
  identity: ["presence", "socials", "signature", "unsubscribe"],
};
const categories = ["all", ...Object.keys(groups)];
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const filteredBlocks = computed(() => {
  const query = normalizeSearch(search.value.trim());
  return editorBlocks.filter(block =>
    (category.value === "all" || groups[category.value]?.includes(block.id)) &&
    (!query || normalizeSearch(`${t("editor.module_" + block.id)} ${block.name} ${block.id}`).includes(query)),
  );
});
function clearFilters() {
  search.value = "";
  category.value = "all";
}
</script>

<template>
  <aside class="side-nav left" :aria-label="t('editor.studio_library')" style="user-select: none">
    <div class="nav-group templates-group">
      <div class="group-header">
        <h3>{{ t("editor.sidebar_templates") }}</h3>
        <button @click="showTemplateModal = true" class="btn-small-add" :aria-label="t('editor.studio_new_template')" :title="t('editor.studio_new_template')">
          <Plus :size="14" />
        </button>
      </div>
      <div class="nav-list custom-scrollbar">
        <div v-for="template in templates" :key="template.name" class="nav-item-wrapper" :class="{ active: currentTemplate === template.name }">
          <button @click="loadTemplate(template.name)" :aria-current="currentTemplate === template.name ? 'true' : undefined" class="nav-item" :title="template.name">
            <span class="nav-item-content"><span>{{ template.name }}</span></span>
          </button>
          <div class="nav-item-actions">
            <button @click="versionsFor = template.name" class="btn-item-action" :title="t('editor.studio_versions')" :aria-label="`${t('editor.studio_versions')}: ${template.name}`"><History :size="12" /></button>
            <button @click="renameTemplate(template.name)" class="btn-item-action" :title="t('editor.sidebar_rename')" :aria-label="`${t('editor.sidebar_rename')}: ${template.name}`"><Edit3 :size="12" /></button>
            <button @click="duplicateTemplate(template.name)" class="btn-item-action" :title="t('editor.sidebar_duplicate')" :aria-label="`${t('editor.sidebar_duplicate')}: ${template.name}`"><Copy :size="12" /></button>
            <button @click="deleteTemplate(template.name)" class="btn-item-action delete" :title="t('editor.sidebar_delete')" :aria-label="`${t('editor.sidebar_delete')}: ${template.name}`"><Trash2 :size="12" /></button>
          </div>
        </div>
        <p v-if="templates.length === 0" class="library-help">{{ t('editor.studio_no_templates') }}</p>
      </div>
    </div>

    <div class="nav-group modules">
      <div class="group-header">
        <h3>{{ t("editor.sidebar_modules") }}</h3>
        <span class="library-count" aria-live="polite">{{ filteredBlocks.length }}</span>
      </div>
      <div class="library-tools">
        <div class="library-search">
          <Search :size="15" aria-hidden="true" />
          <input v-model="search" type="search" :placeholder="t('editor.studio_search_modules')" :aria-label="t('editor.studio_search_modules')" />
          <button v-if="search" @click="search = ''" :aria-label="t('editor.studio_clear_search')"><X :size="14" /></button>
        </div>
        <div class="library-categories" :aria-label="t('editor.studio_categories')" role="group">
          <button v-for="item in categories" :key="item" @click="category = item" :aria-pressed="category === item" :class="{ active: category === item }">{{ t('editor.studio_category_' + item) }}</button>
        </div>
        <p class="library-help">{{ t('editor.studio_insert_hint') }}</p>
      </div>
      <div class="modules-grid custom-scrollbar">
        <button v-for="block in filteredBlocks" :key="block.id" :data-module-id="block.id" draggable="true" @dragstart="handleSidebarDragStart(block.content, $event)" @dragend="handleSidebarDragEnd($event)" @click="insertBlock(block.content)" :disabled="isTemplateLoading || isMorphing" class="module-card" :aria-label="t('editor.studio_insert_module', { name: t('editor.module_' + block.id) })" :title="t('editor.studio_insert_module', { name: t('editor.module_' + block.id) })">
          <span class="module-symbol"><component :is="block.icon" :size="20" class="mod-icon" /><Plus :size="11" class="module-add-icon" /></span>
          <span>{{ t("editor.module_" + block.id) }}</span>
        </button>
        <div v-if="filteredBlocks.length === 0" class="library-empty" role="status">
          <Search :size="24" />
          <p>{{ t('editor.studio_no_modules') }}</p>
          <button @click="clearFilters">{{ t('editor.studio_clear_filters') }}</button>
        </div>
      </div>
    </div>
    <VersionsModal v-if="versionsFor" :template-name="versionsFor" @close="versionsFor = null" />
  </aside>
</template>
