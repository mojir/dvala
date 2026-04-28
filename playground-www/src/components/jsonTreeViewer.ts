// Generic JSON tree viewer with master-detail layout.
//
// The right panel hosts three "JSON-shaped" tools — AST, Tokens, CST — and
// they all benefit from the same UX: an expandable tree on top, plus a
// detail pane on the bottom that shows a formatted version of whichever
// node the user clicks. For AST that detail is the pretty-printed Dvala
// source; for tokens/CST it's the raw JSON of the selected subtree.
//
// We deliberately keep the tree itself "dumb" (no AST-specific shorthand
// or color coding — that lived in the previous astTreeViewer and got
// replaced with this on user request: "simpler tree-view of the JSON,
// not the fancy one as now"). Type-specific intelligence belongs in the
// `formatDetail` callback, not in the tree's rendering loop.

interface JsonTreeViewerOptions {
  /** The value to render. Supports objects, arrays, and primitives. */
  data: unknown
  /**
   * Formatter for the detail pane. Receives the value at the clicked node
   * (NOT a stringified copy — the original sub-value, so AST-aware
   * formatters can reflect on its structure). Defaults to
   * `JSON.stringify(value, null, 2)`.
   */
  formatDetail?: (selected: unknown) => string
  /**
   * @deprecated The detail pane is closed by default; the placeholder is
   * never visible. The option is kept for future tools that want an
   * open-by-default master-detail experience — currently unused.
   */
  detailPlaceholder?: string
  /**
   * Title shown in the detail pane's header bar (left of the close-X).
   * Lets each tool label its detail view ("Dvala source", "Token
   * detail", etc.). Empty string or omitted leaves the slot blank.
   */
  detailTitle?: string
  /**
   * Tree expansion depth at boot. `1` shows just the immediate children of
   * the root; `2` also expands each child once (so a tree of 3-tuples like
   * AST nodes shows the leading type string at-a-glance); etc. Default 2.
   */
  initialExpandDepth?: number
  /**
   * Optional click-target resolver. Called with the path of ancestor
   * values from root → clicked node (inclusive). Returns the value that
   * should be passed to `formatDetail`. Default: returns the last entry
   * (the clicked node itself).
   *
   * The AST tab uses this to walk up to the deepest enclosing AST node
   * when the user clicks an inner piece of an AST tuple (e.g. the type
   * label or the payload array) — the user's mental model is that every
   * row in the tree corresponds to "a node", but the JSON shape exposes
   * the 3-tuple internals as separate rows. Walking up keeps the click
   * affordance honest to the mental model without making the tree
   * AST-aware.
   */
  resolveDetailTarget?: (path: readonly unknown[]) => unknown
}

/** Public handle returned by `createJsonTreeViewer` — lets callers swap data
 *  in-place without rebuilding the whole DOM. Used by the right-panel
 *  refresh hook so a tab's state (collapsed/expanded subtrees, scroll) is
 *  unaffected when the user just edits the source. */
export interface JsonTreeViewerHandle {
  /** The wrapper element to mount in the DOM. */
  el: HTMLElement
  /** Replace the rendered data. Resets selection but preserves the wrapper
   *  element so callers can keep their reference. */
  update(data: unknown): void
}

interface NodeContext {
  /** Indent level for visual hierarchy. */
  depth: number
  /** Property name (object key) or index (array element) — null for the root. */
  label: string | null
  /** The value at this position. */
  value: unknown
  /**
   * Ancestor values from root → here (inclusive). Used by `resolveDetailTarget`
   * so a caller can walk up the path (e.g. AST tab → nearest enclosing AST
   * node) without the viewer needing to know about node shape.
   */
  path: readonly unknown[]
}

// Two levels of auto-expansion is the sweet spot for most JSON shapes the
// right panel renders: AST/CST nodes are arrays of `[type, payload, id]`,
// so depth-2 reveals the type string without forcing the user to click.
// For shallower data (e.g. tokens), it just expands a few extra entries.
const INITIAL_DEPTH_DEFAULT = 2

export function createJsonTreeViewer(options: JsonTreeViewerOptions): JsonTreeViewerHandle {
  const wrapper = document.createElement('div')
  wrapper.className = 'json-tree-viewer'

  // Tree pane — the master.
  const treeEl = document.createElement('div')
  treeEl.className = 'json-tree fancy-scroll'
  wrapper.appendChild(treeEl)

  // Splitter — drag-to-resize divider between tree and detail. Hidden
  // when the detail pane is closed. Created here so it sits between the
  // tree and detail in DOM order; drag handler is wired below once
  // `detailEl` exists.
  const splitter = document.createElement('div')
  splitter.className = 'json-tree__splitter'
  splitter.setAttribute('role', 'separator')
  splitter.setAttribute('aria-orientation', 'horizontal')
  wrapper.appendChild(splitter)

  // Detail pane — the slave. Closed by default; opens when a tree row is
  // clicked. The header hosts a single close-X that hides the pane again
  // (the user can re-summon by clicking a different row). The content
  // sub-element holds the formatted detail; we re-fill it on each click.
  const detailEl = document.createElement('div')
  detailEl.className = 'json-tree__detail'
  wrapper.appendChild(detailEl)

  // Default split: 60% tree, 40% detail. Tracked via inline style so the
  // splitter drag can update it without fighting CSS specificity.
  // Bounds (15%-85%) keep both panes reachable on extreme drags.
  const DEFAULT_TREE_PERCENT = 60
  const MIN_TREE_PERCENT = 15
  const MAX_TREE_PERCENT = 85
  let treePercent = DEFAULT_TREE_PERCENT

  function applyTreePercent(): void {
    // The tree is `flex: 1` (grow to fill) and the detail carries the
    // explicit basis. This way, when the detail is hidden via
    // `display: none`, the tree automatically expands to fill the full
    // height — no separate "tree at 100%" mode needed.
    treeEl.style.flex = '1 1 0'
    detailEl.style.flex = `0 0 ${100 - treePercent}%`
  }
  applyTreePercent()

  // Splitter drag — mousedown starts the gesture, listeners on document
  // (not splitter) so the cursor can leave the splitter without
  // releasing. We add a body-level "resizing" class to disable
  // text-selection during the drag (prevents the cursor from selecting
  // tree rows on the way back).
  splitter.addEventListener('mousedown', startEvt => {
    startEvt.preventDefault()
    const rect = wrapper.getBoundingClientRect()
    const startY = startEvt.clientY
    const startPercent = treePercent
    document.body.classList.add('json-tree-viewer-resizing')
    function onMove(evt: MouseEvent): void {
      const deltaY = evt.clientY - startY
      const deltaPercent = (deltaY / rect.height) * 100
      let next = startPercent + deltaPercent
      if (next < MIN_TREE_PERCENT) next = MIN_TREE_PERCENT
      if (next > MAX_TREE_PERCENT) next = MAX_TREE_PERCENT
      treePercent = next
      applyTreePercent()
    }
    function onUp(): void {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.classList.remove('json-tree-viewer-resizing')
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  const detailHeader = document.createElement('div')
  detailHeader.className = 'json-tree__detail-header'
  // Always render the title span — even when empty — so the CSS can rely
  // on a stable two-child layout (`title` flex:1 + `close` flex-shrink:0).
  // Removing the element when there's no title would break the close-X
  // alignment guarantee.
  const titleEl = document.createElement('span')
  titleEl.className = 'json-tree__detail-title'
  titleEl.textContent = options.detailTitle ?? ''
  detailHeader.appendChild(titleEl)
  const detailCloseBtn = document.createElement('button')
  detailCloseBtn.type = 'button'
  detailCloseBtn.className = 'json-tree__detail-close'
  detailCloseBtn.textContent = '×'
  detailCloseBtn.title = 'Close detail pane'
  detailCloseBtn.setAttribute('aria-label', 'Close detail pane')
  detailHeader.appendChild(detailCloseBtn)
  detailEl.appendChild(detailHeader)

  const detailContent = document.createElement('div')
  detailContent.className = 'json-tree__detail-content fancy-scroll'
  detailEl.appendChild(detailContent)

  const formatDetail = options.formatDetail ?? (v => JSON.stringify(v, null, 2))
  const initialDepth = options.initialExpandDepth ?? INITIAL_DEPTH_DEFAULT
  const resolveDetailTarget = options.resolveDetailTarget ?? (path => path[path.length - 1])

  function openDetailPane(): void {
    splitter.style.display = ''
    detailEl.style.display = ''
  }

  function closeDetailPane(): void {
    // Hide both the splitter and the detail pane so the tree expands to
    // fill the full height. Selection state on tree rows is also cleared
    // — there's no longer a "current node", and the highlight would
    // suggest otherwise on next open.
    splitter.style.display = 'none'
    detailEl.style.display = 'none'
    treeEl.querySelectorAll('.json-tree__node--selected').forEach(el => {
      el.classList.remove('json-tree__node--selected')
    })
  }

  detailCloseBtn.addEventListener('click', () => closeDetailPane())

  function showDetail(value: unknown): void {
    detailContent.innerHTML = ''
    const pre = document.createElement('pre')
    pre.className = 'json-tree__detail-code'
    try {
      pre.textContent = formatDetail(value)
    } catch (err) {
      // Defensive: a custom formatDetail (e.g. prettyPrint) might choke
      // on a non-AST sub-value the user happened to click. Fall back to
      // raw JSON instead of leaving the pane empty / broken.
      pre.textContent = `${JSON.stringify(value, null, 2)}\n\n(format error: ${err instanceof Error ? err.message : String(err)})`
    }
    detailContent.appendChild(pre)
    openDetailPane()
  }

  function selectNode(rowEl: HTMLElement, path: readonly unknown[]): void {
    treeEl.querySelectorAll('.json-tree__node--selected').forEach(el => {
      el.classList.remove('json-tree__node--selected')
    })
    rowEl.classList.add('json-tree__node--selected')
    showDetail(resolveDetailTarget(path))
  }

  // Render a single tree node. Returns a container (`<div>`) holding the
  // header row and (lazily-rendered) children. We render children eagerly
  // up to `initialDepth` so the user sees structure immediately; deeper
  // levels render the first time their parent is expanded.
  function renderNode(ctx: NodeContext): HTMLElement {
    const container = document.createElement('div')
    container.className = 'json-tree__container'

    const row = document.createElement('div')
    row.className = 'json-tree__node'
    row.style.paddingLeft = `${ctx.depth * 16}px`
    container.appendChild(row)

    const kind = classify(ctx.value)
    const expandable = kind === 'object' || kind === 'array'

    const arrow = document.createElement('span')
    arrow.className = 'json-tree__arrow'
    arrow.textContent = expandable ? '▶' : ' '
    row.appendChild(arrow)

    if (ctx.label !== null) {
      const labelEl = document.createElement('span')
      labelEl.className = 'json-tree__label'
      labelEl.textContent = `${ctx.label}: `
      row.appendChild(labelEl)
    }

    appendValueSummary(row, ctx.value, kind)

    // Whole row is clickable for detail — we want the user to see the
    // pretty-print of the value they clicked, even on leaves. Selection
    // bookkeeping lives in `selectNode`.
    row.addEventListener('click', evt => {
      // The arrow handles its own click for expand/collapse; let it fire
      // first (it stops propagation), which means we only get here for
      // clicks on the rest of the row.
      evt.stopPropagation()
      selectNode(row, ctx.path)
    })

    if (!expandable) return container

    const childrenEl = document.createElement('div')
    childrenEl.className = 'json-tree__children'
    container.appendChild(childrenEl)

    const shouldExpandNow = ctx.depth < initialDepth
    let childrenRendered = false
    if (shouldExpandNow) {
      renderChildrenInto(childrenEl, ctx, kind, ctx.depth + 1)
      childrenRendered = true
      arrow.textContent = '▼'
      arrow.classList.add('json-tree__arrow--open')
    } else {
      childrenEl.style.display = 'none'
    }

    arrow.style.cursor = 'pointer'
    arrow.addEventListener('click', evt => {
      evt.stopPropagation()
      const isOpen = childrenEl.style.display !== 'none'
      if (isOpen) {
        childrenEl.style.display = 'none'
        arrow.textContent = '▶'
        arrow.classList.remove('json-tree__arrow--open')
      } else {
        if (!childrenRendered) {
          renderChildrenInto(childrenEl, ctx, kind, ctx.depth + 1)
          childrenRendered = true
        }
        childrenEl.style.display = ''
        arrow.textContent = '▼'
        arrow.classList.add('json-tree__arrow--open')
      }
    })

    return container
  }

  function renderChildrenInto(
    parentEl: HTMLElement,
    parentCtx: NodeContext,
    kind: 'array' | 'object',
    childDepth: number,
  ): void {
    if (kind === 'array') {
      const arr = parentCtx.value as unknown[]
      arr.forEach((item, i) => {
        parentEl.appendChild(
          renderNode({ depth: childDepth, label: `[${i}]`, value: item, path: [...parentCtx.path, item] }),
        )
      })
    } else {
      const obj = parentCtx.value as Record<string, unknown>
      for (const key of Object.keys(obj)) {
        parentEl.appendChild(
          renderNode({ depth: childDepth, label: key, value: obj[key], path: [...parentCtx.path, obj[key]] }),
        )
      }
    }
  }

  function render(data: unknown): void {
    treeEl.innerHTML = ''
    treeEl.appendChild(renderNode({ depth: 0, label: null, value: data, path: [data] }))
    // Re-render = data changed (e.g. afterSwap → different file). Any
    // previously-shown detail is stale; close the pane so the user has
    // a clean slate. They re-summon by clicking the new tree.
    closeDetailPane()
  }

  // Initial state: detail closed. Become visible only after the first
  // node click, when the user explicitly asks to inspect a value.
  closeDetailPane()
  render(options.data)

  return {
    el: wrapper,
    update(data) {
      render(data)
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers — value classification + summary text
// ---------------------------------------------------------------------------

type ValueKind = 'array' | 'object' | 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'other'

function classify(value: unknown): ValueKind {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  const t = typeof value
  if (t === 'object') return 'object'
  if (t === 'string') return 'string'
  if (t === 'number') return 'number'
  if (t === 'boolean') return 'boolean'
  if (t === 'undefined') return 'undefined'
  return 'other'
}

function appendValueSummary(row: HTMLElement, value: unknown, kind: ValueKind): void {
  const summary = document.createElement('span')
  summary.className = `json-tree__value json-tree__value--${kind}`
  switch (kind) {
    case 'array': {
      const len = (value as unknown[]).length
      summary.textContent = `[${len} item${len === 1 ? '' : 's'}]`
      break
    }
    case 'object': {
      const len = Object.keys(value as Record<string, unknown>).length
      summary.textContent = `{${len} entr${len === 1 ? 'y' : 'ies'}}`
      break
    }
    case 'string':
      summary.textContent = JSON.stringify(value)
      break
    case 'number':
    case 'boolean':
      summary.textContent = String(value)
      break
    case 'null':
      summary.textContent = 'null'
      break
    case 'undefined':
      summary.textContent = 'undefined'
      break
    default:
      summary.textContent = String(value)
  }
  row.appendChild(summary)
}
