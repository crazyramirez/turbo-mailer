<script setup lang="ts">
import { UsersRound, Filter, FileInput, Braces } from "lucide-vue-next";
import AudienceSegments from "~/components/audience/AudienceSegments.vue";
import AudienceForms from "~/components/audience/AudienceForms.vue";
import AudienceFields from "~/components/audience/AudienceFields.vue";

definePageMeta({ layout: "app" });
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { refresh: refreshMe, me } = useMe();

const TABS = [
  { id: "segments", icon: Filter, comp: AudienceSegments },
  { id: "forms", icon: FileInput, comp: AudienceForms },
  { id: "fields", icon: Braces, comp: AudienceFields },
];
const tab = computed({
  get: () => (TABS.some((x) => x.id === route.query.tab) ? String(route.query.tab) : "segments"),
  set: (v: string) => router.replace({ query: { ...route.query, tab: v } }),
});
const current = computed(() => TABS.find((x) => x.id === tab.value)!.comp);

onMounted(() => {
  if (!me.value) refreshMe();
});
</script>

<template>
  <div class="tm-page">
    <main class="tm-main">
      <div class="tm-header">
        <div class="tm-header-left">
          <UsersRound :size="30" class="tm-header-icon" />
          <div>
            <h1>{{ t("audience.title") }}</h1>
            <p class="tm-sub">{{ t("audience.subtitle") }}</p>
          </div>
        </div>
      </div>
      <nav class="tm-tabs" role="tablist">
        <button v-for="x in TABS" :key="x.id" role="tab" class="tm-tab" :class="{ active: tab === x.id }" :aria-selected="tab === x.id" @click="tab = x.id">
          <component :is="x.icon" :size="14" /> {{ t(`audience.tabs.${x.id}`) }}
        </button>
      </nav>
      <component :is="current" :key="tab" />
    </main>
  </div>
</template>
