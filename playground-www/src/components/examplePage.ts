/**
 * Renders the examples pages:
 *   /examples        — categorized card grid with sticky header and search
 *   /examples/:id    — individual example detail page
 */

import type { Example } from '../../../reference/examples'
import type { ReferenceData } from '../../../common/referenceData'
import { href } from '../router'
import { searchIcon } from '../icons'
import { tokenizeToHtml } from '../SyntaxOverlay'

declare global {
  interface Window {
    referenceData?: ReferenceData
  }
}

// Category display order — categories not listed here appear at the end alphabetically
const categoryOrder = ['Basics', 'Effects & Context', 'Macros', 'Projects', 'Test Fixtures']

interface CategoryGroup {
  name: string
  examples: Example[]
}

function groupByCategory(examples: Example[]): CategoryGroup[] {
  const map = new Map<string, Example[]>()
  for (const ex of examples) {
    const cat = ex.category || 'Other'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(ex)
  }
  // Sort by the predefined order, unknown categories go to the end
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      const ia = categoryOrder.indexOf(a)
      const ib = categoryOrder.indexOf(b)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.localeCompare(b)
    })
    .map(([name, entries]) => ({ name, examples: entries }))
}

// ─── Index page ────────────────────────────────────────────────────────────────

export function renderExampleIndexPage(): string {
  const data = window.referenceData
  if (!data) return '<div class="content-page"><div class="content-page__body">Loading…</div></div>'

  const categories = groupByCategory(data.examples)

  const sections = categories.map(cat => {
    const cards = cat.examples.map(ex => {
      const encodedExample = btoa(encodeURIComponent(JSON.stringify(ex)))
      return `
<div class="example-card" data-name="${escapeAttr(ex.name)}" data-desc="${escapeAttr(ex.description)}" data-category="${escapeAttr(cat.name)}">
  <a class="example-card__link" href="${href(`/examples/${ex.id}`)}" onclick="event.preventDefault();Playground.navigate('/examples/${ex.id}')">
    <span class="example-card__title">${escapeHtml(ex.name)}</span>
    <span class="example-card__desc">${escapeHtml(ex.description)}</span>
  </a>
  <button class="example-card__cta" onclick="event.stopPropagation(); Playground.setPlayground(${escapeAttr(JSON.stringify(ex.name))}, ${escapeAttr(JSON.stringify(encodedExample))})">
    Load in playground
  </button>
</div>`
    }).join('\n')

    return `
<section class="example-category" data-category="${escapeAttr(cat.name)}">
  <h2 class="example-category__title">${escapeHtml(cat.name)}</h2>
  <div class="example-category__grid">
    ${cards}
  </div>
</section>`
  }).join('\n')

  return `
<div class="book-page">
  <div class="chapter-header">
    <span class="chapter-header__title">Examples</span>
    <div class="chapter-header__actions">
      <button class="chapter-header__toc-btn" onclick="Playground.toggleExampleSearch(event)" aria-label="Search examples">${searchIcon}</button>
    </div>
  </div>
  <div class="book-page__content">
    ${sections}
  </div>
</div>`.trim()
}

// ─── Detail page ───────────────────────────────────────────────────────────────

export function renderExampleDetailPage(id: string): string {
  const data = window.referenceData
  if (!data) return '<div class="content-page"><div class="content-page__body">Loading…</div></div>'

  const ex = data.examples.find(e => e.id === id)
  if (!ex) {
    return `<div class="book-page"><p>Example not found: <code>${escapeHtml(id)}</code></p></div>`
  }

  const encodedExample = btoa(encodeURIComponent(JSON.stringify(ex)))

  const backBtn = `<a class="chapter-header__nav-btn" href="${href('/examples')}" onclick="event.preventDefault();Playground.navigate('/examples')" title="Back to examples">←</a>`

  return `
<div class="book-page">
  <div class="chapter-header">
    ${backBtn}
    <span class="chapter-header__title">${escapeHtml(ex.name)}</span>
    <div class="chapter-header__actions">
      <button class="chapter-header__toc-btn example-header__load-btn" onclick="Playground.setPlayground(${escapeAttr(JSON.stringify(ex.name))}, ${escapeAttr(JSON.stringify(encodedExample))})">Load in playground</button>
      <button class="chapter-header__toc-btn" onclick="Playground.toggleExampleSearch(event)" aria-label="Search examples">${searchIcon}</button>
    </div>
  </div>
  <div class="book-page__content">
    <p class="example-detail__category">${escapeHtml(ex.category)}</p>
    <p class="example-detail__desc">${escapeHtml(ex.description)}</p>
    <pre class="example-detail__code"><code>${tokenizeToHtml(ex.code)}</code></pre>
  </div>
</div>`.trim()
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
