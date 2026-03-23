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
  NormalExpression: 'var(--syntax-builtin)',
  SpecialExpression: 'var(--syntax-keyword)',
  UserDefinedSymbol: 'var(--syntax-symbol)',
  Builtin: 'var(--syntax-builtin)',
  Special: 'var(--syntax-keyword)',
  Reserved: 'var(--syntax-keyword)',
  Binding: 'var(--syntax-keyword)',
  Spread: 'var(--syntax-punctuation)',
  EffectName: 'var(--syntax-effect)',
}

function getNodeColor(nodeType: string): string {
  return nodeColorMap[nodeType] ?? 'var(--color-text)'
}

// ---------------------------------------------------------------------------
// Summary text for a node (shown on the collapsed line)
// ---------------------------------------------------------------------------

function getNodeSummary(node: AstNode): string {
  const [type, payload] = node

  switch (type) {
    case 'Number':
      return `${payload}`
    case 'String':
      return `"${truncate(payload as string, 40)}"`
    case 'UserDefinedSymbol':
    case 'Builtin':
      return `${payload}`
    case 'Special':
      return `${payload}`
    case 'Reserved':
      return `${payload}`
    case 'EffectName':
      return `@${payload}`
    case 'NormalExpression': {
      const [fnNode, args] = payload as [AstNode, AstNode[]]
      const fnName = fnNode[0] === 'Builtin' || fnNode[0] === 'UserDefinedSymbol'
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
    case 'Binding': {
      return 'let'
    }
    case 'Spread':
      return '...'
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

function isLeafNode(node: AstNode): boolean {
  const type = node[0]
  return type === 'Number'
    || type === 'String'
    || type === 'UserDefinedSymbol'
    || type === 'Builtin'
    || type === 'Special'
    || type === 'Reserved'
    || type === 'EffectName'
}

// ---------------------------------------------------------------------------
// Get child nodes for expansion
// ---------------------------------------------------------------------------

interface ChildEntry {
  label: string | null
  node: AstNode
}

/** Labels for SpecialExpression children by expression name. */
const specialExpressionLabels: Record<string, string[] | null> = {
  'if': ['condition', 'then', 'else'],
  'handle': ['body', 'handler'],
  'perform': ['effect'],
  'let': null, // single Binding child, no label needed
  'block': null, // sequence of body nodes
  'function': null,
  'for': null,
  'loop': null,
  'match': null,
  'defn': null,
  '&&': null,
  '||': null,
  '??': null,
  'array': null,
  'object': null,
  'recur': null,
  'import': null,
}

function getChildren(node: AstNode): ChildEntry[] {
  const [type, payload] = node
  const children: ChildEntry[] = []

  switch (type) {
    case 'NormalExpression': {
      const [fnNode, args] = payload as [AstNode, AstNode[]]
      children.push({ label: 'fn', node: fnNode })
      args.forEach((arg, i) => children.push({ label: args.length > 1 ? `arg${i}` : 'arg', node: arg }))
      break
    }
    case 'SpecialExpression': {
      const parts = payload as [string, ...unknown[]]
      const exprName = parts[0]
      const labels = specialExpressionLabels[exprName]
      let labelIndex = 0

      for (let i = 1; i < parts.length; i++) {
        const part = parts[i]
        if (part === null || part === undefined) continue
        if (Array.isArray(part) && part.length > 0) {
          if (isAstNode(part)) {
            children.push({ label: labels?.[labelIndex++] ?? null, node: part as AstNode })
          } else {
            ;(part as unknown[]).forEach(child => {
              if (isAstNode(child)) {
                children.push({ label: labels?.[labelIndex++] ?? null, node: child as AstNode })
              }
            })
          }
        }
      }
      break
    }
    case 'TemplateString': {
      const segments = payload as AstNode[]
      segments.forEach(seg => children.push({ label: null, node: seg }))
      break
    }
    case 'Binding': {
      const [_target, value] = payload as [unknown, AstNode]
      children.push({ label: 'value', node: value })
      break
    }
    case 'Spread':
      children.push({ label: null, node: payload as AstNode })
      break
  }

  return children
}

function isAstNode(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && typeof value[0] === 'string' && typeof value[2] === 'number'
}

// ---------------------------------------------------------------------------
// Search matching
// ---------------------------------------------------------------------------

function nodeMatchesSearch(node: AstNode, query: string, label?: string | null): boolean {
  const [type, payload] = node
  const lowerQuery = query.toLowerCase()
  if (label && label.toLowerCase().includes(lowerQuery)) return true
  if (type.toLowerCase().includes(lowerQuery)) return true
  if (typeof payload === 'string' && payload.toLowerCase().includes(lowerQuery)) return true
  if (typeof payload === 'number' && `${payload}`.includes(query)) return true
  if (type === 'NormalExpression') {
    const fnNode = (payload as [AstNode, AstNode[]])[0]
    if (typeof fnNode[1] === 'string' && fnNode[1].toLowerCase().includes(lowerQuery)) return true
  }
  if (type === 'SpecialExpression') {
    const name = (payload as [string])[0]
    if (name.toLowerCase().includes(lowerQuery)) return true
  }
  return false
}

function treeContainsMatch(node: AstNode, query: string, label?: string | null): boolean {
  if (nodeMatchesSearch(node, query, label)) return true
  return getChildren(node).some(c => treeContainsMatch(c.node, query, c.label))
}

// ---------------------------------------------------------------------------
// Render tree
// ---------------------------------------------------------------------------

function renderNode(
  node: AstNode,
  label: string | null,
  depth: number,
  options: TreeViewerOptions,
  searchQuery: string,
): HTMLElement {
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
