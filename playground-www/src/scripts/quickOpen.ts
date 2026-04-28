// Quick Open — Cmd/Ctrl-P file picker.
//
// Monaco's standalone build does not publicly export the `IQuickInputService`
// that VS Code uses for its picker (microsoft/monaco-editor#2295 — out of
// scope for the standalone bundle). Reaching into the deep ESM internals
// would couple us to Monaco's private surface across version upgrades, so
// this module ships a small dedicated picker instead. It reuses the
// playground's modal CSS primitives and the keyboard-navigation pattern
// from `components/searchDropdown.ts` without sharing the implementation
// — that component is geared toward an anchored-below-a-button dropdown
// and Quick Open wants a centered palette with different toggle semantics
// (Cmd-P always opens fresh, doesn't toggle).
//
// On selection, the picker delegates to `openOrFocusFile` so the chosen
// file lands as a tab — same surface the explorer uses.

import { KeyCode, KeyMod } from '../codeEditor'
import { getSavedFiles } from '../fileStorage'
import { tryGetCodeEditor } from './codeEditorInstance'
import { rankSavedFiles } from './quickOpenRank'
import type { QuickOpenItem } from './quickOpenRank'
import { openOrFocusFile } from './tabs'

// ----------------------------------------------------------------------
// Picker UI
// ----------------------------------------------------------------------

const PICKER_ID = 'quick-open-palette'

let activePicker: { close: () => void } | null = null

/**
 * Open the file picker. If already visible, this is a no-op (Cmd-P pressed
 * twice in a row should not re-open over itself). Exported so the e2e
 * suite can drive the picker without hitting platform-specific keyboard
 * shortcuts (Meta-P on Mac vs. Control-P elsewhere).
 */
export function openQuickOpen(): void {
  if (activePicker) return

  const files = getSavedFiles()
  // Ergonomic: if the workspace is empty, don't bother with a popup —
  // a Cmd-P with no files would just be a noise event.
  if (files.length === 0) return

  const overlay = document.createElement('div')
  overlay.id = PICKER_ID
  overlay.className = 'quick-open__overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-label', 'Quick open file')

  const palette = document.createElement('div')
  palette.className = 'quick-open__palette'
  overlay.appendChild(palette)

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'Search files…'
  input.className = 'quick-open__input'
  input.autocomplete = 'off'
  input.spellcheck = false
  palette.appendChild(input)

  const list = document.createElement('div')
  list.className = 'quick-open__results'
  palette.appendChild(list)

  let items: QuickOpenItem[] = []
  let selectedIndex = 0

  const close = () => {
    overlay.remove()
    document.removeEventListener('keydown', onKey, true)
    activePicker = null
  }

  const select = (item: QuickOpenItem) => {
    close()
    openOrFocusFile(item.id)
  }

  // Render the result list for the current query. Pure DOM update — no
  // animations, full repaint. Workspaces are small enough that
  // re-creating the children on every keystroke is fine.
  const render = () => {
    items = rankSavedFiles(input.value, getSavedFiles())
    if (selectedIndex >= items.length) selectedIndex = Math.max(0, items.length - 1)
    list.innerHTML = ''
    if (items.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'quick-open__empty'
      empty.textContent = 'No matching files'
      list.appendChild(empty)
      return
    }
    items.forEach((item, idx) => {
      const row = document.createElement('div')
      row.className = `quick-open__row${idx === selectedIndex ? ' quick-open__row--selected' : ''}`
      // We use `data-index` rather than capturing `item` in a closure so a
      // single delegated click handler on the list dispatches efficiently.
      row.dataset['index'] = String(idx)
      const labelEl = document.createElement('span')
      labelEl.className = 'quick-open__label'
      labelEl.textContent = item.label
      row.appendChild(labelEl)
      if (item.detail) {
        const detailEl = document.createElement('span')
        detailEl.className = 'quick-open__detail'
        detailEl.textContent = item.detail
        row.appendChild(detailEl)
      }
      list.appendChild(row)
    })
  }

  // ---- Key handling ----
  // Bound on document with `useCapture: true` so the picker swallows keys
  // before Monaco's editor commands can interpret them. Without capture,
  // Cmd-P → arrow keys would also page Monaco's cursor.
  const onKey = (evt: KeyboardEvent) => {
    if (evt.key === 'Escape') {
      evt.preventDefault()
      evt.stopPropagation()
      close()
      return
    }
    if (evt.key === 'Enter') {
      evt.preventDefault()
      evt.stopPropagation()
      const chosen = items[selectedIndex]
      if (chosen) select(chosen)
      return
    }
    if (evt.key === 'ArrowDown') {
      evt.preventDefault()
      evt.stopPropagation()
      if (items.length === 0) return
      selectedIndex = (selectedIndex + 1) % items.length
      render()
      return
    }
    if (evt.key === 'ArrowUp') {
      evt.preventDefault()
      evt.stopPropagation()
      if (items.length === 0) return
      selectedIndex = (selectedIndex - 1 + items.length) % items.length
      render()
    }
  }

  // Click anywhere outside the palette → close (matches Cmd-K / Spotlight).
  overlay.addEventListener('click', evt => {
    if (evt.target === overlay) close()
  })
  // Click on a result row → select.
  list.addEventListener('click', evt => {
    const row = (evt.target as HTMLElement).closest<HTMLElement>('[data-index]')
    if (!row) return
    const idx = Number(row.dataset['index'])
    const chosen = items[idx]
    if (chosen) select(chosen)
  })

  input.addEventListener('input', () => {
    selectedIndex = 0
    render()
  })

  document.body.appendChild(overlay)
  render()
  // Focus inside rAF so the input grabs focus after the overlay finishes
  // mounting (some browsers reject focus on freshly-attached nodes).
  requestAnimationFrame(() => input.focus())
  document.addEventListener('keydown', onKey, true)

  activePicker = { close }
}

// ----------------------------------------------------------------------
// Boot wiring
// ----------------------------------------------------------------------

let shortcutWired = false

/**
 * Register Cmd/Ctrl-P as a Monaco editor command. The shortcut only fires
 * while the editor has focus — matches the existing tab-shortcut conventions
 * (Cmd-W close, Cmd-1..9 jump). Browser default for Cmd-P (print) is
 * swallowed by Monaco having focus + the addCommand registration.
 */
export function wireQuickOpenShortcut(): void {
  if (shortcutWired) return
  const editor = tryGetCodeEditor()
  if (!editor) return
  shortcutWired = true
  editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyP, () => openQuickOpen())
}
