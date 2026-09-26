<script setup lang="ts">
import { Sparkles, X, Loader2, Wand2, Link2, Image as ImageIcon, Palette, Check, AlertTriangle, Clock, RefreshCcw } from "lucide-vue-next";
import { streamAiCampaign, assembleAiResult } from "~/composables/useAiCampaign";

const emit = defineEmits<{ close: [] }>();
const { t, locale } = useI18n();
const router = useRouter();

type Stage = "form" | "generating" | "assembling" | "review" | "saving" | "error";
const stage = ref<Stage>("form");
const errorMsg = ref("");
const progressChars = ref(0);
const assembleStep = ref("");

const form = reactive({
  brief: "",
  goal: "sell",
  url: "",
  listId: null as number | null,
  language: locale.value === "en" ? "en" : "es",
  tone: "",
  useBrandKit: true,
  aiImages: false,
});

const lists = ref<any[]>([]);
const aiStatus = ref<{ configured: boolean; provider: string | null; model: string | null } | null>(null);
const brand = ref<any>(null);

const result = ref<any>(null);
const html = ref("");

onMounted(async () => {
  const [l, s, b] = await Promise.all([
    $fetch<any[]>("/api/lists").catch(() => []),
    $fetch<any>("/api/ai/status").catch(() => null),
    $fetch<any>("/api/brand-kit").catch(() => null),
  ]);
  lists.value = l;
  aiStatus.value = s;
  brand.value = b;
  if (b?.language && !form.brief) form.language = b.language;
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => window.removeEventListener("keydown", onKey));
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && stage.value !== "saving") emit("close");
}

const hasBrand = computed(() => !!(brand.value?.name || brand.value?.voice));
const progressPct = computed(() => Math.min(95, Math.round((progressChars.value / 9000) * 100)));

async function generate() {
  if (!form.brief.trim()) return;
  stage.value = "generating";
  progressChars.value = 0;
  errorMsg.value = "";
  try {
    result.value = await streamAiCampaign(form, (chars) => (progressChars.value = chars));
    await assemble();
  } catch (e: any) {
    errorMsg.value = e?.message || String(e);
    stage.value = "error";
  }
}

async function assemble() {
  stage.value = "assembling";
  html.value = await assembleAiResult(result.value, {
    brand: form.useBrandKit ? brand.value : null,
    language: form.language,
    aiImages: form.aiImages,
    onImage: (n) => (assembleStep.value = t("aiwiz.images_progress", { n })),
  });
  stage.value = "review";
}

const WEEKDAYS: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const suggestedDate = computed(() => {
  const st = result.value?.campaign?.sendTime;
  if (!st) return null;
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(st.hour);
  if (st.weekday !== "any") {
    const target = WEEKDAYS[st.weekday];
    let diff = (target - d.getDay() + 7) % 7;
    if (diff === 0 && d.getTime() <= Date.now() + 15 * 60_000) diff = 7;
    d.setDate(d.getDate() + diff);
  } else if (d.getTime() <= Date.now() + 15 * 60_000) {
    d.setDate(d.getDate() + 1);
  }
  return d;
});

async function createCampaign(schedule: boolean) {
  if (!result.value) return;
  stage.value = "saving";
  const c = result.value.campaign;
  try {
    const templateName = `IA_${c.name.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60)}_${Date.now().toString().slice(-5)}`;
    await $fetch("/api/templates", { method: "POST", body: { name: templateName, content: html.value } }).catch(() => null);
    const created = await $fetch<any>("/api/campaigns", { method: "POST", body: { name: c.name, subject: c.subject } });
    await $fetch(`/api/campaigns/${created.id}`, {
      method: "PUT",
      body: {
        templateHtml: html.value,
        templateName,
        preheader: c.preheader,
        subjectB: c.subjectB,
        listId: form.listId,
        followUpSubject: c.followUpSubject,
        ...(schedule && suggestedDate.value && form.listId ? { status: "scheduled", scheduledAt: suggestedDate.value.toISOString() } : {}),
      },
    });
    router.push(`/campaigns/${created.id}`);
    emit("close");
  } catch (e: any) {
    errorMsg.value = e?.data?.statusMessage || e?.message || String(e);
    stage.value = "error";
  }
}

const GOALS = ["sell", "inform", "nurture", "reactivate", "event", "announce"];
</script>

<template>
  <Teleport to="body">
    <div class="tm-modal-backdrop" @click.self="stage !== 'saving' && emit('close')">
      <div class="tm-modal aiw" role="dialog" aria-modal="true" :aria-label="t('aiwiz.title')">
        <div class="tm-modal-head">
          <h2><Sparkles :size="17" class="aiw-spark" /> {{ t("aiwiz.title") }}</h2>
          <button class="tm-btn tm-btn-ghost tm-icon-btn" :disabled="stage === 'saving'" @click="emit('close')"><X :size="16" /></button>
        </div>

        <!-- FORM -->
        <div v-if="stage === 'form'" class="tm-modal-body">
          <div v-if="aiStatus && !aiStatus.configured" class="aiw-warn">
            <AlertTriangle :size="15" /> {{ t("aiwiz.not_configured") }}
            <NuxtLink to="/settings?tab=ai">{{ t("aiwiz.configure") }}</NuxtLink>
          </div>
          <div class="tm-field">
            <label>{{ t("aiwiz.brief") }}</label>
            <textarea v-model="form.brief" class="tm-textarea" rows="5" :placeholder="t('aiwiz.brief_ph')" maxlength="8000" autofocus></textarea>
          </div>
          <div class="tm-row">
            <div class="tm-field">
              <label>{{ t("aiwiz.goal") }}</label>
              <select v-model="form.goal" class="tm-select">
                <option v-for="g in GOALS" :key="g" :value="g">{{ t(`aiwiz.goals.${g}`) }}</option>
              </select>
            </div>
            <div class="tm-field">
              <label>{{ t("aiwiz.list") }}</label>
              <select v-model="form.listId" class="tm-select">
                <option :value="null">{{ t("aiwiz.no_list") }}</option>
                <option v-for="l in lists" :key="l.id" :value="l.id">{{ l.name }} ({{ l.contactCount }})</option>
              </select>
            </div>
            <div class="tm-field" style="flex: 0 0 120px">
              <label>{{ t("aiwiz.language") }}</label>
              <select v-model="form.language" class="tm-select">
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="pt">Português</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
              </select>
            </div>
          </div>
          <div class="tm-field">
            <label><Link2 :size="12" /> {{ t("aiwiz.url") }}</label>
            <input v-model="form.url" class="tm-input" type="url" :placeholder="t('aiwiz.url_ph')" />
          </div>
          <div class="tm-field">
            <label>{{ t("aiwiz.tone") }}</label>
            <input v-model="form.tone" class="tm-input" :placeholder="t('aiwiz.tone_ph')" maxlength="200" />
          </div>
          <div class="aiw-toggles">
            <label class="tm-check">
              <input v-model="form.useBrandKit" type="checkbox" :disabled="!hasBrand" />
              <Palette :size="13" />
              {{ hasBrand ? t("aiwiz.use_brand", { name: brand.name || "—" }) : t("aiwiz.no_brand") }}
            </label>
            <NuxtLink v-if="!hasBrand" to="/settings?tab=brand" class="aiw-link">{{ t("aiwiz.create_brand") }}</NuxtLink>
            <label class="tm-check">
              <input v-model="form.aiImages" type="checkbox" />
              <ImageIcon :size="13" /> {{ t("aiwiz.ai_images") }}
            </label>
          </div>
          <p class="tm-hint">{{ t("aiwiz.hint") }}</p>
        </div>

        <!-- GENERATING / ASSEMBLING / SAVING -->
        <div v-else-if="stage === 'generating' || stage === 'assembling' || stage === 'saving'" class="tm-modal-body aiw-progress">
          <div class="aiw-orb"><Wand2 :size="30" /></div>
          <strong>{{ t(`aiwiz.stage_${stage}`) }}</strong>
          <div v-if="stage === 'generating'" class="tm-bar" style="width: 100%"><span :style="{ width: `${progressPct}%` }"></span></div>
          <p class="tm-hint">{{ stage === "assembling" && assembleStep ? assembleStep : t(`aiwiz.stage_${stage}_hint`) }}</p>
        </div>

        <!-- REVIEW -->
        <div v-else-if="stage === 'review' && result" class="tm-modal-body">
          <div class="aiw-summary">
            <div><span class="tm-label">{{ t("aiwiz.subject") }}</span><strong>{{ result.campaign.subject }}</strong></div>
            <div v-if="result.campaign.subjectB"><span class="tm-label">{{ t("aiwiz.subject_b") }}</span>{{ result.campaign.subjectB }}</div>
            <div><span class="tm-label">{{ t("aiwiz.preheader") }}</span>{{ result.campaign.preheader }}</div>
            <p class="tm-hint aiw-rationale">{{ result.campaign.rationale }}</p>
            <p v-if="suggestedDate" class="tm-hint"><Clock :size="12" /> {{ t("aiwiz.send_time", { date: suggestedDate.toLocaleString(locale === "es" ? "es-ES" : "en-US", { weekday: "long", hour: "2-digit", minute: "2-digit" }) }) }} — {{ result.campaign.sendTime.reason }}</p>
          </div>
          <iframe class="aiw-preview" :srcdoc="html" sandbox="" :title="t('aiwiz.preview')"></iframe>
        </div>

        <!-- ERROR -->
        <div v-else-if="stage === 'error'" class="tm-modal-body">
          <div class="aiw-warn"><AlertTriangle :size="15" /> {{ errorMsg }}</div>
        </div>

        <div class="tm-modal-foot">
          <template v-if="stage === 'form'">
            <button class="tm-btn" @click="emit('close')">{{ t("common.cancel") }}</button>
            <button class="tm-btn tm-btn-primary" :disabled="!form.brief.trim() || aiStatus?.configured === false" @click="generate">
              <Sparkles :size="14" /> {{ t("aiwiz.generate") }}
            </button>
          </template>
          <template v-else-if="stage === 'review'">
            <button class="tm-btn" @click="stage = 'form'"><RefreshCcw :size="13" /> {{ t("aiwiz.retry") }}</button>
            <button v-if="suggestedDate && form.listId" class="tm-btn" @click="createCampaign(true)"><Clock :size="13" /> {{ t("aiwiz.create_scheduled") }}</button>
            <button class="tm-btn tm-btn-primary" @click="createCampaign(false)"><Check :size="14" /> {{ t("aiwiz.create") }}</button>
          </template>
          <template v-else-if="stage === 'error'">
            <button class="tm-btn" @click="emit('close')">{{ t("common.cancel") }}</button>
            <button class="tm-btn tm-btn-primary" @click="result && html ? (stage = 'review') : (stage = 'form')">{{ t("aiwiz.back") }}</button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.aiw {
  max-width: 760px;
}
.aiw h2 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.aiw-spark {
  color: #a5b4fc;
}
.aiw-warn {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12.5px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(251, 191, 36, 0.08);
  color: #fbbf24;
}
.aiw-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  align-items: center;
}
.aiw-link {
  font-size: 12px;
  color: var(--accent-light);
}
.aiw-progress {
  align-items: center;
  text-align: center;
  padding: 40px 28px;
}
.aiw-orb {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: radial-gradient(circle at 30% 30%, #818cf8, #4f46e5 60%, #312e81);
  box-shadow: 0 0 40px rgba(99, 102, 241, 0.45);
  animation: aiw-pulse 1.6s ease-in-out infinite;
}
@keyframes aiw-pulse {
  50% { transform: scale(1.06); box-shadow: 0 0 60px rgba(99, 102, 241, 0.6); }
}
.aiw-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.aiw-summary .tm-label {
  display: inline-block;
  min-width: 90px;
  margin-right: 6px;
}
.aiw-rationale {
  margin-top: 4px;
}
.aiw-preview {
  width: 100%;
  height: 420px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
}
</style>
