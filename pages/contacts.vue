<script setup lang="ts">
import {
  Users,
  Plus,
  Upload,
  Download,
  Search,
  Pencil,
  Trash2,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Tag,
  UserMinus,
} from "lucide-vue-next";
import * as XLSX from "xlsx";

definePageMeta({ layout: "app" });

const { t } = useI18n();
const { showToast, showDialog } = useDashboardState();

// ── State ─────────────────────────────────────────────────────────────────
const lists = ref<any[]>([]);
const selectedListId = ref<number | null>(null);
const contacts = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const totalPages = ref(1);
const search = ref("");
const statusFilter = ref("all");
const loading = ref(false);

const selectedContactIds = ref<Set<number>>(new Set());
const dragOverListId = ref<number | null>(null);
const removingIds = ref<Set<number>>(new Set());

const showContactModal = ref(false);
const editContact = ref<any>(null);
const showListModal = ref(false);
const editListData = ref<any>(null);
const newListName = ref("");
const newListColor = ref("#6366f1");
const tagInput = ref("");

const form = ref({
  email: "",
  name: "",
  company: "",
  phone: "",
  linkedin: "",
  url: "",
  youtube: "",
  instagram: "",
  tags: [] as string[],
  status: "active",
  listIds: [] as number[],
});

// ── Data Fetching ──────────────────────────────────────────────────────────
async function fetchLists() {
  lists.value = await $fetch("/api/lists");
}

async function fetchContacts() {
  loading.value = true;
  try {
    const params: any = {
      page: page.value,
      search: search.value,
      status: statusFilter.value,
    };
    if (selectedListId.value) params.list_id = selectedListId.value;
    const res = await $fetch<any>("/api/contacts", { params });
    contacts.value = res.data;
    total.value = res.total;
    totalPages.value = res.totalPages;
  } finally {
    loading.value = false;
  }
}

let searchTimer: any;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    fetchContacts();
  }, 300);
}

function selectList(id: number | null) {
  selectedListId.value = id;
  page.value = 1;
  selectedContactIds.value.clear();
  fetchContacts();
}

// ── Multi-select & Drag ───────────────────────────────────────────────────
function toggleContact(id: number) {
  if (selectedContactIds.value.has(id)) selectedContactIds.value.delete(id);
  else selectedContactIds.value.add(id);
  selectedContactIds.value = new Set(selectedContactIds.value);
}

function toggleAll() {
  if (selectedContactIds.value.size === contacts.value.length) {
    selectedContactIds.value = new Set();
  } else {
    selectedContactIds.value = new Set(contacts.value.map((c) => c.id));
  }
}

function onDragStart(e: DragEvent, contactId: number) {
  if (!selectedContactIds.value.has(contactId)) {
    selectedContactIds.value = new Set([contactId]);
  }
  e.dataTransfer!.effectAllowed = "copy";
  e.dataTransfer!.setData(
    "text/plain",
    JSON.stringify([...selectedContactIds.value]),
  );
}

function onDragEnd() {
  dragOverListId.value = null;
}

async function onDropList(e: DragEvent, listId: number) {
  e.preventDefault();
  dragOverListId.value = null;
  const raw = e.dataTransfer?.getData("text/plain");
  if (!raw) return;
  const ids: number[] = JSON.parse(raw);
  if (!ids.length) return;
  await $fetch(`/api/lists/${listId}/contacts`, {
    method: "POST",
    body: { contactIds: ids },
  });
  showToast(`${ids.length} contacto(s) asignado(s)`, "success");
  fetchLists();
}

// ── Contact CRUD ──────────────────────────────────────────────────────────
function openNewContact() {
  editContact.value = null;
  form.value = {
    email: "",
    name: "",
    company: "",
    phone: "",
    linkedin: "",
    url: "",
    youtube: "",
    instagram: "",
    tags: [],
    status: "active",
    listIds: selectedListId.value ? [selectedListId.value] : [],
  };
  showContactModal.value = true;
  nextTick(() => emailInputRef.value?.focus());
}

async function openEditContact(c: any) {
  editContact.value = c;
  const full = await $fetch<any>(`/api/contacts/${c.id}`);
  form.value = {
    ...full,
    tags: Array.isArray(full.tags) ? [...full.tags] : [],
    listIds: full.listIds ?? [],
  };
  showContactModal.value = true;
}

function addTag() {
  const t = tagInput.value.trim();
  if (t && !form.value.tags.includes(t)) form.value.tags.push(t);
  tagInput.value = "";
}

function removeTag(tag: string) {
  form.value.tags = form.value.tags.filter((x) => x !== tag);
}

async function saveContact() {
  if (!form.value.email) return;
  if (editContact.value) {
    await $fetch(`/api/contacts/${editContact.value.id}`, {
      method: "PUT",
      body: form.value,
    });
  } else {
    await $fetch("/api/contacts", { method: "POST", body: form.value });
  }
  showContactModal.value = false;
  fetchContacts();
}

async function deleteContact(c: any) {
  const ok = await showDialog({
    type: "confirm",
    title: t("contacts_page.confirm_delete"),
    message: c.email,
  });
  if (!ok) return;
  await $fetch(`/api/contacts/${c.id}`, { method: "DELETE" });
  fetchContacts();
}

async function removeFromList(contactId: number, listId: number) {
  removingIds.value = new Set([...removingIds.value, contactId]);
  await $fetch(`/api/lists/${listId}/contacts/${contactId}`, {
    method: "DELETE",
  });
  setTimeout(() => {
    removingIds.value.delete(contactId);
    removingIds.value = new Set(removingIds.value);
    fetchContacts();
    fetchLists();
  }, 320);
}

async function batchRemoveFromList() {
  if (!selectedListId.value || selectedContactIds.value.size === 0) return;
  const ids = [...selectedContactIds.value];
  removingIds.value = new Set(ids);
  await Promise.all(
    ids.map((id) =>
      $fetch(`/api/lists/${selectedListId.value}/contacts/${id}`, {
        method: "DELETE",
      }),
    ),
  );
  selectedContactIds.value = new Set();
  setTimeout(() => {
    removingIds.value = new Set();
    fetchContacts();
    fetchLists();
  }, 320);
}

// ── List CRUD ─────────────────────────────────────────────────────────────
function openNewList() {
  editListData.value = null;
  newListName.value = "";
  newListColor.value = "#6366f1";
  showListModal.value = true;
  nextTick(() => listNameInputRef.value?.focus());
}

function openEditList(list: any) {
  editListData.value = list;
  newListName.value = list.name;
  newListColor.value = list.color || "#6366f1";
  showListModal.value = true;
  nextTick(() => listNameInputRef.value?.focus());
}

async function saveList() {
  if (!newListName.value.trim()) return;
  if (editListData.value) {
    await $fetch(`/api/lists/${editListData.value.id}`, {
      method: "PUT",
      body: { name: newListName.value, color: newListColor.value },
    });
  } else {
    await $fetch("/api/lists", {
      method: "POST",
      body: { name: newListName.value, color: newListColor.value },
    });
  }
  showListModal.value = false;
  fetchLists();
}

async function deleteList(list: any) {
  const ok = await showDialog({
    type: "confirm",
    title: `¿Eliminar lista "${list.name}"?`,
  });
  if (!ok) return;
  await $fetch(`/api/lists/${list.id}`, { method: "DELETE" });
  if (selectedListId.value === list.id) selectedListId.value = null;
  fetchLists();
  fetchContacts();
}

// ── Import / Export ───────────────────────────────────────────────────────
const xlsxInputRef = ref<HTMLInputElement | null>(null);
const listNameInputRef = ref<HTMLInputElement | null>(null);
const emailInputRef = ref<HTMLInputElement | null>(null);

async function doImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const data = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(data), { type: "array" });
  const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    defval: "",
  }) as Record<string, any>[];
  if (!json.length) return;

  const cols = Object.keys(json[0]).filter(
    (k) =>
      k &&
      !k.startsWith("__EMPTY") &&
      json.some((r) => String(r[k] || "").trim()),
  );
  const find = (keys: string[]) =>
    cols.find((c) => keys.some((k) => c.toLowerCase().includes(k))) || "";

  const emailCol = find(["email", "mail", "correo"]) || cols[0] || "";
  const nameCol = find(["nombre", "name", "contacto", "persona"]);
  const compCol = find(["empresa", "company", "business", "entidad", "brand"]);
  const linkedCol = find(["linkedin", "social", "perfil"]);
  const urlCol = find(["url", "web", "sitio", "website", "link"]);
  const ytCol = find(["youtube", "video", "canal"]);
  const igCol = find(["instagram", "ig", "insta"]);

  const rows = json
    .map((r) => ({
      email: String(r[emailCol] || "").trim(),
      name: String(r[nameCol] || "").trim(),
      company: String(r[compCol] || "").trim(),
      linkedin: String(r[linkedCol] || "").trim(),
      url: String(r[urlCol] || "").trim(),
      youtube: String(r[ytCol] || "").trim(),
      instagram: String(r[igCol] || "").trim(),
    }))
    .filter((r) => r.email);

  const res = await $fetch<any>("/api/contacts/import", {
    method: "POST",
    body: { rows, listId: selectedListId.value },
  });
  (e.target as HTMLInputElement).value = "";
  showToast(
    `Importados: ${res.inserted} | Omitidos: ${res.skipped}`,
    "success",
  );
  fetchContacts();
  fetchLists();
}

async function doExport() {
  const params = selectedListId.value ? `?list_id=${selectedListId.value}` : "";
  window.location.href = `/api/contacts/export${params}`;
}

// ── Status badge ──────────────────────────────────────────────────────────
function statusLabel(s: string) {
  if (s === "active") return t("contacts_page.status_active");
  if (s === "unsubscribed") return t("contacts_page.status_unsubscribed");
  return t("contacts_page.status_bounced");
}
function statusClass(s: string) {
  if (s === "active") return "badge-active";
  if (s === "unsubscribed") return "badge-unsub";
  return "badge-bounced";
}

// ── Init ──────────────────────────────────────────────────────────────────
onMounted(() => {
  fetchLists();
  fetchContacts();
});

watch([search, statusFilter], () => {
  page.value = 1;
  fetchContacts();
});
</script>

<template>
  <div class="contacts-layout">
    <!-- Sidebar: Lists -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <h3>{{ t("nav.contacts") }}</h3>
        <button
          class="btn-icon"
          @click="openNewList"
          :title="t('contacts_page.new_list')"
        >
          <Plus :size="16" stroke-width="2.5" />
        </button>
      </div>

      <div
        class="list-item"
        :class="{ active: selectedListId === null }"
        @click="selectList(null)"
      >
        <Users :size="14" stroke-width="2.5" />
        <span>{{ t("contacts_page.all_lists") }}</span>
        <span class="list-count">{{ total }}</span>
      </div>

      <div
        v-for="list in lists"
        :key="list.id"
        class="list-item"
        :class="{
          active: selectedListId === list.id,
          'drop-target': dragOverListId === list.id,
        }"
        @click="selectList(list.id)"
        @dragover.prevent="dragOverListId = list.id"
        @dragleave="dragOverListId = null"
        @drop="onDropList($event, list.id)"
      >
        <span class="list-dot" :style="{ background: list.color }" />
        <span class="list-name">{{ list.name }}</span>
        <span class="list-count">{{ list.contactCount }}</span>
        <div class="list-actions">
          <button @click.stop="openEditList(list)" class="btn-icon-xs">
            <Pencil :size="13" />
          </button>
          <button @click.stop="deleteList(list)" class="btn-icon-xs red">
            <Trash2 :size="13" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="contacts-main">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1>{{ t("contacts_page.title") }}</h1>
          <p>{{ t("contacts_page.subtitle") }}</p>
        </div>
        <div class="header-actions">
          <input
            ref="xlsxInputRef"
            type="file"
            accept=".xlsx,.xls,.csv"
            style="display: none"
            @change="doImport"
          />
          <button class="btn-secondary" @click="xlsxInputRef?.click()">
            <Upload :size="15" stroke-width="2.5" />
            {{ t("contacts_page.import") }}
          </button>
          <button class="btn-secondary" @click="doExport">
            <Download :size="15" stroke-width="2.5" />
            {{ t("contacts_page.export") }}
          </button>
          <button class="btn-primary" @click="openNewContact">
            <Plus :size="15" stroke-width="2.5" />
            {{ t("contacts_page.new_contact") }}
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <div class="search-wrap">
          <Search :size="15" class="search-icon" />
          <input
            v-model="search"
            type="text"
            :placeholder="t('contacts_page.search')"
            class="search-input"
          />
        </div>
        <div class="filter-tabs">
          <button
            v-for="f in ['all', 'active', 'unsubscribed', 'bounced']"
            :key="f"
            class="filter-tab"
            :class="{ active: statusFilter === f }"
            @click="statusFilter = f"
          >
            {{
              t(`contacts_page.filter_${f === "unsubscribed" ? "unsub" : f}`)
            }}
          </button>
        </div>
      </div>

      <!-- Selection action bar -->
      <Transition name="fade-scale">
        <div v-if="selectedContactIds.size > 0" class="drag-hint">
          <Tag :size="13" />
          <span>{{ selectedContactIds.size }} seleccionado(s)</span>
          <span class="drag-hint-sep" v-if="!selectedListId"
            >— arrastra a una lista del panel izquierdo</span
          >
          <button
            v-if="selectedListId"
            class="batch-remove-btn"
            @click="batchRemoveFromList"
            :title="`Quitar de ${lists.find((l) => l.id === selectedListId)?.name}`"
          >
            <UserMinus :size="13" />
            Quitar de lista
          </button>
          <button
            class="drag-hint-clear"
            @click="selectedContactIds = new Set()"
          >
            <X :size="12" />
          </button>
        </div>
      </Transition>

      <!-- Table -->
      <div class="table-wrap">
        <div v-if="loading" class="loading-state">
          {{ t("common.loading") }}
        </div>
        <div v-else-if="contacts.length === 0" class="empty-state">
          <Users :size="40" class="empty-icon" />
          <p>{{ t("contacts_page.no_contacts") }}</p>
        </div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th class="col-check">
                <input
                  type="checkbox"
                  :checked="
                    selectedContactIds.size === contacts.length &&
                    contacts.length > 0
                  "
                  :indeterminate="
                    selectedContactIds.size > 0 &&
                    selectedContactIds.size < contacts.length
                  "
                  @change="toggleAll"
                />
              </th>
              <th>{{ t("contacts_page.col_email") }}</th>
              <th>{{ t("contacts_page.col_company") }}</th>
              <th>{{ t("contacts_page.col_name") }}</th>
              <th>{{ t("contacts_page.col_status") }}</th>
              <th>{{ t("contacts_page.col_actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in contacts"
              :key="c.id"
              :class="{
                selected: selectedContactIds.has(c.id),
                removing: removingIds.has(c.id),
              }"
              draggable="true"
              @dragstart="onDragStart($event, c.id)"
              @dragend="onDragEnd"
            >
              <td class="col-check" @click.stop>
                <input
                  type="checkbox"
                  :checked="selectedContactIds.has(c.id)"
                  @change="toggleContact(c.id)"
                />
              </td>
              <td>
                <div class="email-cell">
                  <span class="cell-email">{{ c.email }}</span>
                  <div v-if="c.lists?.length" class="contact-list-chips">
                    <span
                      v-for="list in c.lists.slice(0, 3)"
                      :key="list.id"
                      class="contact-chip"
                    >
                      <span
                        class="chip-dot"
                        :style="{ background: list.color }"
                      />
                      <span class="chip-label">{{ list.name }}</span>
                      <button
                        class="chip-x"
                        @click.stop="removeFromList(c.id, list.id)"
                        :title="`Quitar de ${list.name}`"
                      >
                        <X :size="9" />
                      </button>
                    </span>
                    <span v-if="c.lists.length > 3" class="chip-more">
                      +{{ c.lists.length - 3 }}
                    </span>
                  </div>
                </div>
              </td>
              <td>{{ c.company || "—" }}</td>
              <td>{{ c.name || "—" }}</td>
              <td>
                <span class="badge" :class="statusClass(c.status)">{{
                  statusLabel(c.status)
                }}</span>
              </td>
              <td>
                <div class="row-actions">
                  <button class="btn-icon-xs" @click="openEditContact(c)">
                    <Pencil :size="13" />
                  </button>
                  <button
                    v-if="selectedListId"
                    class="btn-icon-xs amber"
                    :title="`Quitar de lista`"
                    @click.stop="removeFromList(c.id, selectedListId!)"
                  >
                    <UserMinus :size="13" />
                  </button>
                  <button class="btn-icon-xs red" @click="deleteContact(c)">
                    <Trash2 :size="13" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="pagination">
        <button
          class="btn-page"
          :disabled="page === 1"
          @click="
            page--;
            fetchContacts();
          "
        >
          <ChevronLeft :size="16" />
        </button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
        <button
          class="btn-page"
          :disabled="page === totalPages"
          @click="
            page++;
            fetchContacts();
          "
        >
          <ChevronRight :size="16" />
        </button>
      </div>
    </main>

    <!-- Contact Modal -->
    <Transition name="fade-scale">
      <div
        v-if="showContactModal"
        class="modal-overlay"
        @click="showContactModal = false"
      >
        <div class="modal-box contact-form" @click.stop>
          <div class="modal-head">
            <h2>
              {{
                editContact
                  ? t("contacts_page.edit")
                  : t("contacts_page.new_contact")
              }}
            </h2>
            <button @click="showContactModal = false" class="btn-icon">
              <X :size="16" />
            </button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <label
                >{{ t("contacts_page.email") }} *
                <input
                  ref="emailInputRef"
                  v-model="form.email"
                  type="email"
                  class="form-input"
                />
              </label>
              <label
                >{{ t("contacts_page.name") }}
                <input v-model="form.name" type="text" class="form-input" />
              </label>
              <label
                >{{ t("contacts_page.company") }}
                <input v-model="form.company" type="text" class="form-input" />
              </label>
              <label
                >{{ t("contacts_page.phone") }}
                <input v-model="form.phone" type="text" class="form-input" />
              </label>
              <label
                >{{ t("contacts_page.linkedin") }}
                <input v-model="form.linkedin" type="text" class="form-input" />
              </label>
              <label
                >{{ t("contacts_page.url") }}
                <input v-model="form.url" type="text" class="form-input" />
              </label>
              <label
                >{{ t("contacts_page.youtube") }}
                <input v-model="form.youtube" type="text" class="form-input" />
              </label>
              <label
                >{{ t("contacts_page.instagram") }}
                <input
                  v-model="form.instagram"
                  type="text"
                  class="form-input"
                />
              </label>
              <label class="full-width"
                >{{ t("contacts_page.tags") }}
                <div class="tag-input-wrap">
                  <div class="tag-list">
                    <span v-for="tag in form.tags" :key="tag" class="tag-chip">
                      {{ tag }}
                      <button @click="removeTag(tag)"><X :size="10" /></button>
                    </span>
                  </div>
                  <input
                    v-model="tagInput"
                    :placeholder="t('contacts_page.add_tag')"
                    class="form-input tag-in"
                    @keydown.enter.prevent="addTag"
                    @keydown.comma.prevent="addTag"
                  />
                </div>
              </label>
              <label class="full-width"
                >{{ t("contacts_page.lists") }}
                <div class="list-checks">
                  <label
                    v-for="list in lists"
                    :key="list.id"
                    class="list-check-item"
                  >
                    <input
                      type="checkbox"
                      :value="list.id"
                      v-model="form.listIds"
                    />
                    <span
                      class="list-dot"
                      :style="{ background: list.color }"
                    />
                    {{ list.name }}
                  </label>
                </div>
              </label>
              <label v-if="editContact"
                >Estado
                <select v-model="form.status" class="form-input">
                  <option value="active">
                    {{ t("contacts_page.status_active") }}
                  </option>
                  <option value="unsubscribed">
                    {{ t("contacts_page.status_unsubscribed") }}
                  </option>
                  <option value="bounced">
                    {{ t("contacts_page.status_bounced") }}
                  </option>
                </select>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="showContactModal = false">
              {{ t("common.cancel") }}
            </button>
            <button class="btn-primary" @click="saveContact">
              <Check :size="15" />{{ t("common.save") }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- List Modal -->
    <Transition name="fade-scale">
      <div
        v-if="showListModal"
        class="modal-overlay"
        @click="showListModal = false"
      >
        <div class="modal-box list-form" @click.stop>
          <div class="modal-head">
            <h2>
              {{ editListData ? "Editar lista" : t("contacts_page.new_list") }}
            </h2>
            <button @click="showListModal = false" class="btn-icon">
              <X :size="16" />
            </button>
          </div>
          <div class="modal-body">
            <label
              >{{ t("contacts_page.list_name") }}
              <input
                ref="listNameInputRef"
                v-model="newListName"
                type="text"
                class="form-input"
                @keydown.enter="saveList"
              />
            </label>
            <label
              >Color
              <input
                v-model="newListColor"
                type="color"
                class="form-input color-in"
              />
            </label>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="showListModal = false">
              {{ t("common.cancel") }}
            </button>
            <button class="btn-primary" @click="saveList">
              <Check :size="15" />{{ t("common.save") }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.contacts-layout {
  display: flex;
  min-height: calc(100vh - 80px);
  color: var(--text);
  position: relative;
}

/* Sidebar */
.sidebar {
  width: 240px;
  flex-shrink: 0;
  background: rgb(0 0 0 / 7%);
  backdrop-filter: blur(12px);
  border-right: 1px solid var(--border);
  padding: 24px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 1;
}
.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8px 16px;
}
.sidebar-header h3 {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  color: var(--text-muted);
  position: relative;
}
.list-item:hover {
  background: rgb(0 0 0 / 5%);
  color: var(--text);
}
.list-item.active {
  background: rgba(99, 102, 241, 0.1);
  color: var(--accent-light);
}
.list-item.drop-target {
  background: rgba(99, 102, 241, 0.18);
  border: 1px dashed rgba(99, 102, 241, 0.6);
  color: var(--accent-light);
  scale: 1.02;
}

.list-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.list-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.list-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
  margin-left: auto;
}
.list-actions {
  display: none;
  gap: 2px;
}
.list-item:hover .list-actions {
  display: flex;
}

/* Main */
.contacts-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 32px 40px;
  z-index: 1;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
}
.page-header h1 {
  font-size: 24px;
  font-weight: 800;
}
.page-header p {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
}

.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

/* Filters */
.filters-bar {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.search-wrap {
  position: relative;
  flex: 1;
  min-width: 200px;
}
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-dim);
}
.search-input {
  width: 100%;
  padding: 9px 12px 9px 36px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 13px;
  outline: none;
}
.search-input:focus {
  border-color: var(--accent);
}

.filter-tabs {
  display: flex;
  gap: 4px;
}
.filter-tab {
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;
}
.filter-tab:hover {
  background: rgb(0 0 0 / 5%);
  color: var(--text);
}
.filter-tab.active {
  background: rgba(99, 102, 241, 0.12);
  color: var(--accent-light);
  border-color: rgba(99, 102, 241, 0.3);
}

/* Table */
.table-wrap {
  flex: 1;
  overflow: auto;
  background: rgb(0 0 0 / 6%);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: 16px;
}
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
  color: var(--text-dim);
  gap: 12px;
}
.empty-icon {
  opacity: 0.3;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th {
  padding: 12px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border);
  background: rgb(0 0 0 / 1%);
}
.data-table td {
  padding: 12px 16px;
  font-size: 13px;
  border-bottom: 1px solid rgb(0 0 0 / 3%);
}
.data-table tr:last-child td {
  border-bottom: none;
}
.data-table tr:hover td {
  background: rgb(0 0 0 / 3%);
}
.data-table tr.selected td {
  background: rgba(99, 102, 241, 0.06);
}
.data-table tr[draggable="true"] {
  cursor: grab;
}
.data-table tr[draggable="true"]:active {
  cursor: grabbing;
}
.col-check {
  width: 44px;
  padding-left: 14px;
  padding-right: 4px;
}
.col-check input[type="checkbox"] {
  width: 24px;
  height: 24px;
  cursor: pointer;
  accent-color: var(--accent);
}

.drag-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-light);
  margin-bottom: 12px;
}
.drag-hint-sep {
  opacity: 0.7;
  font-weight: 500;
}
.drag-hint-clear {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--accent-light);
  opacity: 0.6;
  display: flex;
  padding: 0;
}
.drag-hint-clear:hover {
  opacity: 1;
}
.batch-remove-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #ef4444;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  margin-left: auto;
}
.batch-remove-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  transform: translateY(-1px);
}

/* Email cell with list chips */
.contact-list-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
.contact-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px 3px 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  transition: all 0.15s;
  max-width: 140px;
}
.contact-chip:hover {
  background: rgba(239, 68, 68, 0.07);
  border-color: rgba(239, 68, 68, 0.25);
  color: var(--text);
}
.contact-chip:hover .chip-x {
  opacity: 1;
  width: 14px;
}
.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}
.chip-x {
  width: 0;
  overflow: hidden;
  opacity: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: #ef4444;
  display: flex;
  align-items: center;
  padding: 0;
  transition: all 0.15s;
  flex-shrink: 0;
}
.chip-x:hover {
  color: #dc2626;
}
.chip-more {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  color: var(--accent-light);
}

/* Row remove animation */
.data-table tr.removing td {
  opacity: 0;
  transform: translateX(-10px);
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.btn-icon-xs.amber:hover {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
  border-color: rgba(245, 158, 11, 0.25);
}
.email-cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.cell-email {
  font-family: monospace;
  font-size: 12px;
  color: var(--accent-light);
}

.badge {
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
}
.badge-active {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}
.badge-unsub {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}
.badge-bounced {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.row-actions {
  display: flex;
  gap: 6px;
}

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
  padding: 20px 0 0;
}
.btn-page {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.btn-page:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent-light);
}
.btn-page:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.page-info {
  font-size: 13px;
  color: var(--text-muted);
}

/* Buttons */
.btn-primary {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 18px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
.btn-secondary {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  background: transparent;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-secondary:hover {
  background: rgb(0 0 0 / 5%);
  color: var(--text);
}
.btn-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.btn-icon:hover {
  background: rgb(0 0 0 / 7%);
  color: var(--text);
}
.btn-icon-xs {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.btn-icon-xs:hover {
  background: rgb(0 0 0 / 8%);
  color: var(--text);
  border-color: var(--border);
}
.btn-icon-xs.red:hover {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.2);
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-box {
  background: #0d0f1c;
  border: 1px solid var(--border-hi);
  border-radius: 24px;
  width: 90%;
  box-shadow: 0 40px 80px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.contact-form {
  max-width: 640px;
}
.list-form {
  max-width: 360px;
}
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}
.modal-head h2 {
  font-size: 16px;
  font-weight: 800;
}
.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 60vh;
  overflow-y: auto;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.full-width {
  grid-column: 1 / -1;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
}
.form-input {
  padding: 9px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 13px;
  outline: none;
  width: 100%;
}
.form-input:focus {
  border-color: var(--accent);
}
select.form-input {
  background: #0d1017;
  appearance: none;
}
select.form-input option {
  background-color: #090b14;
  color: #f8fafc;
}
.color-in {
  padding: 4px;
  height: 40px;
  cursor: pointer;
}

.tag-input-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 20px;
  font-size: 12px;
  color: var(--accent-light);
}
.tag-chip button {
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  display: flex;
  padding: 0;
}
.tag-in {
  margin-top: 4px;
}

.list-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
.list-check-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
  flex-direction: row;
}
.list-check-item:has(input:checked) {
  border-color: rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.08);
  color: var(--accent-light);
}
.list-check-item input {
  accent-color: var(--accent);
}

/* ── Responsive ──────────────────────────────────────────── */

/* Tablet ≤900px */
@media (max-width: 900px) {
  .sidebar {
    width: 200px;
  }
  .contacts-main {
    padding: 24px 24px;
  }
}

/* Mobile ≤768px — sidebar becomes horizontal scroll strip */
@media (max-width: 768px) {
  .contacts-layout {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    padding: 10px 12px;
    border-right: none;
    border-bottom: 1px solid var(--border);
    gap: 6px;
    flex-shrink: 0;
    min-height: unset;
  }
  .sidebar::-webkit-scrollbar {
    display: none;
  }
  .sidebar-header {
    display: none;
  }
  .list-item {
    flex-shrink: 0;
    border-radius: 20px;
    padding: 7px 14px;
    white-space: nowrap;
    min-height: 36px;
    border: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.03);
    font-size: 12px;
    gap: 7px;
  }
  .list-item.active {
    background: rgba(99, 102, 241, 0.12);
    border-color: rgba(99, 102, 241, 0.35);
  }
  .list-actions {
    display: none !important;
  }
  .contacts-main {
    padding: 20px 16px;
    min-height: unset;
  }
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 20px;
  }
  .page-header h1 {
    font-size: 22px;
  }
  .header-actions {
    width: 100%;
    gap: 8px;
  }
  .header-actions .btn-primary,
  .header-actions .btn-secondary {
    flex: 1;
    justify-content: center;
    min-height: 44px;
  }
  .filters-bar {
    gap: 10px;
    margin-bottom: 14px;
  }
  .filter-tabs {
    width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
    gap: 6px;
    flex-wrap: nowrap;
  }
  .filter-tabs::-webkit-scrollbar {
    display: none;
  }
  .filter-tab {
    flex-shrink: 0;
    min-height: 40px;
  }
}

@media (max-width: 768px) {
  .contact-list-chips {
    display: none;
  }
  .batch-remove-btn span {
    display: none;
  }
}

/* Mobile ≤640px — table columns collapse */
@media (max-width: 640px) {
  .contacts-main {
    padding: 16px 12px;
  }
  .page-header h1 {
    font-size: 20px;
  }
  .header-actions {
    flex-direction: column;
  }
  .header-actions .btn-primary,
  .header-actions .btn-secondary {
    width: 100%;
  }
  .table-wrap {
    border-radius: 12px;
  }
  .data-table th:nth-child(4),
  .data-table td:nth-child(4),
  .data-table th:nth-child(5),
  .data-table td:nth-child(5) {
    display: none;
  }
  .data-table th,
  .data-table td {
    padding: 10px 12px;
    font-size: 12px;
  }
  .cell-email {
    font-size: 11px;
  }
  .pagination {
    gap: 8px;
    padding: 14px 0 0;
  }
  .btn-page {
    width: 36px;
    height: 36px;
  }
  .modal-box {
    width: 98%;
    border-radius: 18px;
  }
  .modal-body {
    padding: 16px;
    max-height: 55vh;
  }
  .modal-head {
    padding: 16px 18px;
  }
  .modal-footer {
    padding: 12px 18px;
    flex-direction: column-reverse;
    gap: 8px;
  }
  .modal-footer .btn-primary,
  .modal-footer .btn-secondary {
    width: 100%;
    justify-content: center;
    min-height: 44px;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .full-width {
    grid-column: 1;
  }
}
</style>
