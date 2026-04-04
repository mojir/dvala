/**
 * Renders sidebar navigation.
 */

import { href } from '../router'

export function renderSidebar(currentPath: string): string {
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
    ${renderNavItem('/book', 'The Book', currentPath)}
    ${renderNavItem('/examples', 'Examples', currentPath)}
    ${renderNavItem('/ref', 'Reference', currentPath)}
    ${renderNavItem('/saved', 'Programs', currentPath)}
    ${renderNavItem('/snapshots', 'Snapshots', currentPath)}
    ${renderNavItem('/settings', 'Settings', currentPath)}
  </ul>
</nav>`.trim()
}

function renderNavItem(path: string, label: string, currentPath: string): string {
  const isActive = currentPath === path || (path !== '/' && currentPath.startsWith(path))
  const activeClass = isActive ? ' sidebar__nav-item--active' : ''
  return `<li class="sidebar__nav-item${activeClass}"><a class="sidebar__link" href="${href(path)}" onclick="event.preventDefault();Playground.navigate('${path}')">${label}</a></li>`
}
