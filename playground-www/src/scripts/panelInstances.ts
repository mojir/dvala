// Singletons for the right + bottom layout panels. Constructed once during
// boot from `scripts.ts`; everything else (parse → AST viewer, Cmd-J
// toggle, applyLayout's class sync) reaches the panels through the
// accessors here. Same pattern as `codeEditorInstance.ts`.

import { saveState } from '../state'
import type { Panel } from './panel'

let rightPanel: Panel | null = null
let bottomPanel: Panel | null = null

export function setRightPanel(p: Panel): void {
  rightPanel = p
}
export function setBottomPanel(p: Panel): void {
  bottomPanel = p
}

export function getRightPanel(): Panel {
  if (!rightPanel) throw new Error('Right panel not initialised yet')
  return rightPanel
}
export function tryGetRightPanel(): Panel | null {
  return rightPanel
}
export function tryGetBottomPanel(): Panel | null {
  return bottomPanel
}

/**
 * `body.bottom-panel-collapsed` drives the CSS that hides the horizontal
 * resize divider while the bottom panel is collapsed. The class is set
 * here (rather than in `applyLayout`) so the panel's own `onChange`
 * callback can keep it in sync without `applyLayout`'s broader churn.
 */
export function syncBodyClasses(): void {
  document.body.classList.toggle('bottom-panel-collapsed', bottomPanel?.isCollapsed() ?? false)
}

/**
 * Persist the panel state slots that survive reloads. Called from each
 * panel's `onChange` callback; debouncing isn't necessary — toggle events
 * are infrequent and writing a few localStorage keys is fast.
 *
 * Both calls fall back to a known-good tab id when `getActiveTabId()`
 * returns null — that only happens if every tab is hidden (today neither
 * panel makes its tabs closable, but the Panel API supports it). The
 * sentinel keeps the persisted state human-readable and avoids any
 * downstream `?? undefined` chains.
 */
export function persistRightPanel(): void {
  if (!rightPanel) return
  saveState(
    {
      // 'tokens' is the leftmost tool tab (pipeline order) — best default
      // if the user somehow ends up with no active right-panel tab.
      'right-panel-active-tab': rightPanel.getActiveTabId() ?? 'tokens',
      'right-panel-collapsed': rightPanel.isCollapsed(),
    },
    false,
  )
}
export function persistBottomPanel(): void {
  if (!bottomPanel) return
  saveState(
    {
      'bottom-panel-active-tab': bottomPanel.getActiveTabId() ?? 'output',
      'bottom-panel-collapsed': bottomPanel.isCollapsed(),
    },
    false,
  )
}
