/**
 * Search dialog logic — reads from window.referenceData.searchEntries.
 * Replaces the old Playground.allSearchResultEntries approach.
 */

import type { SearchEntry } from '../../../common/referenceData'
import { navigate } from '../router'

let selectedIndex: number | null = null
let currentResults: SearchEntry[] = []
let _onCloseCallback: (() => void) | null = null

export function onSearchClose(cb: () => void): void {
  _onCloseCallback = cb
}

export function initSearchDialog(): void {
  const input = document.getElementById('search-input') as HTMLInputElement | null
  if (!input) return

  input.addEventListener('input', e => {
    const val = (e.target as HTMLInputElement).value
    updateResults(val)
  })
}

function getSearchEntries(): SearchEntry[] {
  return window.referenceData?.searchEntries ?? []
}

function updateResults(query: string): void {
  const resultsEl = document.getElementById('search-result')
  const noResultEl = document.getElementById('no-search-result')
  const introEl = document.getElementById('search-intro')

  if (!resultsEl || !noResultEl) return

  if (!query.trim()) {
    resultsEl.style.display = 'none'
    noResultEl.style.display = 'none'
    if (introEl) introEl.style.display = 'block'
    currentResults = []
    selectedIndex = null
    return
  }

  if (introEl) introEl.style.display = 'none'

  const lower = query.toLowerCase()
  currentResults = getSearchEntries().filter(e => e.search.toLowerCase().includes(lower))

  if (currentResults.length === 0) {
    resultsEl.style.display = 'none'
    resultsEl.innerHTML = ''
    noResultEl.style.display = 'flex'
    selectedIndex = null
    return
  }

  noResultEl.style.display = 'none'
  resultsEl.style.display = 'flex'
  resultsEl.innerHTML = renderResults(currentResults)
  selectedIndex = null

  // Attach click handlers
  Array.from(resultsEl.querySelectorAll('.search-dialog__entry')).forEach((el, i) => {
    (el as HTMLElement).addEventListener('click', () => {
      selectEntry(i)
    })
  })
}

function renderResults(entries: SearchEntry[]): string {
  return entries.map((entry, i) => `
<div class="search-dialog__entry" data-index="${i}" role="option" tabindex="-1">
  <span class="search-dialog__entry-title">${escapeHtml(entry.title)}</span>
  <span class="search-dialog__entry-category">${escapeHtml(entry.category)}</span>
  ${entry.description ? `<span class="search-dialog__entry-desc">${escapeHtml(entry.description)}</span>` : ''}
</div>`).join('')
}

function selectEntry(index: number): void {
  const entry = currentResults[index]
  if (!entry) return
  closeSearch()
  navigate(`/ref/${entry.linkName}`)
}

function updateSelection(): void {
  const resultsEl = document.getElementById('search-result')
  if (!resultsEl) return

  const items = Array.from(resultsEl.querySelectorAll('.search-dialog__entry'))
  items.forEach(el => el.classList.remove('search-dialog__entry--focused'))

  if (selectedIndex === null) return

  const count = items.length
  if (count === 0) {
    selectedIndex = null
    return
  }

  if (selectedIndex >= count) selectedIndex = count - 1
  if (selectedIndex < 0) selectedIndex = 0

  const focused = items[selectedIndex]
  if (focused) {
    focused.classList.add('search-dialog__entry--focused')
    focused.scrollIntoView({ block: 'nearest' })
  }
}

export function handleSearchKeyDown(event: KeyboardEvent): 'stop' | void {
  const overlay = document.getElementById('search-dialog-overlay')
  const isOpen = overlay?.style.display === 'block'

  // Toggle on Ctrl+K / Meta+K / F3
  if (!isOpen) {
    if ((event.key === 'k' || event.key === 'K') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      openSearch()
      return 'stop'
    }
    if (event.key === 'F3') {
      event.preventDefault()
      openSearch()
      return 'stop'
    }
    return
  }

  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      closeSearch()
      return 'stop'
    case 'ArrowDown':
      event.preventDefault()
      selectedIndex = selectedIndex === null ? 0 : selectedIndex + 1
      updateSelection()
      return 'stop'
    case 'ArrowUp':
      event.preventDefault()
      if (selectedIndex !== null) selectedIndex -= 1
      updateSelection()
      return 'stop'
    case 'Enter':
      event.preventDefault()
      if (selectedIndex !== null) selectEntry(selectedIndex)
      return 'stop'
    case 'k':
    case 'K':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        closeSearch()
        return 'stop'
      }
      break
    case 'F3':
      event.preventDefault()
      closeSearch()
      return 'stop'
  }
  return 'stop' // swallow all keys while open
}

export function openSearch(): void {
  const overlay = document.getElementById('search-dialog-overlay')
  const input = document.getElementById('search-input') as HTMLInputElement | null
  if (!overlay || !input) return
  overlay.style.display = 'block'
  input.focus()
  updateResults(input.value)
}

export function closeSearch(): void {
  const overlay = document.getElementById('search-dialog-overlay')
  if (!overlay) return
  overlay.style.display = 'none'
  _onCloseCallback?.()
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
