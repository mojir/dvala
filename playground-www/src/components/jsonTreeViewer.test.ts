// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createJsonTreeViewer } from './jsonTreeViewer'

beforeEach(() => {
  document.body.innerHTML = ''
})

function mount(handle: { el: HTMLElement }): HTMLElement {
  document.body.appendChild(handle.el)
  return handle.el
}

describe('createJsonTreeViewer — primitives', () => {
  it('renders a string value with the JSON-quoted summary', () => {
    const root = mount(createJsonTreeViewer({ data: 'hello' }))
    const value = root.querySelector('.json-tree__value--string')
    expect(value?.textContent).toBe('"hello"')
  })

  it('renders a number value', () => {
    const root = mount(createJsonTreeViewer({ data: 42 }))
    const value = root.querySelector('.json-tree__value--number')
    expect(value?.textContent).toBe('42')
  })

  it('renders booleans, null, and undefined with kind-specific classes', () => {
    const root1 = mount(createJsonTreeViewer({ data: true }))
    expect(root1.querySelector('.json-tree__value--boolean')?.textContent).toBe('true')

    document.body.innerHTML = ''
    const root2 = mount(createJsonTreeViewer({ data: null }))
    expect(root2.querySelector('.json-tree__value--null')?.textContent).toBe('null')

    document.body.innerHTML = ''
    const root3 = mount(createJsonTreeViewer({ data: undefined }))
    expect(root3.querySelector('.json-tree__value--undefined')?.textContent).toBe('undefined')
  })
})

describe('createJsonTreeViewer — arrays + objects', () => {
  it('summarizes arrays with their length', () => {
    const root = mount(createJsonTreeViewer({ data: [1, 2, 3] }))
    expect(root.querySelector('.json-tree__value--array')?.textContent).toBe('[3 items]')
  })

  it('uses singular item count for length-1 arrays', () => {
    const root = mount(createJsonTreeViewer({ data: ['only'] }))
    expect(root.querySelector('.json-tree__value--array')?.textContent).toBe('[1 item]')
  })

  it('summarizes objects with their entry count (singular form)', () => {
    const root = mount(createJsonTreeViewer({ data: { x: 1 } }))
    expect(root.querySelector('.json-tree__value--object')?.textContent).toBe('{1 entry}')
  })

  it('summarizes objects with their entry count (plural form)', () => {
    const root = mount(createJsonTreeViewer({ data: { x: 1, y: 2 } }))
    expect(root.querySelector('.json-tree__value--object')?.textContent).toBe('{2 entries}')
  })

  it('expands two levels deep by default, leaves anything deeper collapsed', () => {
    const root = mount(createJsonTreeViewer({ data: { outer: { inner: { leaf: 1 } } } }))
    // outer (depth 1) and inner (depth 2) ARE rendered.
    expect(root.textContent).toContain('outer')
    expect(root.textContent).toContain('inner')
    // The deepest "leaf" key is NOT rendered yet — it's at depth 3,
    // and initialExpandDepth defaults to 2 (sweet spot for AST tuples).
    expect(root.textContent).not.toContain('leaf')
  })

  it('respects an explicit `initialExpandDepth: 1` (collapse aggressively)', () => {
    const root = mount(
      createJsonTreeViewer({
        data: { outer: { inner: 'value' } },
        initialExpandDepth: 1,
      }),
    )
    expect(root.textContent).toContain('outer')
    // With depth 1 only the root expands — "inner" stays collapsed.
    expect(root.textContent).not.toContain('inner')
  })

  it('respects `initialExpandDepth` — depth 3 expands all of a 3-deep tree', () => {
    const root = mount(
      createJsonTreeViewer({
        data: { outer: { inner: { leaf: 1 } } },
        initialExpandDepth: 3,
      }),
    )
    expect(root.textContent).toContain('leaf')
  })

  it('clicking the arrow on a collapsed node expands its children', () => {
    const root = mount(
      // Three levels deep so the third level stays collapsed under the
      // default initialExpandDepth (2).
      createJsonTreeViewer({ data: { outer: { mid: { leaf: 'value' } } } }),
    )
    // Find any collapsed arrow; the only one should belong to the "mid"
    // object whose contents (the "leaf" key) live at depth 3.
    const collapsedArrow = Array.from(root.querySelectorAll<HTMLElement>('.json-tree__arrow')).find(
      el => el.textContent === '▶',
    )
    expect(collapsedArrow).toBeDefined()
    expect(root.textContent).not.toContain('leaf')
    collapsedArrow!.click()
    expect(root.textContent).toContain('leaf')
  })

  it('clicking the arrow on an expanded node collapses its children', () => {
    const root = mount(createJsonTreeViewer({ data: { outer: 'value' }, initialExpandDepth: 1 }))
    // Root (outer object) starts expanded, so the "outer" key is visible.
    expect(root.textContent).toContain('outer')
    const rootArrow = root.querySelector<HTMLElement>('.json-tree__arrow--open')
    expect(rootArrow).not.toBeNull()
    rootArrow!.click()
    // After collapse, the children container is display:none — but the
    // text content stays in DOM. Check the arrow flipped instead.
    expect(rootArrow!.textContent).toBe('▶')
  })
})

describe('createJsonTreeViewer — detail pane (master-detail)', () => {
  it('renders an optional `detailTitle` in the header bar', () => {
    const root = mount(createJsonTreeViewer({ data: { x: 1 }, detailTitle: 'Dvala source' }))
    const title = root.querySelector('.json-tree__detail-title')
    expect(title?.textContent).toBe('Dvala source')
  })

  it('renders an empty title element when no `detailTitle` is provided (stable header layout)', () => {
    // We always render the title span — even when blank — so the
    // header's flex layout (`title flex:1` + `close flex-shrink:0`) is
    // stable regardless of whether the caller passes a title.
    const root = mount(createJsonTreeViewer({ data: { x: 1 } }))
    const title = root.querySelector('.json-tree__detail-title')
    expect(title).not.toBeNull()
    expect(title?.textContent).toBe('')
  })

  it('starts with the detail pane closed (hidden)', () => {
    const root = mount(createJsonTreeViewer({ data: { x: 1 } }))
    const detail = root.querySelector<HTMLElement>('.json-tree__detail')
    expect(detail?.style.display).toBe('none')
    const splitter = root.querySelector<HTMLElement>('.json-tree__splitter')
    expect(splitter?.style.display).toBe('none')
  })

  it('clicking a node opens the detail pane', () => {
    const root = mount(createJsonTreeViewer({ data: { x: 1 } }))
    const detail = root.querySelector<HTMLElement>('.json-tree__detail')!
    const splitter = root.querySelector<HTMLElement>('.json-tree__splitter')!
    expect(detail.style.display).toBe('none')
    const xRow = Array.from(root.querySelectorAll<HTMLElement>('.json-tree__node')).find(r =>
      r.textContent?.includes('x:'),
    )
    xRow!.click()
    expect(detail.style.display).not.toBe('none')
    expect(splitter.style.display).not.toBe('none')
  })

  it('clicking the close-X hides the detail pane and clears selection', () => {
    const root = mount(createJsonTreeViewer({ data: { x: 1 } }))
    // Open by clicking a node.
    const xRow = Array.from(root.querySelectorAll<HTMLElement>('.json-tree__node')).find(r =>
      r.textContent?.includes('x:'),
    )!
    xRow.click()
    expect(xRow.classList.contains('json-tree__node--selected')).toBe(true)
    const closeBtn = root.querySelector<HTMLButtonElement>('.json-tree__detail-close')!
    closeBtn.click()
    const detail = root.querySelector<HTMLElement>('.json-tree__detail')!
    expect(detail.style.display).toBe('none')
    // Selection cleared so the highlight doesn't suggest a "current" node.
    expect(xRow.classList.contains('json-tree__node--selected')).toBe(false)
  })

  it('update() resets the detail pane to closed', () => {
    const handle = createJsonTreeViewer({ data: { first: 1 } })
    mount(handle)
    const xRow = Array.from(handle.el.querySelectorAll<HTMLElement>('.json-tree__node')).find(r =>
      r.textContent?.includes('first:'),
    )!
    xRow.click()
    const detail = handle.el.querySelector<HTMLElement>('.json-tree__detail')!
    expect(detail.style.display).not.toBe('none')

    handle.update({ second: 2 })
    expect(detail.style.display).toBe('none')
  })

  it('clicking a node renders its JSON in the detail pane (default formatter)', () => {
    const root = mount(createJsonTreeViewer({ data: { x: 1, y: 2 } }))
    // Top-level object is expanded; click the "x: 1" row.
    const rows = root.querySelectorAll<HTMLElement>('.json-tree__node')
    const xRow = Array.from(rows).find(r => r.textContent?.includes('x:'))
    expect(xRow).toBeDefined()
    xRow!.click()
    const detail = root.querySelector('.json-tree__detail-code')
    expect(detail?.textContent).toBe('1')
  })

  it('passes the original sub-value to a custom `formatDetail` (not a stringified copy)', () => {
    const formatDetail = vi.fn().mockReturnValue('formatted')
    const data = { node: { kind: 'special', payload: 42 } }
    const root = mount(createJsonTreeViewer({ data, formatDetail }))
    const rows = root.querySelectorAll<HTMLElement>('.json-tree__node')
    const nodeRow = Array.from(rows).find(r => r.textContent?.includes('node:'))
    nodeRow!.click()
    expect(formatDetail).toHaveBeenCalledWith(data.node)
    const detail = root.querySelector('.json-tree__detail-code')
    expect(detail?.textContent).toBe('formatted')
  })

  it('passes the ancestor path to `resolveDetailTarget` when configured', () => {
    // Path is root → ... → clicked node (inclusive). Lets callers walk up
    // to a richer enclosing structure (used by the AST tab to find the
    // nearest enclosing 3-tuple node).
    const resolveDetailTarget = vi.fn().mockImplementation((path: readonly unknown[]) => path[0])
    const formatDetail = vi.fn().mockReturnValue('root-detail')
    const data = { node: { kind: 'special' } }
    const root = mount(createJsonTreeViewer({ data, formatDetail, resolveDetailTarget }))
    const kindRow = Array.from(root.querySelectorAll<HTMLElement>('.json-tree__node')).find(r =>
      r.textContent?.includes('kind:'),
    )
    expect(kindRow).toBeDefined()
    kindRow!.click()
    // Path: [data, data.node, "special"].
    expect(resolveDetailTarget).toHaveBeenCalledWith([data, data.node, 'special'])
    // Resolver returned data; formatDetail should have received that.
    expect(formatDetail).toHaveBeenCalledWith(data)
    expect(root.querySelector('.json-tree__detail-code')?.textContent).toBe('root-detail')
  })

  it('falls back to JSON.stringify when `formatDetail` throws', () => {
    const formatDetail = () => {
      throw new Error('boom')
    }
    const root = mount(createJsonTreeViewer({ data: { x: 1 }, formatDetail }))
    const rows = root.querySelectorAll<HTMLElement>('.json-tree__node')
    const xRow = Array.from(rows).find(r => r.textContent?.includes('x:'))
    xRow!.click()
    const detail = root.querySelector('.json-tree__detail-code')
    expect(detail?.textContent).toContain('1')
    expect(detail?.textContent).toContain('format error: boom')
  })

  it('selecting a new node deselects the previous one', () => {
    const root = mount(createJsonTreeViewer({ data: { x: 1, y: 2 } }))
    const rows = root.querySelectorAll<HTMLElement>('.json-tree__node')
    const xRow = Array.from(rows).find(r => r.textContent?.includes('x:'))!
    const yRow = Array.from(rows).find(r => r.textContent?.includes('y:'))!
    xRow.click()
    expect(xRow.classList.contains('json-tree__node--selected')).toBe(true)
    yRow.click()
    expect(xRow.classList.contains('json-tree__node--selected')).toBe(false)
    expect(yRow.classList.contains('json-tree__node--selected')).toBe(true)
  })
})

describe('createJsonTreeViewer — update()', () => {
  it('replaces the rendered data and closes the detail pane', () => {
    const handle = createJsonTreeViewer({ data: { first: 1 } })
    mount(handle)
    expect(handle.el.textContent).toContain('first')

    const xRow = Array.from(handle.el.querySelectorAll<HTMLElement>('.json-tree__node')).find(r =>
      r.textContent?.includes('first:'),
    )!
    xRow.click()
    const detail = handle.el.querySelector<HTMLElement>('.json-tree__detail')!
    expect(detail.style.display).not.toBe('none')

    handle.update({ second: 2 })
    expect(handle.el.textContent).toContain('second')
    expect(handle.el.textContent).not.toContain('first')
    expect(detail.style.display).toBe('none')
  })
})

describe('createJsonTreeViewer — splitter resize', () => {
  it('drag-resize updates flex-basis on tree + detail', () => {
    const handle = createJsonTreeViewer({ data: { x: 1 } })
    mount(handle)
    // Open the detail pane so the splitter is visible / draggable.
    const xRow = Array.from(handle.el.querySelectorAll<HTMLElement>('.json-tree__node')).find(r =>
      r.textContent?.includes('x:'),
    )!
    xRow.click()

    const tree = handle.el.querySelector<HTMLElement>('.json-tree')!
    const detail = handle.el.querySelector<HTMLElement>('.json-tree__detail')!
    // Tree is always `flex: 1` (grows to fill). The detail carries the
    // explicit basis. This way the tree fills the full height when the
    // detail is hidden — see the "tree fills full height" test below.
    expect(tree.style.flex).toMatch(/^1 1 0(?:px)?$/)
    expect(detail.style.flex).toContain('40%')

    // Stub getBoundingClientRect so deltaY → percent conversion is
    // deterministic (jsdom-like envs return zero rects otherwise).
    const wrapper = handle.el
    Object.defineProperty(wrapper, 'getBoundingClientRect', {
      value: () => ({
        height: 100,
        top: 0,
        left: 0,
        right: 0,
        bottom: 100,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => null,
      }),
      configurable: true,
    })
    const splitter = handle.el.querySelector<HTMLElement>('.json-tree__splitter')!
    const downEvt = new MouseEvent('mousedown', { clientY: 50, bubbles: true, cancelable: true })
    splitter.dispatchEvent(downEvt)
    // Drag down 20px → tree grows (now 80% of wrapper) → detail's
    // basis shrinks to 20%. Tree's `flex: 1` consumes the rest.
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 70 }))
    expect(tree.style.flex).toMatch(/^1 1 0(?:px)?$/)
    expect(detail.style.flex).toContain('20%')
    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('clamps the tree percent within [15, 85]', () => {
    const handle = createJsonTreeViewer({ data: { x: 1 } })
    mount(handle)
    const xRow = Array.from(handle.el.querySelectorAll<HTMLElement>('.json-tree__node')).find(r =>
      r.textContent?.includes('x:'),
    )!
    xRow.click()
    Object.defineProperty(handle.el, 'getBoundingClientRect', {
      value: () => ({
        height: 100,
        top: 0,
        left: 0,
        right: 0,
        bottom: 100,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => null,
      }),
      configurable: true,
    })
    const splitter = handle.el.querySelector<HTMLElement>('.json-tree__splitter')!
    splitter.dispatchEvent(new MouseEvent('mousedown', { clientY: 50, bubbles: true, cancelable: true }))
    // Drag well past the upper bound — tree clamps at 85%, so detail's
    // basis clamps at 15%.
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 999 }))
    const detail = handle.el.querySelector<HTMLElement>('.json-tree__detail')!
    expect(detail.style.flex).toContain('15%')
    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('tree fills full height when the detail pane is closed', () => {
    const handle = createJsonTreeViewer({ data: { x: 1 } })
    mount(handle)
    // Open then close the detail.
    const xRow = Array.from(handle.el.querySelectorAll<HTMLElement>('.json-tree__node')).find(r =>
      r.textContent?.includes('x:'),
    )!
    xRow.click()
    const closeBtn = handle.el.querySelector<HTMLButtonElement>('.json-tree__detail-close')!
    closeBtn.click()
    // Tree's flex stays `1 1 0` (grow to fill). Detail is `display:none`
    // so it contributes no layout space — flexbox auto-expands the
    // tree to take up everything.
    const tree = handle.el.querySelector<HTMLElement>('.json-tree')!
    const detail = handle.el.querySelector<HTMLElement>('.json-tree__detail')!
    expect(tree.style.flex).toMatch(/^1 1 0(?:px)?$/)
    expect(detail.style.display).toBe('none')
  })
})
