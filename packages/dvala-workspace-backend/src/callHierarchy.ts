// Pure-function support for the call hierarchy LS feature. Three
// exports back the three VS Code Call Hierarchy operations:
//
//  - collectCallableFrames(ast, sourceMap, fileSymbols) — walks the
//    AST and returns every `let name = (params) -> body` shape (plus
//    macro / handler analogues) as a CallableFrame, recording both
//    the outer Let range and the inner body range. Used by all three
//    Call Hierarchy operations to map between source positions and
//    named callables.
//  - findEnclosingCallableFrame(frames, line, column) — smallest
//    frame whose body contains a position. Used by incoming-calls to
//    group each call site under its enclosing function.
//  - walkCallSites(node, sourceMap) — generator that yields every
//    Call site with a Sym callee + the call's source range. Used by
//    outgoing-calls to list "what does this function call?".
//
// Pure: takes raw AST + source map + symbol table, no backend or
// VS Code coupling. Promotes to dvala-core-tooling/src/shared/ when
// the playground LS client lands.

import { NodeTypes } from '@mojir/dvala-types'
import type { AstNode, SourceMapPosition } from '@mojir/dvala-types'
import type { FileSymbols, SymbolDef } from '@mojir/dvala-core-tooling'

type CallableKind = 'function' | 'macro' | 'handler'

// Kinds of SymbolDef we recognise as callable. Variables that hold
// function values are intentionally excluded for v1 — the typechecker
// would need to be involved to know whether `let f = g` makes `f`
// callable, and that's a v2 polish.
export const CALLABLE_DEF_KINDS = new Set<SymbolDef['kind']>(['function', 'macro', 'handler'])

export interface CallableFrame {
  name: string
  kind: CallableKind
  // Def location — the name token (1-based).
  defLine: number
  defColumn: number
  // The Let binding's full source range (1-based, exclusive end).
  // Becomes the `range` field on the CallHierarchyItem.
  letStartLine: number
  letStartColumn: number
  letEndLine: number
  letEndColumn: number
  // The Function/Macro/Handler body's source range. Used to test
  // containment of references.
  bodyStartLine: number
  bodyStartColumn: number
  bodyEndLine: number
  bodyEndColumn: number
}

/**
 * Walk the AST and collect every `let name = (params) -> body` shape
 * (plus the macro / handler analogues). Each frame records both the
 * outer Let range and the inner body range — the body range tests
 * containment of call sites; the Let range is what VS Code highlights
 * as the item's full range.
 */
export function collectCallableFrames(
  ast: readonly AstNode[],
  sourceMap: Map<number, SourceMapPosition> | undefined,
  fileSymbols: FileSymbols | null | undefined,
): CallableFrame[] {
  if (!sourceMap || !fileSymbols) return []
  // Local alias for TS narrowing — closures lose the `!== undefined`
  // guard above by the time `walk` reads it.
  const map = sourceMap
  const frames: CallableFrame[] = []
  const defByLocation = new Map<string, SymbolDef>()
  for (const def of fileSymbols.definitions) {
    if (!CALLABLE_DEF_KINDS.has(def.kind)) continue
    defByLocation.set(`${def.location.line}:${def.location.column}`, def)
  }

  function walk(node: unknown): void {
    if (!Array.isArray(node) || typeof node[0] !== 'string') {
      if (Array.isArray(node)) for (const child of node) walk(child)
      return
    }
    if (node[0] === NodeTypes.Let && Array.isArray(node[1])) {
      const [bindingTarget, valueExpr] = node[1] as [AstNode, AstNode]
      // Simple-symbol binding only. Destructuring like
      // `let { f, g } = mod` lacks a single source location to anchor
      // an item, so we skip those — VS Code's Call Hierarchy doesn't
      // really model destructured imports anyway.
      if ((bindingTarget[0] as string) === 'symbol' && Array.isArray(bindingTarget[1])) {
        const symNode = (bindingTarget[1] as [AstNode, AstNode | undefined])[0]
        const valueType = valueExpr[0]
        const isCallableValue =
          valueType === NodeTypes.Function || valueType === NodeTypes.Macro || valueType === NodeTypes.Handler
        if (symNode[0] === NodeTypes.Sym && typeof symNode[1] === 'string' && isCallableValue) {
          const symPos = map.get(symNode[symNode.length - 1] as number)
          const letPos = map.get(node[node.length - 1] as number)
          const bodyPos = map.get(valueExpr[valueExpr.length - 1] as number)
          if (symPos && letPos && bodyPos) {
            const defLocKey = `${symPos.start[0] + 1}:${symPos.start[1] + 1}`
            const def = defByLocation.get(defLocKey)
            // Symbol table is authoritative for kind. If the def isn't
            // indexed, fall back to mapping the AST shape.
            const astKind: CallableKind =
              valueType === NodeTypes.Function ? 'function' : valueType === NodeTypes.Macro ? 'macro' : 'handler'
            const symbolKind = def?.kind
            const kind: CallableKind =
              symbolKind === 'function' || symbolKind === 'macro' || symbolKind === 'handler' ? symbolKind : astKind
            frames.push({
              name: symNode[1] as string,
              kind,
              defLine: symPos.start[0] + 1,
              defColumn: symPos.start[1] + 1,
              letStartLine: letPos.start[0] + 1,
              letStartColumn: letPos.start[1] + 1,
              letEndLine: letPos.end[0] + 1,
              letEndColumn: letPos.end[1] + 1,
              bodyStartLine: bodyPos.start[0] + 1,
              bodyStartColumn: bodyPos.start[1] + 1,
              bodyEndLine: bodyPos.end[0] + 1,
              bodyEndColumn: bodyPos.end[1] + 1,
            })
          }
        }
      }
    }
    // Descend into the payload regardless — function values can nest.
    walk(node[1])
  }

  walk(ast as unknown)
  return frames
}

/**
 * Smallest callable frame whose body contains the given (1-based)
 * position. Returns null when the position is at top-level (no
 * enclosing function — calls go on the file-level synthetic item
 * in the backend).
 */
export function findEnclosingCallableFrame(
  frames: readonly CallableFrame[],
  line: number,
  column: number,
): CallableFrame | null {
  let best: CallableFrame | null = null
  let bestSize = Infinity
  for (const frame of frames) {
    const contains =
      (line > frame.bodyStartLine || (line === frame.bodyStartLine && column >= frame.bodyStartColumn)) &&
      (line < frame.bodyEndLine || (line === frame.bodyEndLine && column <= frame.bodyEndColumn))
    if (!contains) continue
    const size = (frame.bodyEndLine - frame.bodyStartLine) * 1_000_000 + (frame.bodyEndColumn - frame.bodyStartColumn)
    if (size < bestSize) {
      bestSize = size
      best = frame
    }
  }
  return best
}

/**
 * Walk an AST subtree and yield every call site whose callee is a
 * known Sym. Caller filters by resolved-def kind. Used by
 * outgoing-calls to list "what does this function call?".
 */
export function* walkCallSites(
  node: unknown,
  sourceMap: Map<number, SourceMapPosition>,
): Generator<{ calleeNodeId: number; calleeName: string; callRange: SourceMapPosition }, void, void> {
  if (!Array.isArray(node) || typeof node[0] !== 'string') {
    if (Array.isArray(node)) for (const child of node) yield* walkCallSites(child, sourceMap)
    return
  }
  if (node[0] === NodeTypes.Call && Array.isArray(node[1])) {
    const callee = (node[1] as [AstNode, AstNode[]])[0]
    if (callee[0] === NodeTypes.Sym && typeof callee[1] === 'string') {
      const callRange = sourceMap.get(node[node.length - 1] as number)
      if (callRange) {
        yield {
          calleeNodeId: callee[callee.length - 1] as number,
          calleeName: callee[1] as string,
          callRange,
        }
      }
    }
  }
  // Descend into payload — nested calls are common (`f(g(x))`).
  yield* walkCallSites(node[1], sourceMap)
}
