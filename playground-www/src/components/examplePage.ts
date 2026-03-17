/**
 * Renders the examples page (/examples).
 * Lists all example programs from window.referenceData.examples.
 */

import type { ReferenceData } from '../../../common/referenceData'
import { tokenizeToHtml } from '../SyntaxOverlay'
import { getPageHeader } from '../utils'

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
  <details class="example-page__details">
    <summary class="example-page__summary">
      <div class="example-page__summary-row">
        <span class="example-page__entry-title">${escapeHtml(ex.name)}</span>
        <button class="example-page__entry-btn" onclick="event.stopPropagation(); Playground.setPlayground(${escapeHtml(JSON.stringify(ex.name))}, ${escapeHtml(JSON.stringify(encodedExample))})">
          Load in playground
        </button>
      </div>
      ${ex.description ? `<p class="example-page__entry-desc">${escapeHtml(ex.description)}</p>` : ''}
    </summary>
    <pre class="example-page__code"><code>${tokenizeToHtml(ex.code)}</code></pre>
  </details>
</li>`
  }).join('\n')

  return `
<div class="content-page">
  ${getPageHeader()}
  <h1 class="content-page__title">Examples</h1>
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
