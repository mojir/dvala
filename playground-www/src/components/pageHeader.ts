/**
 * Reusable sticky page header with title, action buttons, and ← ↑ → navigation.
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

export interface PageHeaderOptions {
  /** Page title shown in the header. */
  title: string
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

export function renderPageHeader(options: PageHeaderOptions): string {
  return `
  <div class="chapter-header">
    <span class="chapter-header__title">${escapeHtml(options.title)}</span>
    <div class="chapter-header__actions">
      ${options.actions ?? ''}
      <div class="chapter-header__nav-group">
        ${navBtn(options.prev, '←')}
        ${navBtn(options.up, '↑')}
        ${navBtn(options.next, '→')}
      </div>
    </div>
  </div>`
}
