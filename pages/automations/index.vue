<script setup lang="ts">
import { Workflow, Plus, Loader2, Hand, ShoppingCart, ShoppingBag, HeartHandshake, Cake, FilePlus2, X, Zap, Trash2, Copy } from "lucide-vue-next";
import { automationTemplates, type TemplateStep } from "~/utils/automationTemplates";
import { assembleEmail } from "~/utils/emailAssembler";
import { repairAssembledHtml } from "~/composables/useAiCampaign";
import { stepId } from "~/utils/automation-types";

definePageMeta({ layout: "app" });
const { t, locale } = useI18n();
const router = useRouter();
const { showToast, showDialog } = useDashboardState();
const { can, me, refresh: refreshMe } = useMe();

const autos = ref<any[]>([]);
const loading = ref(true);
async function load() {
  loading.value = true;
  try {
    autos.value = await $fetch<any[]>("/api/automations");
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  if (!me.value) refreshMe();
  load();
});

// ── Create from template ─────────────────────────────────────────────
const gallery = ref(false);
const creating = ref<string | null>(null);
const ICONS: Record<string, any> = { hand: Hand, cart: ShoppingCart, bag: ShoppingBag, heart: HeartHandshake, cake: Cake, plus: FilePlus2 };
const templates = computed(() => automationTemplates(locale.value));

async function materialize(steps: TemplateStep[], brand: any, lang: string): Promise<any[]> {
  const out: any[] = [];
  const site = brand?.website || window.location.origin;
  for (const s of steps) {
    const { email, yes, no, ...rest } = s;
    const step: any = { id: stepId(), ...rest };
    if (email) {
      const blocks = email.blocks.map((b) => ({
        ...b,
        fields: { ...b.fields, ...(b.fields.buttonUrl === "{{WEB_URL}}" ? { buttonUrl: site } : {}) },
      }));
      step.subject = email.subject;
      step.preheader = email.preheader;
      step.templateHtml = await repairAssembledHtml(await assembleEmail({ blocks, styleId: "default", brand, language: lang }));
    }
    if (s.type === "condition") {
      step.yes = await materialize(yes ?? [], brand, lang);
      step.no = await materialize(no ?? [], brand, lang);
    }
    out.push(step);
  }
  return out;
}

async function createFrom(tplId: string) {
  const tpl = templates.value.find((x) => x.id === tplId)!;
  creating.value = tplId;
  try {
    const brand = await $fetch<any>("/api/brand-kit").catch(() => null);
    const lang = brand?.language || (locale.value === "en" ? "en" : "es");
    const steps = await materialize(tpl.steps, brand?.name ? brand : null, lang);
    const r = await $fetch<{ id: number }>("/api/automations", {
      method: "POST",
      body: { name: t(`automations.tpl.${tpl.id}`), trigger: tpl.trigger, steps },
    });
    await router.push(`/automations/${r.id}`);
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  } finally {
    creating.value = null;
  }
}

async function duplicate(a: any) {
  try {
    const full = await $fetch<any>(`/api/automations/${a.id}`);
    // Fresh ids + no carrier ids: the copy gets its own carrier campaigns
    const clone = (list: any[]): any[] => list.map((s) => ({
      ...s, id: stepId(), campaignId: null,
      ...(s.yes ? { yes: clone(s.yes) } : {}), ...(s.no ? { no: clone(s.no) } : {}),
    }));
    const r = await $fetch<{ id: number }>("/api/automations", {
      method: "POST",
      body: { name: `${full.name} (${t("automations.copy")})`, trigger: full.trigger, steps: clone(full.steps), allowReentry: full.allowReentry },
    });
    await router.push(`/automations/${r.id}`);
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  }
}

async function remove(a: any) {
  if (!(await showDialog({ type: "confirm", title: t("automations.delete_title"), message: t("automations.delete_msg", { name: a.name }) }))) return;
  try {
    await $fetch(`/api/automations/${a.id}`, { method: "DELETE" });
    await load();
  } catch (e: any) {
    showToast(e?.data?.statusMessage || e.message, "error");
  }
}

function triggerLabel(tr: any) {
  return tr ? t(`automations.triggers.${tr.type}`) : "—";
}
</script>

<template>
  <div class="tm-page">
    <main class="tm-main">
      <div class="tm-header">
        <div class="tm-header-left">
          <Workflow :size="30" class="tm-header-icon" />
          <div>
            <h1>{{ t("automations.title") }}</h1>
            <p class="tm-sub">{{ t("automations.subtitle") }}</p>
          </div>
        </div>
        <button v-if="can('editor')" class="tm-btn tm-btn-primary" @click="gallery = true"><Plus :size="14" /> {{ t("automations.new") }}</button>
      </div>

      <div v-if="loading" class="tm-loading"><Loader2 :size="18" class="tm-spin" /></div>

      <section v-else-if="!autos.length" class="tm-card empty-hero">
        <Workflow :size="36" />
        <h2>{{ t("automations.empty_title") }}</h2>
        <p class="tm-hint">{{ t("automations.empty_hint") }}</p>
        <div class="tpl-grid">
          <button v-for="tp in templates" :key="tp.id" class="tpl-card" :disabled="!!creating || !can('editor')" @click="createFrom(tp.id)">
            <component :is="ICONS[tp.icon]" :size="20" />
            <strong>{{ t(`automations.tpl.${tp.id}`) }}</strong>
            <span>{{ t(`automations.tpl.${tp.id}_desc`) }}</span>
            <Loader2 v-if="creating === tp.id" :size="14" class="tm-spin" />
          </button>
        </div>
      </section>

      <div v-else class="auto-grid">
        <article v-for="a in autos" :key="a.id" class="auto-card" role="button" tabindex="0" @click="router.push(`/automations/${a.id}`)" @keydown.enter="router.push(`/automations/${a.id}`)">
          <div class="auto-head">
            <strong>{{ a.name }}</strong>
            <span class="tm-badge" :class="a.status === 'active' ? 'ok' : a.status === 'paused' ? 'warn' : ''">{{ t(`automations.status.${a.status}`) }}</span>
          </div>
          <div class="auto-trigger"><Zap :size="12" /> {{ triggerLabel(a.trigger) }} · {{ t("automations.n_steps", { n: a.stepsCount }) }}</div>
          <div class="auto-stats">
            <div><span>{{ a.runs.active + a.runs.waiting }}</span>{{ t("automations.in_progress") }}</div>
            <div><span>{{ a.runs.done }}</span>{{ t("automations.completed") }}</div>
            <div><span>{{ a.runs.total }}</span>{{ t("automations.total") }}</div>
          </div>
          <div v-if="can('editor')" class="auto-actions" @click.stop>
            <button class="tm-btn tm-btn-sm tm-btn-ghost" :title="t('automations.duplicate')" @click="duplicate(a)"><Copy :size="13" /></button>
            <button class="tm-btn tm-btn-sm tm-btn-ghost" :title="t('common.delete')" @click="remove(a)"><Trash2 :size="13" /></button>
          </div>
        </article>
      </div>
    </main>

    <Teleport to="body">
      <div v-if="gallery" class="tm-modal-backdrop" @click.self="gallery = false">
        <div class="tm-modal gallery" role="dialog" aria-modal="true">
          <div class="tm-modal-head"><h2>{{ t("automations.new") }}</h2><button class="tm-btn tm-btn-ghost tm-icon-btn" @click="gallery = false"><X :size="16" /></button></div>
          <div class="tm-modal-body">
            <p class="tm-hint">{{ t("automations.gallery_hint") }}</p>
            <div class="tpl-grid">
              <button v-for="tp in templates" :key="tp.id" class="tpl-card" :disabled="!!creating" @click="createFrom(tp.id)">
                <component :is="ICONS[tp.icon]" :size="20" />
                <strong>{{ t(`automations.tpl.${tp.id}`) }}</strong>
                <span>{{ t(`automations.tpl.${tp.id}_desc`) }}</span>
                <Loader2 v-if="creating === tp.id" :size="14" class="tm-spin" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.empty-hero {
  align-items: center;
  text-align: center;
  padding: 36px 24px;
}
.empty-hero h2 {
  margin: 4px 0 0;
  font-size: 20px;
}
.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 10px;
  width: 100%;
  margin-top: 8px;
}
.tpl-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.tpl-card:hover:not(:disabled) {
  border-color: rgba(129, 140, 248, 0.6);
  transform: translateY(-1px);
}
.tpl-card svg:first-child {
  color: #a5b4fc;
}
.tpl-card span {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
}
.gallery {
  width: min(820px, 96vw);
}
.auto-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.auto-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: border-color 0.15s;
}
.auto-card:hover {
  border-color: rgba(129, 140, 248, 0.5);
}
.auto-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
.auto-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}
.auto-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.auto-stats div {
  display: flex;
  flex-direction: column;
  font-size: 10.5px;
  color: var(--text-muted);
}
.auto-stats span {
  font-size: 18px;
  font-weight: 800;
  color: var(--text);
}
.auto-actions {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  gap: 2px;
}
</style>
