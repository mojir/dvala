/**
 * Reusable sticky page header with title (or breadcrumbs), action buttons, and ← ↑ → navigation.
 */

import { href } from '../router'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A navigation link (active) or null (disabled). */
interface NavLink {
  path: string
  title: string
}

/** A breadcrumb segment — either a link or plain text (last segment). */
export interface Breadcrumb {
  label: string
  path?: string // If provided, renders as a link; otherwise plain text
}

interface PageHeaderOptions {
  /** Page title shown in the header. Ignored if `breadcrumbs` is provided. */
  title?: string
  /** Breadcrumb path rendered instead of title. Last segment is shown as plain text. */
  breadcrumbs?: Breadcrumb[]
  /** Extra HTML inserted into the actions area (before the nav group). */
  actions?: string
  /** Previous item link, or null for disabled. */
  prev: NavLink | null
  /** Up/parent link, or null for disabled. */
  up: NavLink | null
  /** Next item link, or null for disabled. */
  next: NavLink | null
}

function navBtn(link: NavLink | null, label: string): string {
  if (link) {
    return `<a class="chapter-header__nav-btn" href="${href(link.path)}" onclick="event.preventDefault();Playground.navigate('${link.path}')" title="${escapeHtml(link.title)}">${label}</a>`
  }
  return `<span class="chapter-header__nav-btn chapter-header__nav-btn--disabled">${label}</span>`
}

function renderTitle(options: PageHeaderOptions): string {
  if (options.breadcrumbs && options.breadcrumbs.length > 0) {
    const segments = options.breadcrumbs.map((bc, i) => {
      const isLast = i === options.breadcrumbs!.length - 1
      if (isLast || !bc.path) {
        return `<span class="chapter-header__breadcrumb-current">${escapeHtml(bc.label)}</span>`
      }
      return `<a class="chapter-header__breadcrumb-link" href="${href(bc.path)}" onclick="event.preventDefault();Playground.navigate('${bc.path}')">${escapeHtml(bc.label)}</a>`
    })
    return `<span class="chapter-header__title chapter-header__breadcrumbs">${segments.join('<span class="chapter-header__breadcrumb-sep">›</span>')}</span>`
  }
  return `<span class="chapter-header__title">${escapeHtml(options.title ?? '')}</span>`
}

export function renderPageHeader(options: PageHeaderOptions): string {
  return `
  <div class="chapter-header">
    ${renderTitle(options)}
    <div class="chapter-header__actions">
      <div class="chapter-header__nav-group">
        ${navBtn(options.prev, '←')}
        ${navBtn(options.up, '↑')}
        ${navBtn(options.next, '→')}
      </div>
      ${options.actions ?? ''}
    </div>
  </div>`
}
