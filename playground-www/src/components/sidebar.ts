/**
 * Renders sidebar navigation from window.referenceData.
 * Core section: grouped by coreCategories, links to /ref/<linkName>.
 * Modules section: grouped by module name, links to /ref/<module>.<fn>.
 */

import type { ReferenceData } from '../../../common/referenceData'
import { makeLinkName } from '../../../reference'
import { href } from '../router'

declare global {
  interface Window {
    referenceData?: ReferenceData
  }
}

export function renderSidebar(currentPath: string): string {
  const data = window.referenceData
  if (!data) return '<nav class="sidebar"><div class="sidebar__nav">Loading…</div></nav>'

  const coreLinks = renderCoreSections(data, currentPath)
  const moduleLinks = renderModuleSections(data, currentPath)

  return `
<nav class="sidebar">
  <div class="sidebar__logo">
    <a href="${href('/')}">
      <img src="images/dvala-logo.webp" alt="Dvala" width="800" height="232">
    </a>
  </div>

  <button class="sidebar__search-btn" onclick="Playground.Search.openSearch()">
    <span>🔍 Search</span>
    <span class="sidebar__search-kbd">F3</span>
  </button>

  <ul class="sidebar__nav">
    ${renderNavItem('/', 'Home', currentPath)}
    ${renderNavItem('/tutorials', 'Tutorials', currentPath)}
    ${renderNavItem('/examples', 'Examples', currentPath)}
    ${renderNavItem('/saved', 'Programs', currentPath)}
    ${renderNavItem('/snapshots', 'Snapshots', currentPath)}
    ${renderNavItem('/settings', 'Settings', currentPath)}
  </ul>

  <div class="sidebar__section">
    <div class="sidebar__section-header" data-section="core" onclick="Playground.toggleSidebarSection('core')">
      <span>Core API</span>
      <span class="sidebar__section-chevron" id="sidebar-chevron-core">▶</span>
    </div>
    <div class="sidebar__section-content" id="sidebar-content-core">
      ${coreLinks}
    </div>
  </div>

  <div class="sidebar__section">
    <div class="sidebar__section-header" data-section="modules" onclick="Playground.toggleSidebarSection('modules')">
      <span>Modules</span>
      <span class="sidebar__section-chevron" id="sidebar-chevron-modules">▶</span>
    </div>
    <div class="sidebar__section-content" id="sidebar-content-modules">
      ${moduleLinks}
    </div>
  </div>
</nav>`.trim()
}

function renderNavItem(path: string, label: string, currentPath: string): string {
  const isActive = currentPath === path || (path !== '/' && currentPath.startsWith(path))
  const activeClass = isActive ? ' sidebar__nav-item--active' : ''
  return `<li class="sidebar__nav-item${activeClass}"><a class="sidebar__link" href="${href(path)}" onclick="event.preventDefault();Playground.navigate('${path}')">${label}</a></li>`
}

function renderCoreSections(data: ReferenceData, currentPath: string): string {
  const byCategory: Record<string, { linkName: string; title: string }[]> = {}

  for (const [key, ref] of Object.entries(data.api)) {
    const cat = ref.category
    if (!byCategory[cat]) byCategory[cat] = []
    // linkName comes from SearchEntry; derive it the same way: category-title
    const linkName = makeLinkName(ref.category, key)
    byCategory[cat].push({ linkName, title: ref.title })
  }

  const sections: string[] = []
  for (const cat of data.coreCategories) {
    const entries = byCategory[cat]
    if (!entries || entries.length === 0) continue
    const sanitized = cat.replace(/\s+/g, '-')
    sections.push(`
<div class="sidebar__group" id="sidebar-group-core-${sanitized}">
  <div class="sidebar__group-header">${escapeHtml(cat)}</div>
  ${entries.map(e => renderRefLink(e.linkName, e.title, currentPath)).join('\n  ')}
</div>`)
  }
  return sections.join('\n')
}

function renderModuleSections(data: ReferenceData, currentPath: string): string {
  const byModule: Record<string, { linkName: string; fn: string }[]> = {}

  for (const key of Object.keys(data.modules)) {
    const dotIdx = key.indexOf('.')
    if (dotIdx === -1) continue
    const moduleName = key.slice(0, dotIdx)
    if (!byModule[moduleName]) byModule[moduleName] = []
    byModule[moduleName].push({ linkName: key, fn: key.slice(dotIdx + 1) })
  }

  const sections: string[] = []
  for (const [moduleName, fns] of Object.entries(byModule).sort(([a], [b]) => a.localeCompare(b))) {
    fns.sort((a, b) => a.fn.localeCompare(b.fn))
    sections.push(`
<div class="sidebar__group" id="sidebar-group-module-${moduleName}">
  <div class="sidebar__group-header">${escapeHtml(moduleName)}</div>
  ${fns.map(e => renderRefLink(e.linkName, e.fn, currentPath)).join('\n  ')}
</div>`)
  }
  return sections.join('\n')
}

function renderRefLink(linkName: string, title: string, currentPath: string): string {
  const refPath = `/ref/${linkName}`
  const isActive = currentPath === refPath
  const activeClass = isActive ? ' sidebar__link--active' : ''
  return `<a class="sidebar__link${activeClass}" href="${href(refPath)}" id="sidebar-link-${linkName}">${escapeHtml(title)}</a>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
