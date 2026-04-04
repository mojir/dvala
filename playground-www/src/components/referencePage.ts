/**
 * Renders the reference pages:
 *   /ref              — cards for each top-level section (Core API, Modules, Effects, Playground Effects)
 *   /ref/core         — Core API listing grouped by category
 *   /ref/modules      — Modules listing grouped by module
 *   /ref/effects      — Effects listing
 *   /ref/playground    — Playground Effects listing grouped by group
 *   /ref/:linkName    — individual doc page (handled by docPage.ts)
 */

import type { ReferenceData } from '../../../common/referenceData'
import { makeLinkName } from '../../../reference'
import { playgroundEffectReference } from '../playgroundEffects'
import { href } from '../router'
import { hamburgerIcon, searchIcon } from '../icons'
import { renderPageHeader } from './pageHeader'

declare global {
  interface Window {
    referenceData?: ReferenceData
  }
}

// ─── Section definitions ───────────────────────────────────────────────────────

interface RefSection {
  id: string // URL slug: 'core', 'modules', 'effects', 'playground'
  title: string // Display name
  description: string
}

const REF_SECTIONS: RefSection[] = [
  { id: 'core', title: 'Core API', description: 'Built-in functions, operators, special expressions, and data types.' },
  { id: 'modules', title: 'Modules', description: 'Importable modules for math, vectors, matrices, and more.' },
  { id: 'effects', title: 'Effects', description: 'Standard algebraic effects for I/O, randomness, and time.' },
  { id: 'playground', title: 'Playground Effects', description: 'Effects for controlling the playground UI, editor, and execution.' },
]

// ─── Shared types and helpers ──────────────────────────────────────────────────

interface RefEntry {
  linkName: string
  title: string
  description: string
  section: string // matches RefSection.id
  group: string // sub-group within section
}

/** Build a flat ordered list of all reference entries for navigation and TOC. */
function buildRefEntries(data: ReferenceData): RefEntry[] {
  const entries: RefEntry[] = []

  // Core API — ordered by coreCategories
  const coreByCategory: Record<string, RefEntry[]> = {}
  for (const [key, ref] of Object.entries(data.api)) {
    const cat = ref.category
    if (!coreByCategory[cat]) coreByCategory[cat] = []
    coreByCategory[cat].push({
      linkName: makeLinkName(ref.category, key),
      title: ref.title,
      description: getShortDescription(ref.description),
      section: 'core',
      group: cat,
    })
  }
  for (const cat of data.coreCategories) {
    const catEntries = coreByCategory[cat]
    if (catEntries) entries.push(...catEntries)
  }

  // Modules — ordered by module name
  const moduleByName: Record<string, RefEntry[]> = {}
  for (const [key, ref] of Object.entries(data.modules)) {
    const dotIdx = key.indexOf('.')
    if (dotIdx === -1) continue
    const moduleName = key.slice(0, dotIdx)
    if (!moduleByName[moduleName]) moduleByName[moduleName] = []
    moduleByName[moduleName].push({
      linkName: key,
      title: key.slice(dotIdx + 1),
      description: getShortDescription(ref.description),
      section: 'modules',
      group: moduleName,
    })
  }
  for (const moduleName of Object.keys(moduleByName).sort()) {
    moduleByName[moduleName]!.sort((a, b) => a.title.localeCompare(b.title))
    entries.push(...moduleByName[moduleName]!)
  }

  // Effects
  for (const [key, ref] of Object.entries(data.effects)) {
    entries.push({
      linkName: makeLinkName(ref.category, key),
      title: ref.title,
      description: getShortDescription(ref.description),
      section: 'effects',
      group: 'Effects',
    })
  }

  // Playground Effects — grouped by their group field
  const pgByGroup: Record<string, RefEntry[]> = {}
  for (const [key, ref] of Object.entries(playgroundEffectReference)) {
    const groupName = getPlaygroundEffectGroup(ref.title)
    if (!pgByGroup[groupName]) pgByGroup[groupName] = []
    pgByGroup[groupName].push({
      linkName: makeLinkName(ref.category, key),
      title: ref.title,
      description: getShortDescription(ref.description),
      section: 'playground',
      group: groupName,
    })
  }
  for (const group of Object.keys(pgByGroup).sort()) {
    entries.push(...pgByGroup[group]!)
  }

  return entries
}

function getPlaygroundEffectGroup(name: string): string {
  const parts = name.split('.')
  if (parts.length >= 3) return parts[1]!.charAt(0).toUpperCase() + parts[1]!.slice(1)
  return 'Other'
}

// Cached entries
let cachedEntries: RefEntry[] | null = null
let cachedDataRef: ReferenceData | null = null

function getRefEntries(data: ReferenceData): RefEntry[] {
  if (cachedDataRef === data && cachedEntries) return cachedEntries
  cachedEntries = buildRefEntries(data)
  cachedDataRef = data
  return cachedEntries
}

// ─── Index page (cards) ────────────────────────────────────────────────────────

export function renderReferenceIndexPage(): string {
  const data = window.referenceData
  if (!data) return '<div class="book-page"><p>Loading…</p></div>'

  const entries = getRefEntries(data)

  const cards = REF_SECTIONS.map(section => {
    const count = entries.filter(e => e.section === section.id).length
    return `
<a class="ref-card" href="${href(`/ref/${section.id}`)}" onclick="event.preventDefault();Playground.navigate('/ref/${section.id}')">
  <span class="ref-card__title">${escapeHtml(section.title)}</span>
  <span class="ref-card__desc">${escapeHtml(section.description)}</span>
  <span class="ref-card__count">${count} entries</span>
</a>`
  }).join('\n')

  return `
<div class="book-page">
  ${renderPageHeader({
    title: 'Reference',
    actions: refActions(),
    prev: null,
    up: null,
    next: { path: `/ref/${REF_SECTIONS[0]!.id}`, title: REF_SECTIONS[0]!.title },
  })}
  <div class="book-page__content">
    <div class="ref-card-grid">
      ${cards}
    </div>
  </div>
</div>`.trim()
}

// ─── Section pages ─────────────────────────────────────────────────────────────

export function renderReferenceSectionPage(sectionId: string): string {
  const data = window.referenceData
  if (!data) return '<div class="book-page"><p>Loading…</p></div>'

  const section = REF_SECTIONS.find(s => s.id === sectionId)
  if (!section) return `<div class="book-page"><p>Section not found: <code>${escapeHtml(sectionId)}</code></p></div>`

  const entries = getRefEntries(data)
  const sectionEntries = entries.filter(e => e.section === sectionId)

  // Prev/next among sections
  const sectionIdx = REF_SECTIONS.indexOf(section)
  const prevSection = sectionIdx > 0 ? REF_SECTIONS[sectionIdx - 1] : null
  const nextSection = sectionIdx < REF_SECTIONS.length - 1 ? REF_SECTIONS[sectionIdx + 1] : null

  // For modules: show cards for each module instead of a flat listing
  if (sectionId === 'modules') {
    const groups = new Map<string, RefEntry[]>()
    for (const entry of sectionEntries) {
      if (!groups.has(entry.group)) groups.set(entry.group, [])
      groups.get(entry.group)!.push(entry)
    }

    const moduleCards = Array.from(groups.entries()).map(([moduleName, moduleEntries]) => {
      const moduleInfo = data.moduleCategories.find(m => m.name === moduleName)
      const desc = moduleInfo?.description ?? ''
      return `
<a class="ref-card" href="${href(`/ref/modules/${moduleName}`)}" onclick="event.preventDefault();Playground.navigate('/ref/modules/${moduleName}')">
  <span class="ref-card__title">${escapeHtml(moduleName)}</span>
  ${desc ? `<span class="ref-card__desc">${escapeHtml(desc)}</span>` : ''}
  <span class="ref-card__count">${moduleEntries.length} functions</span>
</a>`
    }).join('\n')

    return `
<div class="book-page">
  ${renderPageHeader({
    breadcrumbs: [
      { label: 'Reference', path: '/ref' },
      { label: section.title },
    ],
    actions: refActions(),
    prev: prevSection ? { path: `/ref/${prevSection.id}`, title: prevSection.title } : { path: '/ref', title: 'Back to Reference' },
    up: { path: '/ref', title: 'Back to Reference' },
    next: nextSection ? { path: `/ref/${nextSection.id}`, title: nextSection.title } : null,
  })}
  <div class="book-page__content">
    <div class="ref-card-grid">
      ${moduleCards}
    </div>
  </div>
</div>`.trim()
  }

  // Default: grouped listing for other sections
  const groups = new Map<string, RefEntry[]>()
  for (const entry of sectionEntries) {
    if (!groups.has(entry.group)) groups.set(entry.group, [])
    groups.get(entry.group)!.push(entry)
  }

  const groupsHtml = Array.from(groups.entries()).map(([groupName, groupEntries]) => `
    <div class="ref-index__group">
      <h3 class="ref-index__group-title">${escapeHtml(groupName)}</h3>
      <ul class="ref-index__list">
        ${groupEntries.map(e => `
        <li class="ref-index__item">
          <a class="ref-index__link" href="${href(`/ref/${e.linkName}`)}" onclick="event.preventDefault();Playground.navigate('/ref/${e.linkName}')">${escapeHtml(e.title)}</a>
          <span class="ref-index__desc">${escapeHtml(e.description)}</span>
        </li>`).join('')}
      </ul>
    </div>`).join('\n')

  return `
<div class="book-page">
  ${renderPageHeader({
    breadcrumbs: [
      { label: 'Reference', path: '/ref' },
      { label: section.title },
    ],
    actions: refActions(),
    prev: prevSection ? { path: `/ref/${prevSection.id}`, title: prevSection.title } : { path: '/ref', title: 'Back to Reference' },
    up: { path: '/ref', title: 'Back to Reference' },
    next: nextSection ? { path: `/ref/${nextSection.id}`, title: nextSection.title } : null,
  })}
  <div class="book-page__content">
    ${groupsHtml}
  </div>
</div>`.trim()
}

// ─── Module detail page ────────────────────────────────────────────────────────

export function renderReferenceModulePage(moduleName: string): string {
  const data = window.referenceData
  if (!data) return '<div class="book-page"><p>Loading…</p></div>'

  const entries = getRefEntries(data)
  const moduleEntries = entries.filter(e => e.section === 'modules' && e.group === moduleName)
  if (moduleEntries.length === 0) {
    return `<div class="book-page"><p>Module not found: <code>${escapeHtml(moduleName)}</code></p></div>`
  }

  // Prev/next among modules (alphabetical)
  const allModules = [...new Set(entries.filter(e => e.section === 'modules').map(e => e.group))].sort()
  const idx = allModules.indexOf(moduleName)
  const prevModule = idx > 0 ? allModules[idx - 1] : null
  const nextModule = idx < allModules.length - 1 ? allModules[idx + 1] : null

  const moduleInfo = data.moduleCategories.find(m => m.name === moduleName)
  const descHtml = moduleInfo?.description
    ? `<p class="ref-module__desc">${escapeHtml(moduleInfo.description)}</p>`
    : ''

  const listHtml = `
    ${descHtml}
    <ul class="ref-index__list">
      ${moduleEntries.map(e => `
      <li class="ref-index__item">
        <a class="ref-index__link" href="${href(`/ref/${e.linkName}`)}" onclick="event.preventDefault();Playground.navigate('/ref/${e.linkName}')">${escapeHtml(e.title)}</a>
        <span class="ref-index__desc">${escapeHtml(e.description)}</span>
      </li>`).join('')}
    </ul>`

  return `
<div class="book-page">
  ${renderPageHeader({
    breadcrumbs: [
      { label: 'Reference', path: '/ref' },
      { label: 'Modules', path: '/ref/modules' },
      { label: moduleName },
    ],
    actions: refActions(),
    prev: prevModule ? { path: `/ref/modules/${prevModule}`, title: prevModule } : { path: '/ref/modules', title: 'Back to Modules' },
    up: { path: '/ref/modules', title: 'Back to Modules' },
    next: nextModule ? { path: `/ref/modules/${nextModule}`, title: nextModule } : null,
  })}
  <div class="book-page__content">
    ${listHtml}
  </div>
</div>`.trim()
}

// ─── Shared header actions ─────────────────────────────────────────────────────

function refActions(): string {
  return `
      <button class="chapter-header__toc-btn" onclick="Playground.toggleRefTocMenu(event)" aria-label="Table of contents">${hamburgerIcon}</button>
      <button class="chapter-header__toc-btn" onclick="Playground.toggleRefSearch(event)" aria-label="Search reference">${searchIcon}</button>`
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

// Exported for use by docPage and scripts.ts
export { getRefEntries, refActions, REF_SECTIONS }
export type { RefEntry }
