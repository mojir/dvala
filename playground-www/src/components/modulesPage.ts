/**
 * Renders the modules overview page (/modules).
 * Groups module functions by module name and links to doc pages.
 */

import type { ReferenceData } from '../../../common/referenceData'
import { href } from '../router'

declare global {
  interface Window {
    referenceData?: ReferenceData
  }
}

export function renderModulesPage(): string {
  const data = window.referenceData
  if (!data) return '<div class="content-page"><div class="content-page__body">Loading…</div></div>'

  const byModule: Record<string, { key: string; fn: string; description: string }[]> = {}

  for (const [key, ref] of Object.entries(data.modules)) {
    const dotIdx = key.indexOf('.')
    if (dotIdx === -1) continue
    const moduleName = key.slice(0, dotIdx)
    if (!byModule[moduleName]) byModule[moduleName] = []
    const shortDesc = getShortDescription(ref.description)
    byModule[moduleName].push({ key, fn: key.slice(dotIdx + 1), description: shortDesc })
  }

  const sections = Object.entries(byModule).sort(([a], [b]) => a.localeCompare(b)).map(([moduleName, fns]) => {
    fns.sort((a, b) => a.fn.localeCompare(b.fn))
    return `
<section class="content-page__group">
  <h2 class="content-page__group-title">${escapeHtml(moduleName)}</h2>
  <ul class="content-page__entry-list">
    ${fns.map(e => `
    <li class="content-page__entry">
      <a class="content-page__entry-link" href="${href(`/ref/${e.key}`)}" onclick="event.preventDefault();Playground.navigate('/ref/${e.key}')">${escapeHtml(e.fn)}</a>
      ${e.description ? `<span class="content-page__entry-desc">${escapeHtml(e.description)}</span>` : ''}
    </li>`).join('')}
  </ul>
</section>`
  }).join('\n')

  return `
<div class="content-page">
  <div class="content-page__header">
    <h1>Modules Reference</h1>
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
