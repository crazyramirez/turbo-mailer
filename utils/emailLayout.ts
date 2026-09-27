/** Add durable styling hooks before editor-only data attributes are stripped for sending. */
export function annotateEmailLayout(root: Document | Element): void {
  const blocks = [...root.querySelectorAll('[data-type], .editable-block')]
  if ('matches' in root && root.matches('[data-type], .editable-block')) blocks.unshift(root)
  blocks.forEach(block => block.classList.add('email-block'))
  for (const block of blocks) {
    const layout = ['grid', 'pricing', 'product', 'signature', 'metrics'].find(name => block.classList.contains(`${name}-block`))
    if (!layout) continue
    block.querySelectorAll('table:not([data-tm-btn])').forEach(table => {
      table.classList.add('email-layout-table', `email-${layout}-table`)
      if (layout !== 'signature') table.classList.add('email-stack-table')
    })
  }
  for (const field of ['title', 'subtitle', 'button', 'code']) {
    root.querySelectorAll(`[data-toggle="${field}"]`).forEach(element => element.classList.add(`email-${field}`))
  }
}

const rows = (table: string) => `${table} > tbody > tr, ${table} > tr`
const cells = (table: string, cell = '') => `${table} > tbody > tr > td${cell}, ${table} > tr > td${cell}`

/** Shared by the live canvas and the exported email; never rely on editor-only CSS. */
export const EDITOR_RESPONSIVE_CSS = `
    .main-card { box-sizing: border-box; }
    .main-card .email-block { box-sizing: border-box; word-wrap: break-word; overflow-wrap: anywhere; }
    .main-card img { max-width: 100%; }
    .main-card table { max-width: 100%; }
    .email-layout-table { width: 100%; table-layout: fixed; }
    ${cells('.email-layout-table')} { box-sizing: border-box; }
    ${cells('.email-signature-table', ':first-child:not(:last-child)')} { width: 84px; }
    .main-card .email-button { max-width: 100%; box-sizing: border-box; white-space: normal; word-wrap: break-word; overflow-wrap: anywhere; line-height: 1.4; text-align: center; }
    .main-card .buttons-row .email-button { max-width: calc(100% - 12px); }
    .main-card table[data-tm-btn] .email-button { max-width: 100%; padding: 0 !important; }
    .main-card .email-code { max-width: 100%; box-sizing: border-box; white-space: normal; }
    .main-card .main-img-responsive { height: var(--main-img-h, auto) !important; object-fit: cover; }
    @media only screen and (max-width: 600px) {
      .main-card > .email-block { padding-left: 20px !important; padding-right: 20px !important; }
      .main-card .hero-block { padding-top: 48px !important; padding-bottom: 48px !important; }
      .main-card .header-block .email-title { font-size: 30px !important; line-height: 1.2 !important; }
      .main-card .hero-block .email-title { font-size: 34px !important; line-height: 1.15 !important; }
      .main-card .hero-block .email-subtitle { font-size: 17px !important; }
      .main-card .email-button { min-width: 0 !important; padding-left: 20px !important; padding-right: 20px !important; }
      ${cells('.main-card table[data-tm-btn]')} { padding-left: 20px !important; padding-right: 20px !important; }
      ${rows('.email-stack-table')}, .main-card .ai-layout-row { display: block !important; width: 100% !important; }
      ${rows('.email-grid-table')}, .main-card .ai-layout-pairs { font-size: 0 !important; }
      ${cells('.email-stack-table', '[valign]:not(.grid-quad-td)')}, ${cells('.email-pricing-table', ':only-child')}, .main-card .ai-layout-stack {
        display: block !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; padding-bottom: 16px !important;
      }
      .grid-quad-td, .main-card .ai-layout-half { display: inline-block !important; width: 50% !important; box-sizing: border-box !important; vertical-align: top !important; padding: 6px !important; }
      ${cells('.email-grid-table', ':not([valign])')}, ${cells('.email-pricing-table', '[width="3.5%"]')}, ${cells('.email-pricing-table', '[width="4%"]')}, ${cells('.email-metrics-table', ':not(.metric-td)')}, .main-card .ai-layout-spacer { display: none !important; }
      ${cells('.email-product-table')} { padding: 16px !important; }
      ${cells('.email-product-table', ' + td')} { padding-top: 0 !important; }
      .email-pricing-table { width: 100% !important; }
      ${cells('.email-pricing-table', '[valign]')} { padding-top: 12px !important; }
      .main-card .coupon-block > div { padding: 24px 18px !important; }
      .main-card .coupon-block .email-code { font-size: 18px !important; letter-spacing: 2px !important; padding: 12px 16px !important; }
    }
    @media only screen and (max-width: 360px) {
      .grid-quad-td, .main-card .ai-layout-half { display: block !important; width: 100% !important; }
    }`
