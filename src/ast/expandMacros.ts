import { NodeTypes } from '../constants/constants'
import { createDvala } from '../createDvala'
import { prettyPrint } from '../prettyPrint'
import type { Ast, AstNode } from '../parser/types'
import { isMacroFunction } from '../typeGuards/dvalaFunction'

/**
 * Build-time macro expansion pass.
 *
 * Walks the AST, finds macro definitions (let name = macro ...),
 * evaluates them to get macro functions, then expands all calls
 * to those macros using macroexpand. The macro definitions are
 * removed from the output.
 *
 * Only expands macros that are statically defined as let bindings
 * with Macro node values and whose bodies don't depend on runtime context.
 * Macros that fail to evaluate are left unexpanded.
 *
 * Note: uses prettyPrint to reconstruct source for macro evaluation.
 * This is a pragmatic choice — the macro bodies need to be evaluated
 * in a fresh Dvala context, and the evaluator's public API takes strings.
 * A future evaluateAst API would eliminate this round-trip.
 */
export function expandMacros(ast: Ast): Ast {
  // Phase 1: Find all macro definitions (let name = macro ...)
  const macroDefs: { name: string; index: number }[] = []

  for (let i = 0; i < ast.body.length; i++) {
    const node = ast.body[i]!
    const name = extractMacroDefName(node)
    if (name) {
      macroDefs.push({ name, index: i })
    }
  }

  if (macroDefs.length === 0) {
    return ast
  }

  // Phase 2: Evaluate all macro definitions together so they can reference each other.
  // We prettyPrint each definition and evaluate them in a shared Dvala context.
  const dvala = createDvala()
  const macroFunctions = new Map<string, unknown>()
  const expandedIndices = new Set<number>()

  // Build a combined source: all macro lets, then return an object of them
  const defSources = macroDefs.map(d => prettyPrint(ast.body[d.index]!))
  const returnObj = macroDefs.map(d => `${d.name}: ${d.name}`).join(', ')
  const evalSource = `${defSources.join(';\n')};\n{ ${returnObj} }`

  try {
    const result = dvala.run(evalSource) as Record<string, unknown>
    for (const def of macroDefs) {
      const fn = result[def.name]
      if (isMacroFunction(fn)) {
        macroFunctions.set(def.name, fn)
        expandedIndices.add(def.index)
      }
    }
  } catch {
    // Collective evaluation failed — macros may depend on runtime context.
    return ast
  }

  if (macroFunctions.size === 0) {
    return ast
  }

  // Phase 3: Expand macro calls in the remaining AST body.
  const expandedBody: AstNode[] = []

  for (let i = 0; i < ast.body.length; i++) {
    if (expandedIndices.has(i)) {
      continue // Remove expanded macro definitions
    }
    expandedBody.push(expandNodeRecursive(ast.body[i]!, macroFunctions, dvala))
  }

  return { body: expandedBody, sourceMap: ast.sourceMap }
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

/** Recursively expand macro calls in an AST node */
function expandNodeRecursive(node: AstNode, macros: Map<string, unknown>, dvala: ReturnType<typeof createDvala>): AstNode {
  const [type, payload, nodeId] = node

  // Check if this is a Call to a known macro
  if (type === NodeTypes.Call) {
    const [fnNode, args] = payload as [AstNode, AstNode[]]
    if (fnNode[0] === NodeTypes.Sym) {
      const name = fnNode[1] as string
      const macroFn = macros.get(name)
      if (macroFn) {
        try {
          // Use macroexpand(macroFn, ...args) to get expanded AST
          const expanded = dvala.run('macroexpand(__m__, ...args)', {
            bindings: { __m__: macroFn, args },
          })
          if (Array.isArray(expanded) && expanded.length === 3 && typeof expanded[0] === 'string') {
            // Recursively expand in case the expansion contains more macro calls
            return expandNodeRecursive(expanded as AstNode, macros, dvala)
          }
          return node
        } catch {
          return node
        }
      }
    }
  }

  // Recurse into children
  if (Array.isArray(payload)) {
    const newPayload = payload.map(item => recurseInto(item, macros, dvala))
    return [type, newPayload, nodeId]
  }

  return node
}

/** Recursively process a value that may be an AST node, an array of nodes, or a plain value */
function recurseInto(value: unknown, macros: Map<string, unknown>, dvala: ReturnType<typeof createDvala>): unknown {
  if (!Array.isArray(value)) return value
  // AST node: [string, payload, number]
  if (value.length === 3 && typeof value[0] === 'string' && typeof value[2] === 'number') {
    return expandNodeRecursive(value as AstNode, macros, dvala)
  }
  // Array of values — recurse into each
  return value.map(item => recurseInto(item, macros, dvala))
}
