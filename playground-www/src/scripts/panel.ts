// Panel component — a collapsible, tabbed container for debug surfaces.
//
// Two instances are created at boot from `scripts.ts`: a right panel for
// structural views (Tokens / AST / CST / Doc Tree) and a bottom panel
// for linear views (Output, eventually state history / snapshots / effect
// traces). The same component handles both — orientation differences are
// pure CSS.
//
// Tabs are registered up-front. Each tab owns a body `<div>` that callers
// write into via `getTabBody(id)` or `setTabBody(id, content)`. The panel
// shows / hides bodies based on the active tab; switching tabs is a CSS
// toggle, not a DOM rebuild — viewport scroll position survives a swap.
//
// Closable + runtime show/hide API (`closable` flag, `showTab`/`hideTab`/
// `onTabClose`) is deliberately kept around even though neither current
// panel uses it — the planned consumer is a future "Snapshots" tab on
// the bottom panel that pops in when the user takes a snapshot and out
// when they dismiss it. No corresponding `hidden` initial-state flag
// because tabs that come and go semantically belong to the runtime API,
// not the static spec.

interface PanelTabSpec {
  id: string
  label: string
  /** Optional title attribute for the tab button (tooltips). */
  title?: string
  /**
   * If true, render an "x" close button on the tab. Clicking it calls
   * `hideTab(id)` and fires `onTabClose`. Currently unused — both panels
   * register non-closable tabs. Reserved for the planned Snapshots tab.
   */
  closable?: boolean
}

interface PanelOptions {
  /** The empty `<div>` we render into. The panel takes over its content. */
  containerEl: HTMLElement
  tabs: PanelTabSpec[]
  /** If absent, the first visible tab is active. */
  initialTabId?: string
  initialCollapsed?: boolean
  /** Fires after every state change (active-tab swap, collapse toggle). */
  onChange?: (state: { activeTabId: string | null; collapsed: boolean }) => void
  /**
   * Optional element rendered at the right edge of the tab strip — useful
   * for tab-shell-level actions (e.g. an Output panel's Clear button) so
   * the body doesn't need its own toolbar. The element's children get
   * pushed right via `margin-left: auto`.
   */
  trailingActions?: HTMLElement
  /**
   * Fires after the user clicks a tab's "x" close button. The Panel has
   * already hidden the tab and (if needed) re-picked the active tab /
   * collapsed itself by the time this fires — callers use this hook to
   * react (e.g. drop the tab's auto-refresh subscription).
   */
  onTabClose?: (tabId: string) => void
}

export interface Panel {
  /** Switch the active tab. Throws on unknown id — silent no-ops mask bugs.
   * Throws if the target tab is currently hidden — call `showTab` first. */
  setActive(tabId: string): void
  /** Toggle collapsed state. Collapsed = body hidden, tab strip stays. */
  setCollapsed(collapsed: boolean): void
  isCollapsed(): boolean
  toggleCollapsed(): void
  /** Active tab id, or `null` when no tabs are visible. */
  getActiveTabId(): string | null
  /** Get the writable body element for a specific tab. */
  getTabBody(tabId: string): HTMLElement
  /** Replace a tab's body content. Convenience for one-shot writes. */
  setTabBody(tabId: string, content: HTMLElement): void
  /**
   * Show a previously-hidden tab in the strip. No-op when already visible.
   * Does NOT auto-activate; callers usually pair with `setActive`.
   */
  showTab(tabId: string): void
  /**
   * Hide a tab from the strip. If it was the active tab, activate the
   * next visible tab (or fall back to no active tab + auto-collapse if
   * none remain). Idempotent.
   */
  hideTab(tabId: string): void
  isTabVisible(tabId: string): boolean
  /** Snapshot of currently-visible tab ids in their DOM order. */
  getVisibleTabIds(): string[]
}

/** Build the panel DOM and wire its event handlers. */
export function createPanel(options: PanelOptions): Panel {
  if (options.tabs.length === 0) {
    // The component can't represent a tab-less panel — defensive guard since
    // boot wiring always passes >= 1 tab.
    throw new Error('createPanel requires at least one tab')
  }

  const { containerEl } = options
  const knownIds = new Set(options.tabs.map(t => t.id))

  // Per-tab visibility flags — mutated at runtime by `hideTab`/`showTab`.
  // All tabs start visible (no `hidden` initial-state flag); the runtime
  // API is for tabs that come and go after construction.
  const hiddenFlags = new Map<string, boolean>()
  for (const tab of options.tabs) hiddenFlags.set(tab.id, false)

  function visibleIdsInOrder(): string[] {
    return options.tabs.filter(t => !hiddenFlags.get(t.id)).map(t => t.id)
  }

  // Pick the initial active tab. Validate `initialTabId` against the tab
  // list — persisted state can name a tab that no longer exists (e.g. a
  // future PR drops a tab; an old user's localStorage still says
  // `'output'`). Falling back to the first tab keeps the panel usable.
  function pickInitialActive(): string {
    if (options.initialTabId !== undefined && knownIds.has(options.initialTabId)) {
      return options.initialTabId
    }
    return options.tabs[0]!.id
  }

  let activeTabId: string | null = pickInitialActive()
  let collapsed = options.initialCollapsed ?? false

  // ---- Tab strip ----
  const stripEl = document.createElement('div')
  stripEl.className = 'panel-shell__strip'
  stripEl.setAttribute('role', 'tablist')

  // ---- Bodies (one per tab; swap via the `panel-shell__body--active` class) ----
  const bodiesEl = document.createElement('div')
  bodiesEl.className = 'panel-shell__bodies'

  const tabBodies = new Map<string, HTMLElement>()
  const tabButtons = new Map<string, HTMLButtonElement>()

  for (const tab of options.tabs) {
    const tabBtn = document.createElement('button')
    tabBtn.type = 'button'
    tabBtn.className = 'panel-shell__tab'
    tabBtn.dataset['panelTabId'] = tab.id
    if (tab.title) tabBtn.title = tab.title
    tabBtn.setAttribute('role', 'tab')

    // Label sits in its own span so the close button can be a peer node
    // without disturbing centering or text flow.
    const labelEl = document.createElement('span')
    labelEl.className = 'panel-shell__tab-label'
    labelEl.textContent = tab.label
    tabBtn.appendChild(labelEl)

    if (tab.closable) {
      const closeBtn = document.createElement('span')
      closeBtn.className = 'panel-shell__tab-close'
      closeBtn.textContent = '×'
      closeBtn.dataset['panelTabClose'] = tab.id
      closeBtn.setAttribute('role', 'button')
      closeBtn.setAttribute('aria-label', `Close ${tab.label} tab`)
      tabBtn.appendChild(closeBtn)
    }

    stripEl.appendChild(tabBtn)
    tabButtons.set(tab.id, tabBtn)

    const body = document.createElement('div')
    body.className = 'panel-shell__body'
    body.dataset['panelTabId'] = tab.id
    body.setAttribute('role', 'tabpanel')
    bodiesEl.appendChild(body)
    tabBodies.set(tab.id, body)
  }

  if (options.trailingActions) {
    options.trailingActions.classList.add('panel-shell__strip-actions')
    stripEl.appendChild(options.trailingActions)
  }

  // Reset the container — we own its children now. Caller passes an empty
  // div in shell.ts; this guard keeps setup idempotent if someone reuses
  // the same container (e.g. hot-reload).
  containerEl.innerHTML = ''
  containerEl.classList.add('panel-shell')
  containerEl.appendChild(stripEl)
  containerEl.appendChild(bodiesEl)

  // ---- State application ----
  function applyActive(): void {
    for (const tabBtn of stripEl.querySelectorAll<HTMLButtonElement>('[data-panel-tab-id]')) {
      const isActive = tabBtn.dataset['panelTabId'] === activeTabId
      tabBtn.classList.toggle('panel-shell__tab--active', isActive)
      tabBtn.setAttribute('aria-selected', String(isActive))
    }
    for (const [id, body] of tabBodies) {
      body.classList.toggle('panel-shell__body--active', id === activeTabId)
    }
  }

  function applyCollapsed(): void {
    containerEl.classList.toggle('panel-shell--collapsed', collapsed)
  }

  function applyVisibility(): void {
    for (const [id, btn] of tabButtons) {
      btn.style.display = hiddenFlags.get(id) ? 'none' : ''
    }
  }

  // ---- Event wiring ----
  // Delegated click on the tab strip — single listener, no per-tab handlers.
  stripEl.addEventListener('click', evt => {
    const targetEl = evt.target as HTMLElement
    // Close button takes precedence — a click on the "x" should hide the
    // tab without first activating it. We check the close-button data
    // attribute before falling through to the tab-button handler.
    const closeEl = targetEl.closest<HTMLElement>('[data-panel-tab-close]')
    if (closeEl) {
      evt.stopPropagation()
      const id = closeEl.dataset['panelTabClose']
      if (id) panel.hideTab(id)
      return
    }
    const tabEl = targetEl.closest<HTMLButtonElement>('[data-panel-tab-id]')
    if (!tabEl) return
    const id = tabEl.dataset['panelTabId']
    if (!id) return
    if (id === activeTabId) {
      // Clicking the already-active tab toggles collapsed — matches VS Code's
      // "click activity bar icon to hide pane" behavior. Without this, a
      // panel with one tab would have no way to toggle from the strip.
      collapsed = !collapsed
      applyCollapsed()
      options.onChange?.({ activeTabId, collapsed })
      return
    }
    activeTabId = id
    if (collapsed) collapsed = false
    applyActive()
    applyCollapsed()
    options.onChange?.({ activeTabId, collapsed })
  })

  applyVisibility()
  applyActive()
  applyCollapsed()

  // ---- Public API ----
  // Defined as a const so the click handler can reference `panel.hideTab`
  // without a forward-reference cycle. Returned at the end of the function.
  const panel: Panel = {
    setActive(tabId) {
      if (!tabBodies.has(tabId)) throw new Error(`Unknown panel tab: ${tabId}`)
      if (hiddenFlags.get(tabId)) throw new Error(`Cannot activate hidden panel tab: ${tabId}`)
      if (tabId === activeTabId) return
      activeTabId = tabId
      applyActive()
      options.onChange?.({ activeTabId, collapsed })
    },
    setCollapsed(value) {
      if (collapsed === value) return
      collapsed = value
      applyCollapsed()
      options.onChange?.({ activeTabId, collapsed })
    },
    isCollapsed() {
      return collapsed
    },
    toggleCollapsed() {
      this.setCollapsed(!collapsed)
    },
    getActiveTabId() {
      return activeTabId
    },
    getTabBody(tabId) {
      const body = tabBodies.get(tabId)
      if (!body) throw new Error(`Unknown panel tab: ${tabId}`)
      return body
    },
    setTabBody(tabId, content) {
      const body = this.getTabBody(tabId)
      body.innerHTML = ''
      body.appendChild(content)
    },
    showTab(tabId) {
      if (!tabBodies.has(tabId)) throw new Error(`Unknown panel tab: ${tabId}`)
      if (!hiddenFlags.get(tabId)) return
      hiddenFlags.set(tabId, false)
      applyVisibility()
      // If nothing was active (all tabs were hidden), this newly-shown
      // tab becomes the active one. We don't auto-activate otherwise —
      // showTab is a visibility primitive, callers pair with setActive.
      if (activeTabId === null) {
        activeTabId = tabId
        applyActive()
        options.onChange?.({ activeTabId, collapsed })
      }
    },
    hideTab(tabId) {
      if (!tabBodies.has(tabId)) throw new Error(`Unknown panel tab: ${tabId}`)
      if (hiddenFlags.get(tabId)) return
      hiddenFlags.set(tabId, true)
      applyVisibility()
      // If we just hid the active tab, fall to the next visible neighbor —
      // prefer the one to the right (DOM order), then the one to the
      // left, mirroring VS Code's tab-close semantics.
      let activeChanged = false
      let collapsedChanged = false
      if (tabId === activeTabId) {
        const remaining = visibleIdsInOrder()
        if (remaining.length === 0) {
          activeTabId = null
          // No tabs left to show — collapse so the empty body doesn't
          // hold layout space. Keep the strip visible (it has the trailing
          // actions slot and shows "where" the panel is).
          if (!collapsed) {
            collapsed = true
            collapsedChanged = true
          }
        } else {
          // Pick the next-visible tab in DOM order. If the closed tab was
          // the rightmost, fall back to the new last entry.
          const originalIdx = options.tabs.findIndex(t => t.id === tabId)
          const next =
            options.tabs.slice(originalIdx + 1).find(t => !hiddenFlags.get(t.id))
            ?? options.tabs.slice(0, originalIdx).reverse().find(t => !hiddenFlags.get(t.id))
          activeTabId = next?.id ?? remaining[0]!
        }
        activeChanged = true
        applyActive()
        if (collapsedChanged) applyCollapsed()
      }
      options.onTabClose?.(tabId)
      if (activeChanged || collapsedChanged) {
        options.onChange?.({ activeTabId, collapsed })
      }
    },
    isTabVisible(tabId) {
      if (!tabBodies.has(tabId)) throw new Error(`Unknown panel tab: ${tabId}`)
      return !hiddenFlags.get(tabId)
    },
    getVisibleTabIds() {
      return visibleIdsInOrder()
    },
  }

  return panel
}

