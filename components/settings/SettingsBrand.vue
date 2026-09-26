<script setup lang="ts">
import { Wand2, Loader2, Palette, Plus, X } from "lucide-vue-next";

const { t } = useI18n();
const { showToast } = useDashboardState();

const kit = ref<any>(null);
const url = ref("");
const extracting = ref(false);
const saving = ref(false);
const images = ref<string[]>([]);

onMounted(async () => {
  kit.value = await $fetch<any>("/api/brand-kit");
  url.value = kit.value.website || "";
});

async function extract() {
  if (!url.value) return;
  extracting.value = true;
  try {
    const r = await $fetch<any>("/api/brand-kit/extract", { method: "POST", body: { url: url.value } });
    kit.value = { ...kit.value, ...r.kit };
    images.value = r.source?.images ?? [];
    showToast(t("settings.brand.extracted"), "success");
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    extracting.value = false;
  }
}

async function saveKit() {
  saving.value = true;
  try {
    kit.value = await $fetch<any>("/api/brand-kit", { method: "PUT", body: kit.value });
    showToast(t("settings.saved"), "success");
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    saving.value = false;
  }
}

const newItem = reactive({ valueProps: "", products: "", doNotSay: "" });
function addTo(key: "valueProps" | "products" | "doNotSay") {
  const v = newItem[key].trim();
  if (!v) return;
  kit.value[key] = [...(kit.value[key] ?? []), v];
  newItem[key] = "";
}
</script>

<template>
  <div v-if="kit" class="tm-main" style="padding: 0">
    <section class="tm-card">
      <h3 class="tm-card-title"><span class="tm-title-left"><Wand2 :size="14" /> {{ t("settings.brand.from_web") }}</span></h3>
      <p class="tm-hint">{{ t("settings.brand.from_web_hint") }}</p>
      <div class="tm-row" style="align-items: flex-end">
        <div class="tm-field"><input v-model="url" class="tm-input" type="url" placeholder="https://tuempresa.com" @keydown.enter="extract" /></div>
        <button class="tm-btn tm-btn-primary" :disabled="extracting || !url" @click="extract">
          <Loader2 v-if="extracting" :size="13" class="tm-spin" /><Wand2 v-else :size="13" /> {{ t("settings.brand.analyze") }}
        </button>
      </div>
    </section>

    <div class="tm-grid-2">
      <section class="tm-card">
        <h3 class="tm-card-title"><span class="tm-title-left"><Palette :size="14" /> {{ t("settings.brand.identity") }}</span></h3>
        <div class="tm-row">
          <div class="tm-field"><label>{{ t("settings.brand.name") }}</label><input v-model="kit.name" class="tm-input" /></div>
          <div class="tm-field"><label>{{ t("settings.brand.language") }}</label>
            <select v-model="kit.language" class="tm-select"><option v-for="l in ['es', 'en', 'pt', 'fr', 'de', 'it', 'ca']" :key="l" :value="l">{{ l }}</option></select>
          </div>
        </div>
        <div class="tm-field"><label>Tagline</label><input v-model="kit.tagline" class="tm-input" /></div>
        <div class="tm-field">
          <label>Logo (URL)</label>
          <input v-model="kit.logoUrl" class="tm-input" placeholder="https://…/logo.png" />
          <img v-if="kit.logoUrl" :src="kit.logoUrl" alt="" class="brand-logo" />
        </div>
        <div class="brand-colors">
          <label v-for="c in ['primary', 'secondary', 'background', 'text']" :key="c" class="brand-color">
            <input v-model="kit.colors[c]" type="color" />
            <span>{{ t(`settings.brand.color_${c}`) }}</span>
            <code>{{ kit.colors[c] }}</code>
          </label>
        </div>
        <div class="tm-row">
          <div class="tm-field"><label>{{ t("settings.brand.font_heading") }}</label><input v-model="kit.fonts.heading" class="tm-input" /></div>
          <div class="tm-field"><label>{{ t("settings.brand.font_body") }}</label><input v-model="kit.fonts.body" class="tm-input" /></div>
        </div>
        <div v-if="images.length" class="tm-field">
          <label>{{ t("settings.brand.images_found") }}</label>
          <div class="brand-imgs"><img v-for="im in images" :key="im" :src="im" alt="" loading="lazy" /></div>
        </div>
      </section>

      <section class="tm-card">
        <h3 class="tm-card-title">{{ t("settings.brand.voice_title") }}</h3>
        <div class="tm-field"><label>{{ t("settings.brand.voice") }}</label><textarea v-model="kit.voice" class="tm-textarea" rows="3"></textarea></div>
        <div class="tm-field"><label>{{ t("settings.brand.audience") }}</label><textarea v-model="kit.audience" class="tm-textarea" rows="2"></textarea></div>
        <div v-for="key in (['valueProps', 'products', 'doNotSay'] as const)" :key="key" class="tm-field">
          <label>{{ t(`settings.brand.${key}`) }}</label>
          <div class="chips">
            <span v-for="(v, i) in kit[key]" :key="i" class="tm-badge accent">{{ v }} <button class="chip-x" @click="kit[key].splice(i, 1)"><X :size="10" /></button></span>
          </div>
          <div class="tm-row"><div class="tm-field"><input v-model="newItem[key]" class="tm-input" @keydown.enter.prevent="addTo(key)" /></div>
            <button class="tm-btn tm-btn-sm" @click="addTo(key)"><Plus :size="12" /></button></div>
        </div>
        <div class="tm-field"><label>{{ t("settings.brand.footer") }}</label><textarea v-model="kit.footer" class="tm-textarea" rows="2"></textarea></div>
        <div class="tm-actions"><button class="tm-btn tm-btn-primary" :disabled="saving" @click="saveKit">{{ t("settings.save") }}</button></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.brand-logo {
  max-height: 48px;
  max-width: 200px;
  margin-top: 6px;
  background: #fff;
  border-radius: 6px;
  padding: 4px;
  align-self: flex-start;
}
.brand-colors {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.brand-color {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.brand-color input {
  width: 34px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: none;
  padding: 0;
}
.brand-color code {
  color: var(--text-muted);
  margin-left: auto;
}
.brand-imgs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
  gap: 6px;
}
.brand-imgs img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 8px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip-x {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
}
</style>
