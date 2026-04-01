import { NodeTypes } from '../constants/constants'
import type { Ast, AstNode } from '../parser/types'

/**
 * Tree-shaking pass: remove unused let bindings from a bundled AST.
 *
 * Uses a mark-and-sweep (graph-based) algorithm:
 * 1. Build dependency graph: each let binding → names it references
 * 2. Find root: the last expression in the body (program output)
 * 3. Mark: BFS from root's references through the graph
 * 4. Sweep: remove unmarked Let nodes with side-effect-free values
 */
export function treeShake(ast: Ast): Ast {
  if (ast.body.length === 0) return ast

  // Step 1: Build dependency graph
  // For each Let binding, record: defined names → referenced names in value
  const graph = new Map<string, Set<string>>()
  const bindingIndices = new Map<string, number>() // name → body index
  const allDefinedNames = new Set<string>()

  for (let i = 0; i < ast.body.length; i++) {
    const node = ast.body[i]!
    if (node[0] === NodeTypes.Let) {
      const [target, value] = node[1] as [unknown, AstNode]
      const names = extractBindingNames(target)
      const refs = collectSymRefs(value)

      for (const name of names) {
        graph.set(name, refs)
        bindingIndices.set(name, i)
        allDefinedNames.add(name)
      }
    }
  }

  // Step 2: Find the root — all non-Let nodes are roots (they produce the program's output)
  const rootRefs = new Set<string>()
  for (let i = 0; i < ast.body.length; i++) {
    const node = ast.body[i]!
    if (node[0] !== NodeTypes.Let) {
      for (const ref of collectSymRefs(node)) {
        rootRefs.add(ref)
      }
    }
  }

  // Step 3: Mark live bindings via BFS
  const live = new Set<string>()
  const queue = [...rootRefs]

  while (queue.length > 0) {
    const name = queue.pop()!
    if (live.has(name)) continue
    if (!allDefinedNames.has(name)) continue // builtin or external — skip
    live.add(name)

    // Add this binding's dependencies to the queue
    const deps = graph.get(name)
    if (deps) {
      for (const dep of deps) {
        if (!live.has(dep)) {
          queue.push(dep)
        }
      }
    }
  }

  // Step 4: Sweep — remove dead Let nodes
  // A Let node is removable only if ALL its binding names are dead
  // (handles destructuring where some names may be live)
  const indicesToRemove = new Set<number>()
  // Group names by their body index
  const indexToNames = new Map<number, string[]>()
  for (const [name, index] of bindingIndices) {
    if (!indexToNames.has(index)) indexToNames.set(index, [])
    indexToNames.get(index)!.push(name)
  }
  for (const [index, names] of indexToNames) {
    const allDead = names.every(n => !live.has(n))
    if (allDead) {
      const node = ast.body[index]!
      const [, value] = (node[1] as [unknown, AstNode])
      if (isSideEffectFree(value)) {
        indicesToRemove.add(index)
      }
    }
  }

  if (indicesToRemove.size === 0) return ast

  const body = ast.body.filter((_, i) => !indicesToRemove.has(i))
  return { body, sourceMap: ast.sourceMap }
}

/**
 * Extract all binding names from a binding target (handles destructuring).
 */
function extractBindingNames(target: unknown): string[] {
  if (!Array.isArray(target)) return []
  const type = target[0] as string
  const payload = target[1] as unknown[]

  switch (type) {
    case 'symbol': {
      const symNode = payload[0] as unknown[]
      if (Array.isArray(symNode) && symNode[0] === NodeTypes.Sym) {
        return [symNode[1] as string]
      }
      return []
    }
    case 'rest': {
      const name = payload[0]
      return typeof name === 'string' ? [name] : []
    }
    case 'object': {
      const record = payload[0] as Record<string, unknown[]>
      const names: string[] = []
      for (const bt of Object.values(record)) {
        names.push(...extractBindingNames(bt))
      }
      return names
    }
    case 'array': {
      const targets = payload[0] as (unknown[] | null)[]
      const names: string[] = []
      for (const t of targets) {
        if (t) names.push(...extractBindingNames(t))
      }
      return names
    }
    default:
      return []
  }
}

/**
 * Collect all Sym references in an AST node (recursively).
 * Returns the set of symbol names referenced.
 */
function collectSymRefs(node: unknown): Set<string> {
  const refs = new Set<string>()
  walkForRefs(node, refs)
  return refs
}

function walkForRefs(value: unknown, refs: Set<string>): void {
  if (!Array.isArray(value)) return

  // AST node: [string, payload, number]
  if (value.length === 3 && typeof value[0] === 'string' && typeof value[2] === 'number') {
    const [type, payload] = value as [string, unknown]
    if (type === NodeTypes.Sym) {
      refs.add(payload as string)
      return
    }
    // Don't count Sym nodes inside binding targets of nested Let nodes as references
    if (type === NodeTypes.Let) {
      const [, letValue] = payload as [unknown, unknown]
      walkForRefs(letValue, refs)
      return
    }
    walkForRefs(payload, refs)
    return
  }

  // Array of values
  for (const item of value) {
    walkForRefs(item, refs)
  }
}

/**
 * Conservative check: is this expression side-effect-free?
 * If uncertain, return false (keep the binding).
 */
function isSideEffectFree(node: AstNode): boolean {
  const type = node[0]
  switch (type) {
    // Always pure
    case NodeTypes.Num:
    case NodeTypes.Str:
    case NodeTypes.Sym:
    case NodeTypes.Builtin:
    case NodeTypes.Function:
    case NodeTypes.Macro:
    case NodeTypes.Effect:
      return true

    // Pure if contents are pure
    case NodeTypes.Array:
      return (node[1] as AstNode[]).every(isSideEffectFree)
    case NodeTypes.Object:
      return (node[1] as [AstNode, AstNode][]).every(([k, v]) => isSideEffectFree(k) && isSideEffectFree(v))

    // Block: pure if all statements are pure
    case NodeTypes.Block:
      return (node[1] as AstNode[]).every(n => {
        // Let bindings inside blocks are pure if their value is pure
        if (n[0] === NodeTypes.Let) {
          const [, value] = n[1] as [unknown, AstNode]
          return isSideEffectFree(value)
        }
        return isSideEffectFree(n)
      })

    // Import of a builtin module is side-effect-free
    case NodeTypes.Import:
      return true

    // Call to a builtin function is pure if all args are pure
    case NodeTypes.Call: {
      const [fnNode, args] = node[1] as [AstNode, AstNode[]]
      if (fnNode[0] === NodeTypes.Builtin) {
        return args.every(isSideEffectFree)
      }
      // Call to user function — might have side effects
      return false
    }

    // #name expr — macro calls are code transformations, not side-effect-free
    case NodeTypes.MacroCall:
      return false

    // If expression is pure if all branches are pure
    case NodeTypes.If: {
      const parts = node[1] as AstNode[]
      return parts.every(isSideEffectFree)
    }

    // Let binding inside an expression (e.g. inside a block)
    case NodeTypes.Let: {
      const [, value] = node[1] as [unknown, AstNode]
      return isSideEffectFree(value)
    }

    // Everything else might have side effects
    default:
      return false
  }
}
