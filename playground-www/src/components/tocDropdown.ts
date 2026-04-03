/**
 * Reusable TOC (table of contents) dropdown component.
 *
 * Handles: dropdown creation, "Overview" link, section/item rendering,
 * active item highlighting, positioning, scroll-to-active, and outside-click close.
 *
 * Callers provide: content structure and navigation actions.
 */

const CHECK = '<span class="chapter-toc-dropdown__check">✓</span>'
const EMPTY_CHECK = '<span class="chapter-toc-dropdown__check"></span>'

/** A single item in the TOC. */
export interface TocItem {
  label: string
  active?: boolean
  /** CSS modifier: 'subitem' renders as an indented sub-entry. */
  type?: 'item' | 'subitem'
  onSelect: () => void
}

/** A group of items under a section heading. */
export interface TocSection {
  title: string
  items: TocItem[]
}

export interface TocDropdownOptions {
  /** Unique DOM id for the dropdown (used to toggle on/off). */
  id: string
  /** Label and action for the "Overview" link at the top. */
  overview: { label: string; onSelect: () => void }
  /** Sections to render. */
  sections: TocSection[]
}

/**
 * Toggle a TOC dropdown anchored below `btn`.
 * If already open, close it. Otherwise, create and show it.
 */
export function toggleTocDropdown(btn: HTMLElement, options: TocDropdownOptions): void {
  const existing = document.getElementById(options.id)
  if (existing) { existing.remove(); return }

  const dropdown = document.createElement('div')
  dropdown.id = options.id
  dropdown.className = 'chapter-toc-dropdown'

  // Overview link
  const overview = document.createElement('a')
  overview.className = 'chapter-toc-dropdown__item chapter-toc-dropdown__item--overview'
  overview.textContent = options.overview.label
  overview.addEventListener('click', () => { dropdown.remove(); options.overview.onSelect() })
  dropdown.appendChild(overview)

  let activeEl: HTMLElement | null = null

  for (const section of options.sections) {
    const label = document.createElement('div')
    label.className = 'chapter-toc-dropdown__section'
    label.textContent = section.title
    dropdown.appendChild(label)

    for (const item of section.items) {
      const isSubitem = item.type === 'subitem'
      const baseClass = isSubitem ? 'chapter-toc-dropdown__subitem' : 'chapter-toc-dropdown__item'
      const activeClass = item.active ? ` ${baseClass}--active` : ''
      const el = document.createElement('a')
      el.className = `${baseClass}${activeClass}`
      el.innerHTML = (item.active ? CHECK : EMPTY_CHECK) + escapeHtml(item.label)
      el.addEventListener('click', () => { dropdown.remove(); item.onSelect() })
      dropdown.appendChild(el)
      if (item.active) activeEl = el
    }
  }

  // Position fixed below the button
  document.body.appendChild(dropdown)
  const rect = btn.getBoundingClientRect()
  dropdown.style.top = `${rect.bottom + 4}px`
  dropdown.style.right = `${window.innerWidth - rect.right}px`

  // Scroll active item to vertical center of the dropdown
  if (activeEl) {
    const elTop = activeEl.offsetTop
    const elHeight = activeEl.offsetHeight
    dropdown.scrollTop = elTop - dropdown.clientHeight / 2 + elHeight / 2
  }

  // Close on outside click
  const closeOnOutside = (e: Event) => {
    if (!dropdown.contains(e.target as Node)) {
      dropdown.remove()
      document.removeEventListener('click', closeOnOutside)
    }
  }
  setTimeout(() => document.addEventListener('click', closeOnOutside), 0)
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
