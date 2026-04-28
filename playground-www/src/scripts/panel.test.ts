// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPanel } from './panel'

function makeContainer(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('createPanel', () => {
  it('throws when given an empty tab list', () => {
    expect(() => createPanel({ containerEl: makeContainer(), tabs: [] })).toThrow(/at least one tab/)
  })

  it('renders a tab strip + bodies, with the first tab active by default', () => {
    const c = makeContainer()
    createPanel({
      containerEl: c,
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    })
    expect(c.querySelectorAll('.panel-shell__tab')).toHaveLength(2)
    expect(c.querySelectorAll('.panel-shell__body')).toHaveLength(2)
    const activeTab = c.querySelector('.panel-shell__tab--active')
    expect(activeTab?.getAttribute('data-panel-tab-id')).toBe('a')
  })

  it('honors `initialTabId` when it names an existing tab', () => {
    const c = makeContainer()
    createPanel({
      containerEl: c,
      initialTabId: 'b',
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    })
    const active = c.querySelector('.panel-shell__tab--active')
    expect(active?.getAttribute('data-panel-tab-id')).toBe('b')
  })

  it('falls back to the first tab when `initialTabId` names a tab that no longer exists', () => {
    const c = makeContainer()
    createPanel({
      containerEl: c,
      initialTabId: 'persisted-from-old-version',
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    })
    const active = c.querySelector('.panel-shell__tab--active')
    expect(active?.getAttribute('data-panel-tab-id')).toBe('a')
  })

  it('starts collapsed when `initialCollapsed: true`', () => {
    const c = makeContainer()
    const p = createPanel({
      containerEl: c,
      tabs: [{ id: 'a', label: 'A' }],
      initialCollapsed: true,
    })
    expect(p.isCollapsed()).toBe(true)
    expect(c.classList.contains('panel-shell--collapsed')).toBe(true)
  })

  it('replaces the container content on construction (idempotent against reuse)', () => {
    const c = makeContainer()
    c.innerHTML = '<span class="stale">old</span>'
    createPanel({ containerEl: c, tabs: [{ id: 'a', label: 'A' }] })
    expect(c.querySelector('.stale')).toBeNull()
  })
})

describe('setActive / getActiveTabId', () => {
  it('switches the active tab and reflects on the DOM', () => {
    const c = makeContainer()
    const p = createPanel({
      containerEl: c,
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    })
    p.setActive('b')
    expect(p.getActiveTabId()).toBe('b')
    const active = c.querySelector('.panel-shell__tab--active')
    expect(active?.getAttribute('data-panel-tab-id')).toBe('b')
    const activeBody = c.querySelector('.panel-shell__body--active')
    expect(activeBody?.getAttribute('data-panel-tab-id')).toBe('b')
  })

  it('throws on unknown id', () => {
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [{ id: 'a', label: 'A' }],
    })
    expect(() => p.setActive('does-not-exist')).toThrow(/Unknown panel tab/)
  })

  it('does not fire onChange when setActive is called with the current id', () => {
    const onChange = vi.fn()
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [{ id: 'a', label: 'A' }],
      onChange,
    })
    p.setActive('a')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('fires onChange exactly once when setActive moves to a different tab', () => {
    const onChange = vi.fn()
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      onChange,
    })
    p.setActive('b')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ activeTabId: 'b', collapsed: false })
  })
})

describe('setCollapsed / toggleCollapsed', () => {
  it('round-trips through isCollapsed', () => {
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [{ id: 'a', label: 'A' }],
    })
    expect(p.isCollapsed()).toBe(false)
    p.setCollapsed(true)
    expect(p.isCollapsed()).toBe(true)
    p.setCollapsed(false)
    expect(p.isCollapsed()).toBe(false)
  })

  it('toggleCollapsed flips the state', () => {
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [{ id: 'a', label: 'A' }],
    })
    p.toggleCollapsed()
    expect(p.isCollapsed()).toBe(true)
    p.toggleCollapsed()
    expect(p.isCollapsed()).toBe(false)
  })

  it('does not fire onChange when setCollapsed is a no-op', () => {
    const onChange = vi.fn()
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [{ id: 'a', label: 'A' }],
      initialCollapsed: false,
      onChange,
    })
    p.setCollapsed(false)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('getTabBody / setTabBody', () => {
  it('returns the body element for a tab', () => {
    const c = makeContainer()
    const p = createPanel({
      containerEl: c,
      tabs: [{ id: 'a', label: 'A' }],
    })
    const body = p.getTabBody('a')
    expect(body.classList.contains('panel-shell__body')).toBe(true)
    expect(body.getAttribute('data-panel-tab-id')).toBe('a')
  })

  it('throws on unknown id', () => {
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [{ id: 'a', label: 'A' }],
    })
    expect(() => p.getTabBody('nope')).toThrow(/Unknown panel tab/)
  })

  it('setTabBody replaces the existing children', () => {
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [{ id: 'a', label: 'A' }],
    })
    const first = document.createElement('span')
    first.textContent = 'first'
    p.setTabBody('a', first)
    const body = p.getTabBody('a')
    expect(body.children).toHaveLength(1)
    expect(body.textContent).toBe('first')

    const second = document.createElement('span')
    second.textContent = 'second'
    p.setTabBody('a', second)
    expect(body.children).toHaveLength(1)
    expect(body.textContent).toBe('second')
  })
})

describe('strip click behavior', () => {
  it('clicking an inactive tab activates it', () => {
    const c = makeContainer()
    const p = createPanel({
      containerEl: c,
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    })
    const tabB = c.querySelector('[data-panel-tab-id="b"]') as HTMLButtonElement
    tabB.click()
    expect(p.getActiveTabId()).toBe('b')
  })

  it('clicking the already-active tab toggles collapsed', () => {
    const c = makeContainer()
    const p = createPanel({
      containerEl: c,
      tabs: [{ id: 'a', label: 'A' }],
    })
    expect(p.isCollapsed()).toBe(false)
    const tabA = c.querySelector('[data-panel-tab-id="a"]') as HTMLButtonElement
    tabA.click()
    expect(p.isCollapsed()).toBe(true)
    tabA.click()
    expect(p.isCollapsed()).toBe(false)
  })

  it('clicking an inactive tab while collapsed activates it AND uncollapses', () => {
    const c = makeContainer()
    const p = createPanel({
      containerEl: c,
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      initialCollapsed: true,
    })
    const tabB = c.querySelector('[data-panel-tab-id="b"]') as HTMLButtonElement
    tabB.click()
    expect(p.getActiveTabId()).toBe('b')
    expect(p.isCollapsed()).toBe(false)
  })
})

describe('hidden tabs + showTab/hideTab', () => {
  it('does not render hidden tabs in the strip at boot', () => {
    const c = makeContainer()
    const p = createPanel({
      containerEl: c,
      tabs: [
        { id: 'a', label: 'A', hidden: true },
        { id: 'b', label: 'B' },
      ],
    })
    const aBtn = c.querySelector('[data-panel-tab-id="a"]') as HTMLButtonElement
    expect(aBtn.style.display).toBe('none')
    expect(p.isTabVisible('a')).toBe(false)
    expect(p.isTabVisible('b')).toBe(true)
    expect(p.getVisibleTabIds()).toEqual(['b'])
  })

  it('skips hidden tabs when picking the initial active tab', () => {
    const c = makeContainer()
    const p = createPanel({
      containerEl: c,
      // The first listed tab is hidden — the first VISIBLE one wins.
      tabs: [
        { id: 'a', label: 'A', hidden: true },
        { id: 'b', label: 'B' },
      ],
    })
    expect(p.getActiveTabId()).toBe('b')
  })

  it('returns null active tab when every tab starts hidden', () => {
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [
        { id: 'a', label: 'A', hidden: true },
        { id: 'b', label: 'B', hidden: true },
      ],
    })
    expect(p.getActiveTabId()).toBeNull()
  })

  it('falls back to first visible tab when initialTabId names a hidden tab', () => {
    const p = createPanel({
      containerEl: makeContainer(),
      initialTabId: 'a',
      tabs: [
        { id: 'a', label: 'A', hidden: true },
        { id: 'b', label: 'B' },
      ],
    })
    expect(p.getActiveTabId()).toBe('b')
  })

  it('showTab makes a hidden tab visible without auto-activating', () => {
    const c = makeContainer()
    const p = createPanel({
      containerEl: c,
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B', hidden: true },
      ],
    })
    p.showTab('b')
    expect(p.isTabVisible('b')).toBe(true)
    // Still on 'a' — showTab is a visibility primitive, not an activator.
    expect(p.getActiveTabId()).toBe('a')
    const bBtn = c.querySelector('[data-panel-tab-id="b"]') as HTMLButtonElement
    expect(bBtn.style.display).not.toBe('none')
  })

  it('showTab on an empty panel auto-activates the new tab', () => {
    const onChange = vi.fn()
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [
        { id: 'a', label: 'A', hidden: true },
        { id: 'b', label: 'B', hidden: true },
      ],
      onChange,
    })
    expect(p.getActiveTabId()).toBeNull()
    p.showTab('b')
    expect(p.getActiveTabId()).toBe('b')
    // Active changed — onChange must fire.
    expect(onChange).toHaveBeenCalledWith({ activeTabId: 'b', collapsed: false })
  })

  it('showTab on already-visible tab is a no-op (no onChange)', () => {
    const onChange = vi.fn()
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [{ id: 'a', label: 'A' }],
      onChange,
    })
    p.showTab('a')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('hideTab on the active tab activates the next visible tab to the right', () => {
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
    })
    expect(p.getActiveTabId()).toBe('a')
    p.hideTab('a')
    expect(p.isTabVisible('a')).toBe(false)
    expect(p.getActiveTabId()).toBe('b')
  })

  it('hideTab on the rightmost active tab falls back to the previous visible tab', () => {
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
    })
    p.setActive('c')
    p.hideTab('c')
    expect(p.getActiveTabId()).toBe('b')
  })

  it('hideTab on an inactive tab leaves the active tab alone', () => {
    const onChange = vi.fn()
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      onChange,
    })
    p.hideTab('b')
    expect(p.getActiveTabId()).toBe('a')
    // Closing an inactive tab is a visibility-only change — onChange
    // (which carries active/collapsed state) should NOT fire.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('hideTab on the last visible tab clears active + auto-collapses', () => {
    const onChange = vi.fn()
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [{ id: 'a', label: 'A' }],
      onChange,
    })
    p.hideTab('a')
    expect(p.getActiveTabId()).toBeNull()
    expect(p.isCollapsed()).toBe(true)
    expect(onChange).toHaveBeenCalledWith({ activeTabId: null, collapsed: true })
  })

  it('hideTab is idempotent (no double-fire of onTabClose / onChange)', () => {
    const onChange = vi.fn()
    const onTabClose = vi.fn()
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      onChange,
      onTabClose,
    })
    p.hideTab('b')
    p.hideTab('b')
    expect(onTabClose).toHaveBeenCalledTimes(1)
  })

  it('setActive on a hidden tab throws', () => {
    const p = createPanel({
      containerEl: makeContainer(),
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B', hidden: true },
      ],
    })
    expect(() => p.setActive('b')).toThrow(/hidden/)
  })
})

describe('closable tabs (close button)', () => {
  it('renders an "x" element only on closable tabs', () => {
    const c = makeContainer()
    createPanel({
      containerEl: c,
      tabs: [
        { id: 'a', label: 'A', closable: true },
        { id: 'b', label: 'B' },
      ],
    })
    expect(c.querySelector('[data-panel-tab-close="a"]')).not.toBeNull()
    expect(c.querySelector('[data-panel-tab-close="b"]')).toBeNull()
  })

  it('clicking the close-X hides the tab and fires onTabClose', () => {
    const onTabClose = vi.fn()
    const c = makeContainer()
    const p = createPanel({
      containerEl: c,
      tabs: [
        { id: 'a', label: 'A', closable: true },
        { id: 'b', label: 'B' },
      ],
      onTabClose,
    })
    const closeEl = c.querySelector('[data-panel-tab-close="a"]') as HTMLElement
    closeEl.click()
    expect(p.isTabVisible('a')).toBe(false)
    expect(onTabClose).toHaveBeenCalledWith('a')
  })

  it('close-X click does NOT also activate the tab', () => {
    // Without stopPropagation in the close-button branch, the click
    // would bubble to the tab button and activate it before hiding.
    const c = makeContainer()
    const p = createPanel({
      containerEl: c,
      tabs: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B', closable: true },
      ],
    })
    expect(p.getActiveTabId()).toBe('a')
    const closeEl = c.querySelector('[data-panel-tab-close="b"]') as HTMLElement
    closeEl.click()
    expect(p.getActiveTabId()).toBe('a')
    expect(p.isTabVisible('b')).toBe(false)
  })
})
