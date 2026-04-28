import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type SavedFileStub = { id: string; path: string; code: string }

class FakeElement {
  id = ''
  className = ''
  textContent = ''
  innerHTML = ''
  value = ''
  type = ''
  placeholder = ''
  autocomplete = ''
  spellcheck = false
  dataset: Record<string, string> = {}
  children: FakeElement[] = []
  parent: FakeElement | null = null
  removed = false
  listeners = new Map<string, ((evt: any) => void)[]>()

  appendChild(child: FakeElement) {
    child.parent = this
    this.children.push(child)
    return child
  }

  setAttribute(name: string, value: string) {
    if (name === 'id') this.id = value
  }

  addEventListener(type: string, cb: (evt: any) => void) {
    const current = this.listeners.get(type) ?? []
    current.push(cb)
    this.listeners.set(type, current)
  }

  removeEventListener(type: string, cb: (evt: any) => void) {
    const current = this.listeners.get(type) ?? []
    this.listeners.set(type, current.filter(listener => listener !== cb))
  }

  dispatch(type: string, evt: any) {
    for (const cb of this.listeners.get(type) ?? []) cb(evt)
  }

  remove() {
    this.removed = true
    if (!this.parent) return
    this.parent.children = this.parent.children.filter(child => child !== this)
    this.parent = null
  }

  focus() {}

  closest<T>(_selector: string): T | null {
    return null
  }
}

type FakeDocument = {
  body: FakeElement
  createElement: (tag: string) => FakeElement
  addEventListener: (type: string, cb: (evt: any) => void, capture?: boolean) => void
  removeEventListener: (type: string, cb: (evt: any) => void, capture?: boolean) => void
  dispatchKeydown: (evt: any) => void
}

function createFakeDocument(): FakeDocument {
  const listeners = new Map<string, ((evt: any) => void)[]>()
  return {
    body: new FakeElement(),
    createElement() {
      return new FakeElement()
    },
    addEventListener(type, cb) {
      const current = listeners.get(type) ?? []
      current.push(cb)
      listeners.set(type, current)
    },
    removeEventListener(type, cb) {
      const current = listeners.get(type) ?? []
      listeners.set(type, current.filter(listener => listener !== cb))
    },
    dispatchKeydown(evt) {
      for (const cb of listeners.get('keydown') ?? []) cb(evt)
    },
  }
}

let savedFiles: SavedFileStub[] = []
let focusSpy: any
let openOrFocusFileSpy: any

vi.mock('../fileStorage', () => ({
  getSavedFiles: () => savedFiles,
  fileDisplayName: (file: { path: string }) => file.path.split('/').pop() ?? file.path,
}))

vi.mock('./codeEditorInstance', () => ({
  tryGetCodeEditor: () => ({ focus: focusSpy }),
}))

vi.mock('./tabs', () => ({
  openOrFocusFile: (id: string) => openOrFocusFileSpy(id),
}))

vi.mock('../codeEditor', () => ({
  KeyCode: new Proxy({}, { get: () => 0 }),
  KeyMod: new Proxy({}, { get: () => 0 }),
}))

function keyEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetModules()
  savedFiles = [{ id: 'file-a', path: 'target.dvala', code: 'OPENED' }]
  focusSpy = vi.fn()
  openOrFocusFileSpy = vi.fn()
  const doc = createFakeDocument()
  vi.stubGlobal('document', doc)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('openQuickOpen', () => {
  it('restores editor focus after Escape closes the palette', async () => {
    const { openQuickOpen } = await import('./quickOpen')
    openQuickOpen()

    ;(document as unknown as FakeDocument).dispatchKeydown(keyEvent('Escape'))
    expect(focusSpy).not.toHaveBeenCalled()

    vi.runAllTimers()

    expect(focusSpy).toHaveBeenCalledTimes(1)
  })

  it('does not steal focus back after clicking the backdrop', async () => {
    const { openQuickOpen } = await import('./quickOpen')
    openQuickOpen()

    const overlay = (document as unknown as FakeDocument).body.children[0]!
    overlay.dispatch('click', { target: overlay })

    vi.runAllTimers()

    expect(focusSpy).not.toHaveBeenCalled()
  })

  it('restores editor focus after Enter opens the selected file', async () => {
    const { openQuickOpen } = await import('./quickOpen')
    openQuickOpen()

    ;(document as unknown as FakeDocument).dispatchKeydown(keyEvent('Enter'))
    expect(openOrFocusFileSpy).toHaveBeenCalledWith('file-a')
    expect(focusSpy).not.toHaveBeenCalled()

    vi.runAllTimers()

    expect(focusSpy).toHaveBeenCalledTimes(1)
  })
})