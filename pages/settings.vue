<script setup lang="ts">
import { Settings, Send, ShieldCheck, Sparkles, Palette, Plug, DatabaseBackup, Cpu, Globe2, Users, Loader2, AlertTriangle } from "lucide-vue-next";
import SettingsGeneral from "~/components/settings/SettingsGeneral.vue";
import SettingsSending from "~/components/settings/SettingsSending.vue";
import SettingsDeliverability from "~/components/settings/SettingsDeliverability.vue";
import SettingsAi from "~/components/settings/SettingsAi.vue";
import SettingsBrand from "~/components/settings/SettingsBrand.vue";
import SettingsIntegrations from "~/components/settings/SettingsIntegrations.vue";
import SettingsBackups from "~/components/settings/SettingsBackups.vue";
import SettingsSystem from "~/components/settings/SettingsSystem.vue";
import SettingsUsers from "~/components/settings/SettingsUsers.vue";

definePageMeta({ layout: "app" });
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { data, load } = useSettings();
const { can, refresh: refreshMe } = useMe();

const ALL_TABS = [
  { id: "general", icon: Globe2, comp: SettingsGeneral, anyRole: true },
  { id: "sending", icon: Send, comp: SettingsSending },
  { id: "deliverability", icon: ShieldCheck, comp: SettingsDeliverability },
  { id: "ai", icon: Sparkles, comp: SettingsAi },
  { id: "brand", icon: Palette, comp: SettingsBrand },
  { id: "integrations", icon: Plug, comp: SettingsIntegrations },
  { id: "users", icon: Users, comp: SettingsUsers, anyRole: true },
  { id: "backups", icon: DatabaseBackup, comp: SettingsBackups },
  { id: "system", icon: Cpu, comp: SettingsSystem },
];
// Editors and viewers manage their interface preferences and their own account.
const TABS = computed(() => (can("admin") ? ALL_TABS : ALL_TABS.filter((x) => (x as { anyRole?: boolean }).anyRole)));

const tab = computed({
  get: () => (TABS.value.some((x) => x.id === route.query.tab) ? String(route.query.tab) : TABS.value[0].id),
  set: (v: string) => router.replace({ query: { ...route.query, tab: v } }),
});
const current = computed(() => TABS.value.find((x) => x.id === tab.value)!.comp);
const ready = computed(() => !can("admin") || !!data.value);

onMounted(async () => {
  await refreshMe();
  if (can("admin")) await load();
});
</script>

<template>
  <div class="tm-page">
    <main class="tm-main">
      <div class="tm-header">
        <div class="tm-header-left">
          <Settings :size="30" class="tm-header-icon" />
          <div>
            <h1>{{ t("settings.title") }}</h1>
            <p class="tm-sub">{{ t("settings.subtitle") }}</p>
          </div>
        </div>
      </div>

      <div v-if="data && !data.env.encryptionKeySet" class="st-warn">
        <AlertTriangle :size="15" /> {{ t("settings.no_encryption_key") }}
      </div>

      <nav class="tm-tabs" role="tablist">
        <button v-for="x in TABS" :key="x.id" role="tab" class="tm-tab" :class="{ active: tab === x.id }" :aria-selected="tab === x.id" @click="tab = x.id">
          <component :is="x.icon" :size="14" /> {{ t(`settings.tabs.${x.id}`) }}
        </button>
      </nav>

      <div v-if="!ready" class="tm-loading"><Loader2 :size="18" class="tm-spin" /> {{ t("common.loading") }}</div>
      <component :is="current" v-else :key="tab" />
    </main>
  </div>
</template>

<style scoped>
.st-warn {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.25);
  color: #fbbf24;
}
</style>
