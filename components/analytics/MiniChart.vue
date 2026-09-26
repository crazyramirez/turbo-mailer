<script setup lang="ts">
import { Chart, BarController, BarElement, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip } from "chart.js";

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip);

const props = defineProps<{ kind: "bar" | "line"; labels: string[]; values: number[]; label?: string }>();
const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

onMounted(() => {
  if (!canvas.value) return;
  chart = new Chart(canvas.value, {
    type: props.kind,
    data: {
      labels: props.labels,
      datasets: [{
        label: props.label ?? "",
        data: props.values,
        backgroundColor: "rgba(129,140,248,0.55)",
        borderColor: "#818cf8",
        borderWidth: 2,
        tension: 0.35,
        borderRadius: 6,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "rgba(255,255,255,0.5)", font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: "rgba(255,255,255,0.5)", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.06)" } },
      },
    },
  });
});
onUnmounted(() => chart?.destroy());
</script>

<template>
  <canvas ref="canvas"></canvas>
</template>
