<script setup lang="ts">
import { CheckCircle2, AlertTriangle, ArrowUpRight, ScanLine, LoaderCircle } from 'lucide-vue-next'
import { useTemplateQuality } from '~/composables/useTemplateQuality'
const { t } = useI18n()
const { report, running, failed, stale, review, focusIssue } = useTemplateQuality()
</script>

<template>
  <section class="quality-panel">
    <div class="quality-heading"><ScanLine :size="21" /><h3>{{ t('editor.quality_title') }}</h3></div>
    <p class="quality-intro">{{ t('editor.quality_intro') }}</p>
    <div class="quality-widths"><span v-for="width in [320, 375, 600, 820]" :key="width">{{ width }} px</span></div>
    <button class="quality-run" :disabled="running" @click="review">
      <LoaderCircle v-if="running" :size="16" class="quality-spin" /><ScanLine v-else :size="16" />
      {{ t(running ? 'editor.quality_running' : 'editor.quality_run') }}
    </button>
    <p v-if="failed" class="quality-warning" role="alert">{{ t('editor.quality_failed') }}</p>
    <p v-if="stale" class="quality-warning" role="status">{{ t('editor.quality_stale') }}</p>
    <div v-if="report" class="quality-report" aria-live="polite">
      <p class="quality-summary">{{ t('editor.quality_summary', { blocks: report.blocks, kb: (report.bytes / 1024).toFixed(1) }) }}</p>
      <div v-if="!report.issues.length" class="quality-success"><CheckCircle2 :size="20" /><span>{{ t('editor.quality_clear') }}</span></div>
      <div v-for="issue in report.issues" :key="`${issue.blockIndex}:${issue.code}`" class="quality-issue" :class="issue.severity">
        <div class="quality-issue-title"><AlertTriangle :size="15" /><strong>{{ t(`editor.quality_${issue.code}`) }}</strong></div>
        <p>{{ t(`editor.quality_${issue.code}_help`) }}</p>
        <span v-if="issue.widths.length" class="quality-sizes">{{ issue.widths.join(' · ') }} px</span>
        <button v-if="issue.blockIndex >= 0" :disabled="stale" @click="focusIssue(issue)">
          {{ t('editor.quality_go', { number: issue.blockIndex + 1 }) }}<span v-if="issue.blockLabel"> · {{ issue.blockLabel }}</span><ArrowUpRight :size="13" />
        </button>
      </div>
    </div>
    <p class="quality-note">{{ t('editor.quality_scope') }}</p>
  </section>
</template>

<style scoped>
.quality-panel { padding: 18px 16px; color: #cbd5e1; }
.quality-heading { display: flex; align-items: center; gap: 9px; color: #c7d2fe; }
.quality-heading h3 { margin: 0; font-size: 15px; }
.quality-intro, .quality-note, .quality-summary, .quality-warning { font-size: 12px; line-height: 1.65; }
.quality-intro { margin: 12px 0; color: #a8b3c7; }
.quality-widths { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 16px; }
.quality-widths span { background: #ffffff09; border: 1px solid #ffffff12; border-radius: 5px; padding: 4px 6px; font-size: 10px; }
.quality-run { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 11px; border: 1px solid #818cf85c; border-radius: 9px; background: #6366f128; color: #e0e7ff; cursor: pointer; font-weight: 600; }
button:disabled { opacity: .5; cursor: default; }
.quality-warning { color: #fcd34d; }
.quality-summary { color: #94a3b8; margin: 20px 0 12px; }
.quality-success { display: flex; gap: 8px; padding: 12px; background: #34d3990d; border-radius: 8px; color: #6ee7b7; font-size: 12px; line-height: 1.5; }
.quality-issue { margin: 10px 0; padding: 12px; border: 1px solid #fbbf2426; border-radius: 9px; background: #fbbf2405; }
.quality-issue.error { border-color: #f8717138; }
.quality-issue-title { display: flex; gap: 7px; align-items: center; color: #fde68a; font-size: 12px; }
.quality-issue.error .quality-issue-title { color: #fca5a5; }
.quality-issue p { font-size: 12px; line-height: 1.6; margin: 8px 0; }
.quality-sizes { display: block; color: #94a3b8; font-size: 10px; margin-bottom: 8px; }
.quality-issue button { display: flex; gap: 3px; align-items: center; text-align: left; border: 0; padding: 0; color: #a5b4fc; background: none; cursor: pointer; font-size: 11px; max-width: 100%; }
.quality-issue button span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.quality-note { color: #94a3b8; margin-top: 22px; }
.quality-spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
