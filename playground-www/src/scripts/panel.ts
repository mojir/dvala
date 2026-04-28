// Panel component — a collapsible, tabbed container for debug surfaces.
//
// Two instances are created at boot from `scripts.ts`: a right panel for
// structural views (AST viewer, outline) and a bottom panel for linear
// views (output, eventually state history / snapshots / effect traces).
// The same component handles both — orientation differences are pure CSS.
//
// Tabs are registered up-front. Each tab owns a body `<div>` that callers
// write into via `getTabBody(id)` or `setTabBody(id, content)`. The panel
// shows / hides bodies based on the active tab; switching tabs is a CSS
// toggle, not a DOM rebuild — viewport scroll position survives a swap.

interface PanelTabSpec {
  id: string
  label: string
  /** Optional title attribute for the tab button (tooltips). */
  title?: string
}

interface PanelOptions {
  /** The empty `<div>` we render into. The panel takes over its content. */
  containerEl: HTMLElement
  tabs: PanelTabSpec[]
  /** If absent, the first tab is active. */
  initialTabId?: string
  initialCollapsed?: boolean
  /** Fires after every state change (active-tab swap, collapse toggle). */
  onChange?: (state: { activeTabId: string; collapsed: boolean }) => void
}

export interface Panel {
  /** Switch the active tab. Throws on unknown id — silent no-ops mask bugs. */
  setActive(tabId: string): void
  /** Toggle collapsed state. Collapsed = body hidden, tab strip stays. */
  setCollapsed(collapsed: boolean): void
  isCollapsed(): boolean
  toggleCollapsed(): void
  getActiveTabId(): string
  /** Get the writable body element for a specific tab. */
  getTabBody(tabId: string): HTMLElement
  /** Replace a tab's body content. Convenience for one-shot writes. */
  setTabBody(tabId: string, content: HTMLElement): void
}

/** Build the panel DOM and wire its event handlers. */
export function createPanel(options: PanelOptions): Panel {
  if (options.tabs.length === 0) {
    // The component can't represent a tab-less panel — defensive guard since
    // boot wiring always passes >= 1 tab.
    throw new Error('createPanel requires at least one tab')
  }

  const { containerEl } = options
  let activeTabId = options.initialTabId ?? options.tabs[0]!.id
  let collapsed = options.initialCollapsed ?? false

  // ---- Tab strip ----
  const stripEl = document.createElement('div')
  stripEl.className = 'panel-shell__strip'
  stripEl.setAttribute('role', 'tablist')

  // ---- Bodies (one per tab; swap via the `panel-shell__body--active` class) ----
  const bodiesEl = document.createElement('div')
  bodiesEl.className = 'panel-shell__bodies'

  const tabBodies = new Map<string, HTMLElement>()

  for (const tab of options.tabs) {
    const tabBtn = document.createElement('button')
    tabBtn.type = 'button'
    tabBtn.className = 'panel-shell__tab'
    tabBtn.dataset['panelTabId'] = tab.id
    tabBtn.textContent = tab.label
    if (tab.title) tabBtn.title = tab.title
    tabBtn.setAttribute('role', 'tab')
    stripEl.appendChild(tabBtn)

    const body = document.createElement('div')
    body.className = 'panel-shell__body'
    body.dataset['panelTabId'] = tab.id
    body.setAttribute('role', 'tabpanel')
    bodiesEl.appendChild(body)
    tabBodies.set(tab.id, body)
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

  // ---- Event wiring ----
  // Delegated click on the tab strip — single listener, no per-tab handlers.
  stripEl.addEventListener('click', evt => {
    const target = (evt.target as HTMLElement).closest<HTMLButtonElement>('[data-panel-tab-id]')
    if (!target) return
    const id = target.dataset['panelTabId']
    if (!id || id === activeTabId) {
      // Clicking the already-active tab toggles collapsed — matches VS Code's
      // "click activity bar icon to hide pane" behavior. Without this, a
      // panel with one tab would have no way to toggle from the strip.
      if (id === activeTabId) {
        collapsed = !collapsed
        applyCollapsed()
        options.onChange?.({ activeTabId, collapsed })
      }
      return
    }
    activeTabId = id
    if (collapsed) collapsed = false
    applyActive()
    applyCollapsed()
    options.onChange?.({ activeTabId, collapsed })
  })

  applyActive()
  applyCollapsed()

  // ---- Public API ----
  return {
    setActive(tabId) {
      if (!tabBodies.has(tabId)) throw new Error(`Unknown panel tab: ${tabId}`)
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
  }
}

