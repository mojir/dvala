/**
 * Renders the core functions overview page (/core).
 * Groups entries by category and links to their doc pages.
 */

import type { ReferenceData } from '../../../common/referenceData'
import { makeLinkName } from '../../../reference'
import { href } from '../router'

declare global {
  interface Window {
    referenceData?: ReferenceData
  }
}

export function renderCorePage(): string {
  const data = window.referenceData
  if (!data) return '<div class="content-page"><div class="content-page__body">Loading…</div></div>'

  const byCategory: Record<string, { key: string; title: string; description: string; linkName: string }[]> = {}

  for (const [key, ref] of Object.entries(data.api)) {
    const cat = ref.category
    if (!byCategory[cat]) byCategory[cat] = []
    const shortDesc = getShortDescription(ref.description)
    const linkName = makeLinkName(ref.category, key)
    byCategory[cat].push({ key, title: key, description: shortDesc, linkName })
  }

  const sections = data.coreCategories.map(cat => {
    const entries = byCategory[cat]
    if (!entries || entries.length === 0) return ''
    return `
<section class="content-page__group">
  <h2 class="content-page__group-title">${escapeHtml(cat)}</h2>
  <ul class="content-page__entry-list">
    ${entries.map(e => `
    <li class="content-page__entry">
      <a class="content-page__entry-link" href="${href(`/ref/${e.linkName}`)}" onclick="event.preventDefault();Playground.navigate('/ref/${e.linkName}')">${escapeHtml(e.title)}</a>
      ${e.description ? `<span class="content-page__entry-desc">${escapeHtml(e.description)}</span>` : ''}
    </li>`).join('')}
  </ul>
</section>`
  }).filter(Boolean).join('\n')

  return `
<div class="content-page">
  <div class="content-page__header">
    <h1>Core API Reference</h1>
  </div>
  <div class="content-page__body">
    ${sections}
  </div>
</div>`.trim()
}

function getShortDescription(description: string): string {
  const match = /(.*?) {2}\n|\n\n|$/.exec(description)
  return (match?.[1] ?? description)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .slice(0, 120)
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
