/**
 * AST Tree Viewer — collapsible tree component for the parse modal.
 *
 * Renders an AST as an expandable tree with:
 * - Color-coded node types using --syntax-* CSS variables
 * - Click to expand/collapse subtrees
 * - Search/filter by node type or text
 * - Click node → highlight source range (via source map)
 * - Copy subtree as JSON
 */

import type { Ast, AstNode, SourceMap } from '../../../src/parser/types'

/** A tree node — either an AstNode or a BindingTarget (same [type, payload, id] shape). */
type TreeNode = [string, unknown, number]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TreeViewerOptions {
  ast: Ast
  onSelectNode?: (nodeId: number, sourceMap: SourceMap) => void
}

// ---------------------------------------------------------------------------
// Node type → color class mapping
// ---------------------------------------------------------------------------

const nodeColorMap: Record<string, string> = {
  Number: 'var(--syntax-number)',
  String: 'var(--syntax-string)',
  TemplateString: 'var(--syntax-string)',
  Call: 'var(--syntax-builtin)',
  SpecialExpression: 'var(--syntax-keyword)',
  Sym: 'var(--syntax-symbol)',
  Builtin: 'var(--syntax-builtin)',
  Special: 'var(--syntax-keyword)',
  Reserved: 'var(--syntax-keyword)',
  Binding: 'var(--syntax-keyword)',
  Spread: 'var(--syntax-punctuation)',
  Effect: 'var(--syntax-effect)',
  // Binding target types
  symbol: 'var(--syntax-symbol)',
  object: 'var(--syntax-punctuation)',
  array: 'var(--syntax-punctuation)',
  rest: 'var(--syntax-symbol)',
  wildcard: 'var(--syntax-keyword)',
  literal: 'var(--syntax-number)',
}

function getNodeColor(nodeType: string): string {
  return nodeColorMap[nodeType] ?? 'var(--color-text)'
}

// ---------------------------------------------------------------------------
// Summary text for a node (shown on the collapsed line)
// ---------------------------------------------------------------------------

function getNodeSummary(node: TreeNode): string {
  const [type, payload] = node

  switch (type) {
    case 'Num':
      return `${payload}`
    case 'Str':
      return `"${truncate(payload as string, 40)}"`
    case 'Sym':
    case 'Builtin':
    case 'Special':
    case 'Reserved':
      return `${payload}`
    case 'Effect':
      return `@${payload}`
    case 'Call': {
      const [fnNode, args] = payload as [AstNode, AstNode[]]
      const fnName = fnNode[0] === 'Builtin' || fnNode[0] === 'Sym'
        ? fnNode[1] as string
        : fnNode[0]
      return `${fnName}(${args.length} arg${args.length !== 1 ? 's' : ''})`
    }
    case 'SpecialExpression': {
      const [name] = payload as [string, ...unknown[]]
      return `${name}`
    }
    case 'TemplateString': {
      const segments = payload as unknown[]
      return `\`...\` (${segments.length} segment${segments.length !== 1 ? 's' : ''})`
    }
    case 'Binding':
      return ''
    case 'Spread':
      return '...'
    // Binding target types
    case 'symbol': {
      const [symbolNode] = payload as [AstNode]
      return `${symbolNode[1]}`
    }
    case 'object':
      return '{...}'
    case 'array':
      return '[...]'
    case 'rest': {
      const [name] = payload as [string]
      return `...${name}`
    }
    case 'wildcard':
      return '_'
    case 'literal':
      return ''
    default:
      return ''
  }
}

function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : `${s.slice(0, maxLen - 1)}…`
}

// ---------------------------------------------------------------------------
// Check if a node is a leaf (no expandable children)
// ---------------------------------------------------------------------------

function isLeafNode(node: TreeNode): boolean {
  const type = node[0]
  return type === 'Num'
    || type === 'Str'
    || type === 'Sym'
    || type === 'Builtin'
    || type === 'Special'
    || type === 'Reserved'
    || type === 'Effect'
    || type === 'symbol'
    || type === 'rest'
    || type === 'wildcard'
}

// ---------------------------------------------------------------------------
// Get child nodes for expansion
// ---------------------------------------------------------------------------

interface ChildEntry {
  label: string | null
  node: TreeNode
}

function getChildren(node: TreeNode): ChildEntry[] {
  const [type, payload] = node
  const children: ChildEntry[] = []

  switch (type) {
    case 'Call': {
      const [fnNode, args] = payload as [AstNode, AstNode[]]
      children.push({ label: 'fn', node: fnNode })
      args.forEach((arg, i) => children.push({ label: args.length > 1 ? `arg${i}` : 'arg', node: arg }))
      break
    }
    case 'SpecialExpression':
      getSpecialExpressionChildren(payload as [string, ...unknown[]], children)
      break
    case 'TemplateString': {
      const segments = payload as AstNode[]
      segments.forEach(seg => children.push({ label: null, node: seg }))
      break
    }
    case 'Binding': {
      const [target, value] = payload as [BindingTargetTuple, AstNode]
      addBindingTarget(target, children, null)
      children.push({ label: 'value', node: value })
      break
    }
    case 'Spread':
      children.push({ label: null, node: payload as AstNode })
      break
    // Binding target types
    case 'object':
    case 'array':
    case 'literal':
      return getBindingTargetNodeChildren(node as unknown as BindingTargetTuple)
  }

  return children
}

function getSpecialExpressionChildren(parts: [string, ...unknown[]], children: ChildEntry[]): void {
  const name = parts[0]

  switch (name) {
    case 'if': {
      // ["if", [condition, then, else?]]
      const [cond, thenBranch, elseBranch] = parts[1] as [AstNode, AstNode, AstNode?]
      children.push({ label: 'condition', node: cond })
      children.push({ label: 'then', node: thenBranch })
      if (elseBranch) children.push({ label: 'else', node: elseBranch })
      break
    }
    case 'let': {
      // ["let", BindingNode]
      const binding = parts[1] as AstNode
      children.push({ label: null, node: binding })
      break
    }
    case 'block': {
      // ["block", AstNode[], null]
      const bodyExprs = parts[1] as AstNode[]
      bodyExprs.forEach(expr => children.push({ label: null, node: expr }))
      break
    }
    case 'function': {
      // ["function", [BindingTarget[], AstNode[]]]
      const [params, body] = parts[1] as [BindingTargetTuple[], AstNode[]]
      params.forEach(p => addBindingTarget(p, children, 'param'))
      body.forEach((expr, i) => children.push({ label: body.length > 1 ? `body${i}` : 'body', node: expr }))
      break
    }
    case 'handle': {
      // ["handle", [AstNode[]], AstNode]
      const bodyExprs = parts[1] as AstNode[]
      const handler = parts[2] as AstNode
      bodyExprs.forEach(expr => children.push({ label: 'body', node: expr }))
      children.push({ label: 'handler', node: handler })
      break
    }
    case 'perform': {
      // ["perform", effectExpr, argExpr?]
      const effectExpr = parts[1] as AstNode
      const argExpr = parts[2] as AstNode | undefined
      children.push({ label: 'effect', node: effectExpr })
      if (argExpr) children.push({ label: 'arg', node: argExpr })
      break
    }
    case 'loop': {
      // ["loop", BindingNode[], bodyExpr]
      const bindings = parts[1] as TreeNode[]
      const body = parts[2] as TreeNode
      bindings.forEach(b => children.push({ label: 'binding', node: b }))
      children.push({ label: 'body', node: body })
      break
    }
    case 'for': {
      // ["for", LoopBindingNode[], bodyExpr]
      // LoopBindingNode = [BindingNode, BindingNode[], when?, while?]
      const loopBindings = parts[1] as unknown[][]
      const body = parts[2] as TreeNode
      for (const lb of loopBindings) {
        const binding = lb[0]
        if (isAstNode(binding)) children.push({ label: 'binding', node: binding as TreeNode })
        const letBindings = lb[1] as TreeNode[]
        if (letBindings) letBindings.forEach(b => { if (isAstNode(b)) children.push({ label: 'let', node: b }) })
        const whenClause = lb[2] as TreeNode | undefined
        if (whenClause && isAstNode(whenClause)) children.push({ label: 'when', node: whenClause })
        const whileClause = lb[3] as TreeNode | undefined
        if (whileClause && isAstNode(whileClause)) children.push({ label: 'while', node: whileClause })
      }
      children.push({ label: 'body', node: body })
      break
    }
    case 'match': {
      // ["match", valueExpr, [MatchCase...]]
      // MatchCase = [BindingTarget, bodyExpr, guard?]
      const value = parts[1] as TreeNode
      const cases = parts[2] as unknown[][]
      children.push({ label: 'value', node: value })
      cases.forEach((c, i) => {
        const pattern = c[0] as BindingTargetTuple
        const body = c[1] as AstNode
        const guard = c[2] as AstNode | undefined
        const caseLabel = `case${cases.length > 1 ? i : ''}`
        addBindingTarget(pattern, children, null)
        if (guard && isAstNode(guard)) children.push({ label: `${caseLabel}.guard`, node: guard })
        children.push({ label: `${caseLabel}.body`, node: body })
      })
      break
    }
    case 'object': {
      // ["object", AstNode[]] — alternating key, value pairs (or spread nodes)
      const entries = parts[1] as AstNode[]
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!
        if (entry[0] === 'Spread') {
          children.push({ label: null, node: entry })
        } else {
          children.push({ label: 'key', node: entry })
          i++
          if (i < entries.length) children.push({ label: 'value', node: entries[i]! })
        }
      }
      break
    }
    // Simple list-of-nodes expressions
    case '&&':
    case '||':
    case '??':
    case 'array':
    case 'recur':
    case 'parallel':
    case 'race': {
      const nodes = parts[1] as AstNode[]
      nodes.forEach(n => children.push({ label: null, node: n }))
      break
    }
    // Leaf special expressions (no AST children)
    case 'import':
    case 'effect':
      break
    default: {
      // Fallback: walk payload for any AstNodes
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i]
        if (part === null || part === undefined) continue
        if (isAstNode(part)) {
          children.push({ label: null, node: part as AstNode })
        } else if (Array.isArray(part)) {
          for (const child of part as unknown[]) {
            if (isAstNode(child)) children.push({ label: null, node: child as AstNode })
          }
        }
      }
    }
  }
}

type BindingTargetTuple = [string, unknown[], number]

function isAstNode(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && typeof value[0] === 'string' && typeof value[2] === 'number'
}

/** Push the binding target itself as a visible node in the tree. */
function addBindingTarget(target: BindingTargetTuple, children: ChildEntry[], label: string | null): void {
  // Binding targets have the same [type, payload, nodeId] shape as AstNodes
  children.push({ label, node: target as unknown as TreeNode })
}

/** Get children OF a binding target node (for expansion). */
function getBindingTargetNodeChildren(target: BindingTargetTuple): ChildEntry[] {
  const [targetType, payload] = target
  const children: ChildEntry[] = []
  switch (targetType) {
    case 'array': {
      const [elements] = payload as [(BindingTargetTuple | null)[]]
      elements.forEach(el => {
        if (el) addBindingTarget(el, children, null)
      })
      break
    }
    case 'object': {
      const [entries] = payload as [Record<string, BindingTargetTuple>]
      for (const [key, val] of Object.entries(entries)) {
        addBindingTarget(val, children, key)
      }
      break
    }
    case 'literal': {
      const [expr] = payload as [AstNode]
      children.push({ label: null, node: expr })
      break
    }
    // symbol, rest, wildcard: leaf nodes
  }
  return children
}

// ---------------------------------------------------------------------------
// Search matching
// ---------------------------------------------------------------------------

function nodeMatchesSearch(node: TreeNode, query: string, label?: string | null): boolean {
  const [type, payload] = node
  const lowerQuery = query.toLowerCase()
  if (label && label.toLowerCase().includes(lowerQuery)) return true
  if (type.toLowerCase().includes(lowerQuery)) return true
  if (typeof payload === 'string' && payload.toLowerCase().includes(lowerQuery)) return true
  if (typeof payload === 'number' && `${payload}`.includes(query)) return true
  if (type === 'Call') {
    const fnNode = (payload as [AstNode, AstNode[]])[0]
    if (typeof fnNode[1] === 'string' && fnNode[1].toLowerCase().includes(lowerQuery)) return true
  }
  if (type === 'SpecialExpression') {
    const name = (payload as [string])[0]
    if (name.toLowerCase().includes(lowerQuery)) return true
  }
  return false
}

function treeContainsMatch(node: TreeNode, query: string, label?: string | null): boolean {
  if (nodeMatchesSearch(node, query, label)) return true
  return getChildren(node).some(c => treeContainsMatch(c.node, query, c.label))
}

// ---------------------------------------------------------------------------
// Render tree
// ---------------------------------------------------------------------------

function renderNode(
  node: TreeNode,
  label: string | null,
  depth: number,
  options: TreeViewerOptions,
  searchQuery: string,
): HTMLElement {
  if (!Array.isArray(node) || node.length < 2) {
    const el = document.createElement('div')
    el.textContent = `[invalid node: ${JSON.stringify(node)}]`
    el.style.color = 'var(--syntax-error)'
    return el
  }

  const row = document.createElement('div')
  row.className = 'ast-tree__node'
  row.style.paddingLeft = `${depth * 16}px`

  const nodeId = node[2]
  const type = node[0]
  const leaf = isLeafNode(node)
  const children = leaf ? [] : getChildren(node)
  const hasChildren = children.length > 0
  const summary = getNodeSummary(node)
  const matchesSearch = searchQuery && nodeMatchesSearch(node, searchQuery, label)

  // Toggle arrow
  const arrow = document.createElement('span')
  arrow.className = 'ast-tree__arrow'
  arrow.textContent = hasChildren ? '▶' : ' '
  row.appendChild(arrow)

  // Label (e.g. "fn:", "arg0:")
  if (label) {
    const labelEl = document.createElement('span')
    labelEl.className = 'ast-tree__label'
    labelEl.textContent = `${label}: `
    row.appendChild(labelEl)
  }

  // Node type badge
  const typeEl = document.createElement('span')
  typeEl.className = 'ast-tree__type'
  typeEl.style.color = getNodeColor(type)
  typeEl.textContent = type
  row.appendChild(typeEl)

  // Summary
  if (summary) {
    const sumEl = document.createElement('span')
    sumEl.className = 'ast-tree__summary'
    sumEl.textContent = ` ${summary}`
    row.appendChild(sumEl)
  }

  // Node ID (dim)
  const idEl = document.createElement('span')
  idEl.className = 'ast-tree__id'
  idEl.textContent = ` #${nodeId}`
  row.appendChild(idEl)

  // Search highlight
  if (matchesSearch) {
    row.classList.add('ast-tree__node--match')
  }

  // Source highlight on click
  row.addEventListener('click', e => {
    e.stopPropagation()
    if (options.ast.sourceMap && options.onSelectNode) {
      options.onSelectNode(nodeId, options.ast.sourceMap)
    }
    // Toggle selected state
    row.closest('.ast-tree')?.querySelectorAll('.ast-tree__node--selected').forEach(el => el.classList.remove('ast-tree__node--selected'))
    row.classList.add('ast-tree__node--selected')
  })

  // Context menu → copy JSON
  row.addEventListener('contextmenu', e => {
    e.preventDefault()
    void navigator.clipboard.writeText(JSON.stringify(node, null, 2))
    showCopiedToast(row)
  })

  const container = document.createElement('div')
  container.className = 'ast-tree__container'
  container.appendChild(row)

  // Children container (initially collapsed unless searching)
  if (hasChildren) {
    const childrenEl = document.createElement('div')
    childrenEl.className = 'ast-tree__children'

    const shouldExpand = depth < 1
      || (searchQuery && treeContainsMatch(node, searchQuery))

    if (!shouldExpand) {
      childrenEl.style.display = 'none'
    } else {
      arrow.textContent = '▼'
      arrow.classList.add('ast-tree__arrow--open')
    }

    // When a matching node is found during search, render all its children
    // (without filtering) so the subtree is fully explorable.
    const thisNodeMatches = searchQuery && nodeMatchesSearch(node, searchQuery, label)
    const childQuery = thisNodeMatches ? '' : searchQuery

    children.forEach(child => {
      if (!searchQuery || thisNodeMatches || treeContainsMatch(child.node, searchQuery, child.label)) {
        childrenEl.appendChild(renderNode(child.node, child.label, depth + 1, options, childQuery))
      }
    })

    container.appendChild(childrenEl)

    // Click arrow to toggle
    arrow.style.cursor = 'pointer'
    arrow.addEventListener('click', e => {
      e.stopPropagation()
      const isOpen = childrenEl.style.display !== 'none'
      childrenEl.style.display = isOpen ? 'none' : ''
      arrow.textContent = isOpen ? '▶' : '▼'
      arrow.classList.toggle('ast-tree__arrow--open', !isOpen)

      // Lazy render children if not yet populated
      if (!isOpen && childrenEl.children.length === 0) {
        children.forEach(child => {
          childrenEl.appendChild(renderNode(child.node, child.label, depth + 1, options, ''))
        })
      }
    })
  }

  return container
}

function showCopiedToast(anchor: HTMLElement) {
  const toast = document.createElement('div')
  toast.className = 'ast-tree__toast'
  toast.textContent = 'JSON copied'
  anchor.appendChild(toast)
  setTimeout(() => toast.remove(), 1200)
}

// ---------------------------------------------------------------------------
// Public: create the tree viewer element
// ---------------------------------------------------------------------------

export function createAstTreeViewer(options: TreeViewerOptions): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'ast-tree-viewer'

  // Toolbar
  const toolbar = document.createElement('div')
  toolbar.className = 'ast-tree__toolbar'

  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.placeholder = 'Search nodes...'
  searchInput.className = 'ast-tree__search'
  toolbar.appendChild(searchInput)

  function collapseAll() {
    tree.querySelectorAll('.ast-tree__children').forEach(el => {
      ;(el as HTMLElement).style.display = 'none'
    })
    tree.querySelectorAll('.ast-tree__arrow').forEach(el => {
      if (el.textContent === '▼') {
        el.textContent = '▶'
        el.classList.remove('ast-tree__arrow--open')
      }
    })
  }

  function expandAll() {
    tree.querySelectorAll('.ast-tree__children').forEach(el => {
      ;(el as HTMLElement).style.display = ''
    })
    tree.querySelectorAll('.ast-tree__arrow').forEach(el => {
      if (el.textContent === '▶') {
        el.textContent = '▼'
        el.classList.add('ast-tree__arrow--open')
      }
    })
  }

  const collapseAllBtn = document.createElement('button')
  collapseAllBtn.className = 'ast-tree__btn'
  collapseAllBtn.textContent = 'Collapse all'
  collapseAllBtn.addEventListener('click', collapseAll)
  toolbar.appendChild(collapseAllBtn)

  const expandAllBtn = document.createElement('button')
  expandAllBtn.className = 'ast-tree__btn'
  expandAllBtn.textContent = 'Expand all'
  expandAllBtn.addEventListener('click', expandAll)
  toolbar.appendChild(expandAllBtn)

  const copyAllBtn = document.createElement('button')
  copyAllBtn.className = 'ast-tree__btn'
  copyAllBtn.textContent = 'Copy JSON'
  copyAllBtn.addEventListener('click', () => {
    void navigator.clipboard.writeText(JSON.stringify(options.ast, null, 2))
    copyAllBtn.textContent = 'Copied!'
    setTimeout(() => { copyAllBtn.textContent = 'Copy JSON' }, 1200)
  })
  toolbar.appendChild(copyAllBtn)

  wrapper.appendChild(toolbar)

  // Tree container
  const tree = document.createElement('div')
  tree.className = 'ast-tree fancy-scroll'

  function renderTree(query: string) {
    tree.innerHTML = ''
    options.ast.body.forEach((node, i) => {
      if (!query || treeContainsMatch(node, query)) {
        tree.appendChild(renderNode(
          node,
          options.ast.body.length > 1 ? `${i}` : null,
          0,
          options,
          query,
        ))
      }
    })
    if (tree.children.length === 0 && query) {
      const empty = document.createElement('div')
      empty.className = 'ast-tree__empty'
      empty.textContent = `No nodes matching "${query}"`
      tree.appendChild(empty)
    }
  }

  renderTree('')

  // Search with debounce
  let searchTimeout: ReturnType<typeof setTimeout>
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      renderTree(searchInput.value.trim())
    }, 200)
  })

  wrapper.appendChild(tree)
  return wrapper
}
