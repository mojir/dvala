import { NodeTypes } from '../constants/constants'
import { createDvala } from '../createDvala'
import type { FileResolver } from '../evaluator/ContextStack'
import { hostHandler } from '../evaluator/effectTypes'
import { prettyPrint } from '../prettyPrint'
import type { Ast, AstNode, SourceMap, SourceMapPosition } from '../parser/types'
import { isMacroFunction } from '../typeGuards/dvalaFunction'
import { fromJS } from '../utils/interop'
import type { Any } from '../interface'
import { PersistentVector } from '../utils/persistent'

export interface MacroExpandOptions {
  /** File resolver for cross-file macro imports (e.g. let { double } = import("./macros")) */
  fileResolver?: FileResolver
  /** Base directory for resolving relative imports in macro evaluation */
  fileResolverBaseDir?: string
}

/**
 * Build-time macro expansion pass.
 *
 * Walks the entire AST, finds macro definitions (let name = macro ...),
 * evaluates them to get macro functions, then expands all calls
 * to those macros using macroexpand. The macro definitions are
 * removed from the output.
 *
 * When a fileResolver is provided, also discovers macros imported from
 * other files (e.g. let { double } = import("./macros")).
 *
 * Macros that fail to evaluate are left unexpanded.
 */
export function expandMacros(ast: Ast, options?: MacroExpandOptions): Ast {
  // Phase 1: Collect local macro definitions and import statements that may bring in macros
  const macroDefs: { name: string; node: AstNode }[] = []
  const importBindings: { names: string[]; node: AstNode }[] = []
  collectMacroDefs(ast.body, macroDefs)
  if (options?.fileResolver) {
    collectImportBindings(ast.body, importBindings)
  }

  if (macroDefs.length === 0 && importBindings.length === 0) {
    return ast
  }

  // Phase 2: Evaluate macro definitions (and import statements) to get macro functions.
  // When file resolution is available, imported macros are discovered too.
  const dvala = createDvala({
    fileResolver: options?.fileResolver,
    fileResolverBaseDir: options?.fileResolverBaseDir,
    typecheck: false,
  })
  const macroFunctions = new Map<string, unknown>()

  // Build source to evaluate: imports first, then local macro defs, then return all names
  const allNames: string[] = []
  const sourceFragments: string[] = []

  for (const ib of importBindings) {
    sourceFragments.push(prettyPrint(ib.node))
    allNames.push(...ib.names)
  }
  for (const def of macroDefs) {
    sourceFragments.push(prettyPrint(def.node))
    allNames.push(def.name)
  }

  // Deduplicate names (an import binding name might also appear as a local macro)
  const uniqueNames = [...new Set(allNames)]
  const returnObj = uniqueNames.map(n => `${n}: ${n}`).join(', ')
  const evalSource = `${sourceFragments.join(';\n')};\n{ ${returnObj} }`

  try {
    const result = dvala.run(evalSource) as Record<string, unknown>
    for (const name of uniqueNames) {
      const fn = result[name]
      if (isMacroFunction(fn)) {
        macroFunctions.set(name, fn)
      }
    }
  } catch {
    return ast
  }

  if (macroFunctions.size === 0) {
    return ast
  }

  // Phase 3: Walk the AST, expand macro calls.
  // Macro definitions are kept — treeshaking can remove them later.
  // The sourceMap is mutated in place: expanded nodes that lack positions
  // are stamped with the call-site position so coverage can track them.
  const positions = ast.sourceMap?.positions
  const expandedBody = processNodes(ast.body, macroFunctions, dvala, positions)

  return { body: expandedBody, sourceMap: ast.sourceMap }
}

/** Recursively find all let-bound macro definitions in the AST */
function collectMacroDefs(nodes: AstNode[], result: { name: string; node: AstNode }[]): void {
  for (const node of nodes) {
    const name = extractMacroDefName(node)
    if (name) {
      result.push({ name, node })
    }
    // Recurse into blocks, let values, etc.
    recurseForCollection(node[1], result)
  }
}

function recurseForCollection(payload: unknown, result: { name: string; node: AstNode }[]): void {
  if (!Array.isArray(payload)) return
  for (const item of payload) {
    if (isAstNode(item)) {
      const name = extractMacroDefName(item as AstNode)
      if (name) {
        result.push({ name, node: item as AstNode })
      }
      recurseForCollection((item as AstNode)[1], result)
    } else if (Array.isArray(item)) {
      recurseForCollection(item, result)
    }
  }
}

/**
 * Collect `let { name, ... } = import("...")` bindings.
 * These may bring macros from other files. The actual nodes are kept
 * so we can pretty-print and evaluate them to discover which values are macros.
 */
function collectImportBindings(nodes: AstNode[], result: { names: string[]; node: AstNode }[]): void {
  for (const node of nodes) {
    if (node[0] !== NodeTypes.Let) continue
    const [target, value] = node[1] as [AstNode, AstNode]
    // Value must be an Import node with a relative path
    if (!Array.isArray(value) || value[0] !== NodeTypes.Import) continue
    const importPath = value[1] as string
    if (!importPath.startsWith('.')) continue
    // Target must be an object destructuring pattern (binding patterns use plain strings, not NodeTypes)
    if (!Array.isArray(target) || (target[0] as string) !== 'object') continue
    const [entries] = target[1] as [unknown]
    if (!Array.isArray(entries)) continue
    const names: string[] = []
    for (const entry of entries) {
      if (entry && typeof entry === 'object' && 'key' in entry) {
        names.push((entry as { key: string }).key)
      }
    }
    if (names.length > 0) {
      result.push({ names, node })
    }
  }
}

/** Check if a node is `let <name> = macro ...` and return the name */
function extractMacroDefName(node: AstNode): string | null {
  if (node[0] !== NodeTypes.Let) return null
  const [target, value] = node[1] as [unknown, AstNode]
  if (!Array.isArray(value) || value[0] !== NodeTypes.Macro) return null
  if (!Array.isArray(target)) return null
  if (target[0] !== 'symbol') return null
  const payload = target[1] as [unknown[], unknown]
  const symNode = payload[0]
  if (!Array.isArray(symNode) || symNode[0] !== NodeTypes.Sym) return null
  return symNode[1] as string
}

/** Process a list of nodes: expand macro calls, keep definitions (treeshaking removes them later) */
function processNodes(nodes: AstNode[], macros: Map<string, unknown>, dvala: ReturnType<typeof createDvala>, positions: SourceMap['positions'] | undefined): AstNode[] {
  return nodes.map(node => expandNodeRecursive(node, macros, dvala, positions))
}

/** Recursively expand macro calls in an AST node */
function expandNodeRecursive(node: AstNode, macros: Map<string, unknown>, dvala: ReturnType<typeof createDvala>, positions: SourceMap['positions'] | undefined): AstNode {
  const [type, payload, nodeId] = node

  // Check if this is a Call or MacroCall (#name expr) to a known macro
  if (type === NodeTypes.Call || type === NodeTypes.MacroCall) {
    const [fnNode, args] = payload as [AstNode, AstNode[]]
    if (fnNode[0] === NodeTypes.Sym) {
      const name = fnNode[1] as string
      const macroFn = macros.get(name)
      if (macroFn) {
        try {
          // Convert each AST node (plain array) to PV so macro bodies can use Dvala
          // builtins like first(), get(), etc. on the received arguments. The outer PV
          // wrapper prevents fromJS from recursing further.
          const argsAsPV = PersistentVector.from(args.map(arg => fromJS(arg as unknown as Any)))
          const expanded = dvala.run('let __m__ = perform(@dvala.host, "__m__"); let args = perform(@dvala.host, "args"); macroexpand(__m__, ...args)', {
            effectHandlers: [hostHandler({ __m__: macroFn, args: argsAsPV })],
          })
          if (Array.isArray(expanded) && expanded.length === 3 && typeof expanded[0] === 'string') {
            const expandedNode = expandNodeRecursive(expanded as AstNode, macros, dvala, positions)
            // Stamp every node in the expanded subtree that has no sourceMap position
            // with the call-site's position, so coverage can attribute branches to it.
            if (positions) {
              const callSitePos = positions.get(nodeId)
              if (callSitePos)
                stampMissingPositions(expandedNode, callSitePos, positions)
            }
            return expandedNode
          }
          return node
        } catch {
          return node
        }
      }
    }
  }

  // For Block nodes, process the body to remove macro defs inside blocks
  if (type === NodeTypes.Block && Array.isArray(payload)) {
    const blockBody = processNodes(payload as AstNode[], macros, dvala, positions)
    return [type, blockBody, nodeId]
  }

  // Recurse into children
  if (Array.isArray(payload)) {
    const newPayload = payload.map(item => recurseInto(item, macros, dvala, positions))
    return [type, newPayload, nodeId]
  }

  return node
}

/**
 * Walk an expanded AST subtree and add the call-site position to any node
 * not already present in the sourceMap. This ensures that expressions
 * introduced by macro expansion are visible to coverage tools.
 */
function stampMissingPositions(node: AstNode, pos: SourceMapPosition, positions: SourceMap['positions']): void {
  const nodeId = node[2]
  if (!positions.has(nodeId))
    positions.set(nodeId, pos)

  const payload = node[1]
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (isAstNode(item))
        stampMissingPositions(item as AstNode, pos, positions)
      else if (Array.isArray(item))
        stampNestedPositions(item, pos, positions)
    }
  }
}

function stampNestedPositions(items: unknown[], pos: SourceMapPosition, positions: SourceMap['positions']): void {
  for (const item of items) {
    if (isAstNode(item))
      stampMissingPositions(item as AstNode, pos, positions)
    else if (Array.isArray(item))
      stampNestedPositions(item, pos, positions)
  }
}

function recurseInto(value: unknown, macros: Map<string, unknown>, dvala: ReturnType<typeof createDvala>, positions: SourceMap['positions'] | undefined): unknown {
  if (!Array.isArray(value)) return value
  if (isAstNode(value)) {
    return expandNodeRecursive(value as AstNode, macros, dvala, positions)
  }
  return value.map(item => recurseInto(item, macros, dvala, positions))
}

function isAstNode(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && typeof value[0] === 'string' && typeof value[2] === 'number'
}
