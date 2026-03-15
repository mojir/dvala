/**
 * Renders the examples page (/examples).
 * Lists all example programs from window.referenceData.examples.
 */

import type { ReferenceData } from '../../../common/referenceData'

declare global {
  interface Window {
    referenceData?: ReferenceData
  }
}

export function renderExamplePage(): string {
  const data = window.referenceData
  if (!data) return '<div class="content-page"><div class="content-page__body">Loading…</div></div>'

  const entries = data.examples.map(ex => {
    const encodedExample = btoa(encodeURIComponent(JSON.stringify(ex)))
    return `
<li class="content-page__entry example-page__entry">
  <div class="example-page__entry-header">
    <span class="example-page__entry-title">${escapeHtml(ex.name)}</span>
    <button class="example-page__entry-btn" onclick="Playground.setPlayground(${JSON.stringify(ex.name)}, ${JSON.stringify(encodedExample)})">
      Load in playground
    </button>
  </div>
  ${ex.description ? `<p class="example-page__entry-desc">${escapeHtml(ex.description)}</p>` : ''}
  <pre class="example-page__code"><code>${escapeHtml(ex.code)}</code></pre>
</li>`
  }).join('\n')

  return `
<div class="content-page">
  <div class="content-page__header">
    <h1>Examples</h1>
  </div>
  <div class="content-page__body">
    <ul class="content-page__entry-list">
      ${entries}
    </ul>
  </div>
</div>`.trim()
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
