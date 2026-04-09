/**
 * Renders the examples pages:
 *   /examples        — categorized card grid with sticky header and search
 *   /examples/:id    — individual example detail page
 */

import type { Example } from '../../../reference/examples'
import type { ReferenceData } from '../../../common/referenceData'
import { href } from '../router'
import { hamburgerIcon, playIcon } from '../icons'
import { renderCodeBlock } from '../renderCodeBlock'
import { renderPageHeader } from './pageHeader'

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
  <button class="example-card__play" onclick="event.stopPropagation(); Playground.setPlayground(${escapeAttr(JSON.stringify(ex.name))}, ${escapeAttr(JSON.stringify(encodedExample))})" title="Load in playground">${playIcon}</button>
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

  const first = data.examples[0] ?? null
  const exampleActions = `
      <button class="chapter-header__toc-btn" onclick="Playground.toggleExampleTocMenu(event)" aria-label="Table of contents">${hamburgerIcon}</button>`

  return `
<div class="book-page">
  ${renderPageHeader({
    title: 'Examples',
    actions: exampleActions,
    prev: null,
    up: null,
    next: first ? { path: `/examples/${first.id}`, title: first.name } : null,
  })}
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

  const allExamples = data.examples
  const idx = allExamples.indexOf(ex)
  const prev = idx > 0 ? allExamples[idx - 1] : null
  const next = idx < allExamples.length - 1 ? allExamples[idx + 1] : null

  const detailActions = `
      <button class="chapter-header__toc-btn" onclick="Playground.toggleExampleTocMenu(event)" aria-label="Table of contents">${hamburgerIcon}</button>`

  return `
<div class="book-page">
  ${renderPageHeader({
    title: ex.name,
    breadcrumbs: [
      { label: 'Examples', path: '/examples' },
      { label: ex.name },
    ],
    actions: detailActions,
    prev: prev ? { path: `/examples/${prev.id}`, title: prev.name } : { path: '/examples', title: 'Back to Examples' },
    up: { path: '/examples', title: 'Back to Examples' },
    next: next ? { path: `/examples/${next.id}`, title: next.name } : null,
  })}
  <div class="book-page__content">
    <p class="example-detail__category">${escapeHtml(ex.category)}</p>
    <p class="example-detail__desc">${escapeHtml(ex.description)}</p>
    ${renderCodeBlock({ code: ex.code, contextEffectHandlers: ex.effectHandlers })}
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

