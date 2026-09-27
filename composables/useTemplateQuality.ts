import { computed, ref } from 'vue'
import { useEditorState } from '~/composables/useEditorState'
import { useIframeEngine } from '~/composables/useIframeEngine'
import { useBlockEditor } from '~/composables/useBlockEditor'
import { QUALITY_WIDTHS, inspectEmailContent, inspectEmailLayout, mergeQualityIssues, prepareQualityDocument, qualityBlocks, type QualityIssue, type QualityReport } from '~/utils/emailQuality'

const report = ref<QualityReport | null>(null)
const running = ref(false)
const failed = ref(false)
const checkedHtml = ref('')
let reviewGeneration = 0
let reviewFrame: HTMLIFrameElement | null = null

export function useTemplateQuality() {
  const state = useEditorState()
  const stale = computed(() => !!report.value && state.htmlContent.value !== checkedHtml.value)

  async function review() {
    if (running.value) return
    const generation = ++reviewGeneration
    failed.value = false
    if (!state.iframeRef.value?.contentDocument) { failed.value = true; return }
    try { useIframeEngine().updateHtml() }
    catch { failed.value = true; return }
    const html = state.htmlContent.value
    if (!html) return
    running.value = true
    failed.value = false
    const frame = document.createElement('iframe')
    reviewFrame = frame
    frame.title = 'Template layout measurement'
    frame.setAttribute('sandbox', 'allow-same-origin')
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    frame.style.cssText = 'position:fixed;left:-12000px;top:0;height:1000px;border:0;visibility:hidden;pointer-events:none;'
    frame.style.width = `${QUALITY_WIDTHS[0]}px`
    try {
      const loaded = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => frame.contentDocument?.body ? resolve() : reject(new Error('Preview timed out')), 6000)
        frame.onload = () => { clearTimeout(timer); resolve() }
      })
      frame.srcdoc = prepareQualityDocument(html)
      document.body.appendChild(frame)
      await loaded
      if (generation !== reviewGeneration) return
      const doc = frame.contentDocument
      if (!doc) throw new Error('Preview unavailable')
      const issues = inspectEmailContent(doc)
      for (const width of QUALITY_WIDTHS) {
        frame.style.width = `${width}px`
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        if (generation !== reviewGeneration) return
        issues.push(...inspectEmailLayout(doc, width))
      }
      report.value = { issues: mergeQualityIssues(issues), widths: [...QUALITY_WIDTHS], blocks: qualityBlocks(doc).length, bytes: new TextEncoder().encode(html).length }
      checkedHtml.value = html
    } catch {
      if (generation === reviewGeneration) failed.value = true
    } finally {
      frame.remove()
      if (reviewFrame === frame) reviewFrame = null
      if (generation === reviewGeneration) running.value = false
    }
  }

  function focusIssue(issue: QualityIssue) {
    if (stale.value) return
    const doc = state.iframeRef.value?.contentDocument
    if (!doc || issue.blockIndex < 0) return
    const block = qualityBlocks(doc)[issue.blockIndex]
    if (block) useBlockEditor().selectElement(block)
  }

  function resetReview() {
    reviewGeneration++
    reviewFrame?.remove()
    reviewFrame = null
    running.value = false
    report.value = null
    checkedHtml.value = ''
    failed.value = false
  }
  return { report, running, failed, stale, review, focusIssue, resetReview }
}
