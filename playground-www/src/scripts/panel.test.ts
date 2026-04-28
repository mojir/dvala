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
