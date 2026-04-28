// Right-panel tools — AST / Tokens / CST tabs.
//
// The right panel hosts three "JSON-shaped" inspection tools. All three
// tabs are always present in the strip — clicking switches between them,
// and the active one auto-refreshes whenever the editor's active file
// changes. Toolbar actions (parse / tokenize / cst) and a `Cmd+Shift+J`
// toggle open the panel directly to a specific tab.
//
// Pipelines run silently — errors render in-pane instead of spamming the
// Output channel, since auto-refresh would otherwise produce one error
// log per file swap on broken code.
//
// Ownership: this module owns the rendering of right-panel tabs and the
// caching of their JsonTreeViewer handles. `scripts.ts` calls
// `showAstInRightPanel` / `showTokensInRightPanel` / `showCstInRightPanel`
// from the existing `parse()` / `tokenize()` / `parseCst()` entry points,
// and `refreshActiveRightPanelTab` from the `afterSwap` hook + the right
// panel's `onChange` callback.

import type { Ast } from '../../../src/parser/types'
import { buildDocTree, parseToCst, parseTokenStream, tokenizeSource } from '../../../src/tooling'
import { prettyPrint } from '../../../src/prettyPrint'
import type { JsonTreeViewerHandle } from '../components/jsonTreeViewer'
import { createJsonTreeViewer } from '../components/jsonTreeViewer'
import { getRightPanel } from './panelInstances'

type RightPanelToolId = 'tokens' | 'ast' | 'cst' | 'doc'

function isToolId(id: string | null): id is RightPanelToolId {
  return id === 'tokens' || id === 'ast' || id === 'cst' || id === 'doc'
}

// Tab order: pipeline order, left-to-right. Tokens come first because
// they're the bottom of the stack (the parser consumes them); AST and
// CST are sibling parses on top; the Wadler-Lindig Doc tree is the
// formatter's IR, derived from the CST.
export const RIGHT_PANEL_TOOL_TABS = [
  {
    id: 'tokens' as const,
    label: 'Tokens',
    title: 'Token stream of the active file',
  },
  {
    id: 'ast' as const,
    label: 'AST',
    title: 'Parsed abstract syntax tree of the active file',
  },
  {
    id: 'cst' as const,
    label: 'CST',
    title: 'Concrete syntax tree (with trivia) of the active file',
  },
  {
    id: 'doc' as const,
    label: 'Doc Tree',
    title: 'Wadler-Lindig Doc tree (formatter IR) of the active file',
  },
]

// Cached viewer handles per tab. `update()` keeps the user's expand/collapse
// state intact when only the data changed (e.g. afterSwap refresh) — much
// nicer than rebuilding the tree from scratch every time.
const handles = new Map<RightPanelToolId, JsonTreeViewerHandle>()

function setBody(toolId: RightPanelToolId, data: unknown): void {
  const panel = getRightPanel()
  let handle = handles.get(toolId)
  if (handle) {
    handle.update(data)
  } else {
    handle = createJsonTreeViewer({
      data,
      ...detailOptions(toolId),
    })
    handles.set(toolId, handle)
    panel.setTabBody(toolId, handle.el)
  }
}

function detailOptions(toolId: RightPanelToolId): {
  formatDetail?: (selected: unknown) => string
  resolveDetailTarget?: (path: readonly unknown[]) => unknown
  detailTitle: string
} {
  if (toolId === 'ast') {
    // AST nodes have a known shape — pretty-print them as Dvala source.
    // The user thinks of every tree row as "a node" but the JSON shape
    // exposes the 3-tuple internals (type label, payload, id) as separate
    // rows. `resolveDetailTarget` walks up the path to the deepest
    // enclosing AST-shaped tuple so any click yields useful Dvala output.
    return {
      formatDetail: prettyPrint,
      resolveDetailTarget: nearestAstNode,
      detailTitle: 'Dvala source',
    }
  }
  if (toolId === 'tokens') return { detailTitle: 'Token' }
  if (toolId === 'cst') return { detailTitle: 'CST node' }
  return { detailTitle: 'Doc node' }
}

/**
 * Heuristic: an AST node is a 3-element array `[type:string, payload:any,
 * nodeId:number]`. Used to resolve clicks on inner elements (the type
 * label / payload / id) up to their enclosing node — that's the value
 * `prettyPrint` knows how to render.
 */
function isAstNode(v: unknown): boolean {
  return Array.isArray(v) && v.length === 3 && typeof v[0] === 'string' && typeof v[2] === 'number'
}

function nearestAstNode(path: readonly unknown[]): unknown {
  // Walk from leaf back toward root and return the first AST-shaped
  // ancestor we hit. Falls back to the clicked value (the leaf) if no
  // AST node lies on the path — the user gets JSON-fallback output via
  // the JsonTreeViewer's prettyPrint try/catch in that edge case.
  for (let i = path.length - 1; i >= 0; i--) {
    if (isAstNode(path[i])) return path[i]
  }
  return path[path.length - 1]
}

function showError(toolId: RightPanelToolId, err: unknown): void {
  // Render the error inside the tab body so the user sees what's wrong
  // without us spamming the Output channel on every keystroke / tab swap.
  const message = err instanceof Error ? err.message : String(err)
  const el = document.createElement('div')
  el.className = 'right-panel-tool-error'
  el.textContent = message
  getRightPanel().setTabBody(toolId, el)
  // Drop the cached handle so the next successful run rebuilds the viewer
  // (otherwise we'd try to .update() on a viewer that's no longer in DOM).
  handles.delete(toolId)
}

// Compute an AST / token stream / CST. These are tiny wrappers around the
// public tooling so showAst/Tokens/Cst can share their entry points.
//
// We strip non-JSON metadata before handing the data to the viewer:
//   - `Ast.sourceMap` / `typeAnnotations` etc. are JS `Map`s that render
//     as empty objects in a generic JSON tree — noise for the user.
//   - `Ast.body` is the array of top-level statement nodes — that's what
//     "the AST" means to anyone inspecting it.
function computeAst(code: string): unknown {
  const tokens = tokenizeSource(code, true) // debug:true for source-map positions
  const ast: Ast = parseTokenStream(tokens)
  return ast.body
}
function computeTokens(code: string): unknown {
  // tokenizeSource returns `{ tokens, filePath, source }` in debug mode.
  // The user really wants to inspect the token stream itself; the wrapper
  // metadata is noise that pushes token types two levels deeper than the
  // viewer's default expand depth.
  return tokenizeSource(code, true).tokens
}
function computeCst(code: string): unknown {
  const tokens = tokenizeSource(code, true)
  const { tree, trailingTrivia } = parseToCst(tokens)
  return { tree, trailingTrivia }
}
function computeDocTree(code: string): unknown {
  const tokens = tokenizeSource(code, true)
  const { tree, trailingTrivia } = parseToCst(tokens)
  return buildDocTree(tree, trailingTrivia)
}

function compute(toolId: RightPanelToolId, code: string): unknown {
  switch (toolId) {
    case 'tokens':
      return computeTokens(code)
    case 'ast':
      return computeAst(code)
    case 'cst':
      return computeCst(code)
    case 'doc':
      return computeDocTree(code)
  }
}

// ---------------------------------------------------------------------------
// Public: per-tool show (called from parse / tokenize / parseCst)
// ---------------------------------------------------------------------------

/** Compute the AST for `code`, activate the AST tab, and uncollapse. */
export function showAstInRightPanel(code: string): void {
  showTool('ast', code)
}
/** Compute the token stream for `code`, activate the Tokens tab, uncollapse. */
export function showTokensInRightPanel(code: string): void {
  showTool('tokens', code)
}
/** Compute the CST for `code`, activate the CST tab, uncollapse. */
export function showCstInRightPanel(code: string): void {
  showTool('cst', code)
}
/** Compute the Wadler-Lindig Doc tree for `code`, activate the Doc Tree tab. */
export function showDocTreeInRightPanel(code: string): void {
  showTool('doc', code)
}

function showTool(toolId: RightPanelToolId, code: string): void {
  const panel = getRightPanel()
  panel.setActive(toolId)
  panel.setCollapsed(false)
  try {
    setBody(toolId, compute(toolId, code))
  } catch (err) {
    showError(toolId, err)
  }
}

// ---------------------------------------------------------------------------
// Public: refresh whatever tool is currently active
// ---------------------------------------------------------------------------

/**
 * Re-run the currently-active tool against the active file's code. Called
 * from the editor-tab `afterSwap` hook (when the user changes file) and
 * from the right panel's own `onChange` callback (when the user clicks
 * a different tab or uncollapses the panel). No-op when the panel is
 * collapsed — there's nothing to refresh against.
 *
 * `getActiveCode` is injected so this module doesn't need to reach into
 * scripts.ts directly. The boot wiring passes `() => getState('dvala-code')`.
 */
export function refreshActiveRightPanelTab(getActiveCode: () => string): void {
  const panel = getRightPanel()
  if (panel.isCollapsed()) return
  const tabId = panel.getActiveTabId()
  if (!isToolId(tabId)) return
  const code = getActiveCode()
  try {
    setBody(tabId, compute(tabId, code))
  } catch (err) {
    showError(tabId, err)
  }
}
