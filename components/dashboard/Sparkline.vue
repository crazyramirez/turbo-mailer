<script setup lang="ts">
import { computed } from "vue";

// Tiny inline SVG trend line for KPI cards. Expects the analytics
// *ByDay series: [{ date, label, count }].
const props = defineProps<{
  points: { count: number; label?: string }[];
  color?: string;
}>();

const W = 120;
const H = 32;
const PAD = 2;

const path = computed(() => {
  const pts = props.points;
  if (!pts || pts.length < 2) return "";
  const max = Math.max(...pts.map((p) => p.count), 1);
  const stepX = (W - PAD * 2) / (pts.length - 1);
  return pts
    .map((p, i) => {
      const x = PAD + i * stepX;
      const y = H - PAD - (p.count / max) * (H - PAD * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
});

const areaPath = computed(() =>
  path.value ? `${path.value} L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z` : "",
);

const stroke = computed(() => props.color ?? "#6366f1");
const gradId = `spark-${Math.random().toString(36).slice(2, 8)}`;
</script>

<template>
  <svg
    v-if="path"
    class="sparkline"
    :viewBox="`0 0 ${W} ${H}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="stroke" stop-opacity="0.25" />
        <stop offset="100%" :stop-color="stroke" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path :d="areaPath" :fill="`url(#${gradId})`" />
    <path
      :d="path"
      fill="none"
      :stroke="stroke"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.sparkline {
  display: block;
  width: 100%;
  height: 32px;
  margin-top: 6px;
  opacity: 0.9;
}
</style>
