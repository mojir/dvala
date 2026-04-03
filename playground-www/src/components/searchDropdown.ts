/**
 * Reusable search dropdown component.
 *
 * Handles: dropdown creation, keyboard navigation (arrow keys, enter, escape),
 * mouse/keyboard highlight conflict resolution, positioning, and outside-click close.
 *
 * Callers provide: search logic, result rendering, and select action.
 */

/** A single search result to display in the dropdown. */
export interface SearchResult<T> {
  /** The underlying data item. */
  data: T
  /** Primary label text. */
  label: string
  /** Secondary context text (shown right-aligned or below label). */
  context: string
  /** Optional CSS modifier class appended to the result element (e.g. 'code', 'section'). */
  modifier?: string
}

/** Groups of results separated by visual dividers. */
export interface SearchResultGroup<T> {
  results: SearchResult<T>[]
}

export interface SearchDropdownOptions<T> {
  /** Unique DOM id for the dropdown (used to toggle on/off). */
  id: string
  /** Input placeholder text. */
  placeholder: string
  /** Called on each input change. Return one or more groups of results. */
  search: (query: string) => SearchResultGroup<T>[]
  /** Called when a result is selected (click or Enter). */
  onSelect: (item: T) => void
  /** Optional: additional cleanup to run before opening (e.g. close sibling dropdowns). */
  onBeforeOpen?: () => void
}

/**
 * Toggle a search dropdown anchored below `btn`.
 * If the dropdown is already open, close it. Otherwise, create and show it.
 */
export function toggleSearchDropdown<T>(btn: HTMLElement, options: SearchDropdownOptions<T>): void {
  const existing = document.getElementById(options.id)
  if (existing) { existing.remove(); return }

  options.onBeforeOpen?.()

  const dropdown = document.createElement('div')
  dropdown.id = options.id
  dropdown.className = 'chapter-search-dropdown'

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = options.placeholder
  input.className = 'chapter-search-input'
  dropdown.appendChild(input)

  const results = document.createElement('div')
  results.className = 'chapter-search-results'
  dropdown.appendChild(results)

  // Flat list of current results for keyboard navigation
  let currentItems: T[] = []

  const close = () => {
    dropdown.remove()
    document.removeEventListener('keydown', onKey)
  }

  const selectItem = (item: T) => {
    close()
    options.onSelect(item)
  }

  // Keyboard-driven active item tracking.
  // Toggle .keyboard-nav on results to suppress CSS :hover during arrow-key navigation.
  let activeIndex = -1
  const setActive = (i: number) => {
    const items = results.querySelectorAll<HTMLElement>('.chapter-search-result')
    items.forEach((el, idx) => el.classList.toggle('chapter-search-result--active', idx === i))
    activeIndex = i
    if (i >= 0) items[i]?.scrollIntoView({ block: 'nearest' })
  }

  results.addEventListener('mousemove', () => { results.classList.remove('keyboard-nav') })

  const renderResults = (query: string) => {
    results.innerHTML = ''
    const q = query.trim()
    if (!q) { currentItems = []; return }

    const groups = options.search(q)
    const allResults = groups.flatMap(g => g.results)
    currentItems = allResults.map(r => r.data)

    if (allResults.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'chapter-search-empty'
      empty.textContent = 'No results'
      results.appendChild(empty)
      return
    }

    let globalIndex = 0
    groups.forEach((group, groupIdx) => {
      // Insert divider between groups (not before the first)
      if (groupIdx > 0 && group.results.length > 0) {
        const sep = document.createElement('div')
        sep.className = 'chapter-search-separator'
        results.appendChild(sep)
      }

      for (const result of group.results) {
        const idx = globalIndex++
        const item = document.createElement('div')
        const modClass = result.modifier ? ` chapter-search-result--${result.modifier}` : ''
        item.className = `chapter-search-result${modClass}`
        item.dataset.index = String(idx)

        const labelEl = document.createElement('span')
        labelEl.className = 'chapter-search-result__label'
        labelEl.textContent = result.label

        const ctxEl = document.createElement('span')
        ctxEl.className = 'chapter-search-result__context'
        ctxEl.textContent = result.context

        item.appendChild(labelEl)
        item.appendChild(ctxEl)
        item.addEventListener('mousedown', e => { e.preventDefault(); selectItem(result.data) })
        item.addEventListener('mousemove', () => setActive(idx))
        results.appendChild(item)
      }
    })
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { close(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); results.classList.add('keyboard-nav'); setActive(Math.min(activeIndex + 1, currentItems.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); results.classList.add('keyboard-nav'); setActive(Math.max(activeIndex - 1, 0)) }
    if (e.key === 'Enter' && activeIndex >= 0) {
      const item = currentItems[activeIndex]
      if (item) selectItem(item)
    }
  }
  document.addEventListener('keydown', onKey)

  input.addEventListener('input', () => { activeIndex = -1; renderResults(input.value) })

  // Position fixed below the button
  document.body.appendChild(dropdown)
  const rect = btn.getBoundingClientRect()
  dropdown.style.top = `${rect.bottom + 4}px`
  dropdown.style.right = `${window.innerWidth - rect.right}px`

  requestAnimationFrame(() => input.focus())

  // Close on outside click (not on input blur, so mouse clicks on results work)
  const closeOnOutside = (e: Event) => {
    if (!dropdown.contains(e.target as Node)) {
      dropdown.remove()
      document.removeEventListener('click', closeOnOutside)
      document.removeEventListener('keydown', onKey)
    }
  }
  setTimeout(() => document.addEventListener('click', closeOnOutside), 0)
}
