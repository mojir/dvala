/**
 * Constant folding entry point for the type inference engine.
 *
 * Given a direct `Call` to a builtin with all-literal argument types and
 * an empty inferred effect set, synthesize a Call AST whose args are
 * literal nodes, hand it to the fold sandbox, and wrap the runtime result
 * back as a `Literal` type.
 *
 * Phase C v1 scope (primitives only):
 *   - Callee: `NodeTypes.Builtin` references only — user-defined and
 *     module-imported functions come in follow-ups (decision #5, #13).
 *   - Argument types: primitive literals (`Literal` of number/string/boolean),
 *     atoms (`Atom`), and `Null`. Closed tuples and records come in follow-ups
 *     (decision #10).
 *
 * Gate: callers must check `FOLD_ENABLED` before invoking. This file has no
 * knowledge of the toggle — it's pure fold mechanics.
 *
 * See design docs:
 *   - design/active/2026-04-16_constant-folding-in-types.md
 *   - design/active/2026-04-16_builtin-effect-audit.md
 *   - design/active/2026-04-16_fold-toggle-and-differential-tests.md
 */

import { NodeTypes } from '../constants/constants'
import { createContextStack } from '../evaluator/ContextStack'
import { evaluateNodeForFold } from '../evaluator/foldEvaluate'
import type { AstNode } from '../parser/types'
import { isPersistentMap, isPersistentVector } from '../utils/persistent'
import type { Type } from './types'
import { NullType, atom as atomType, literal, record, tuple } from './types'

/**
 * Reconstruct a literal AST node from an inferred type.
 *
 * Supports primitives (Literal, Atom, Null) and closed composites (Tuple,
 * closed Record) with arbitrary nesting — per decision #10. Bails on:
 *   - Plain `Number` / `String` / `Boolean` (no concrete value).
 *   - Open records (`open: true`) — can't know all fields.
 *   - `Array` types (element-only, no length info).
 *   - Function values, `Unknown`, type vars.
 *
 * Exported so the C6a closure-capture reconstruction path in `infer.ts`
 * can use the same machinery to build let-binding values for captures.
 */
export function literalTypeToAstNode(t: Type): AstNode | null {
  if (t.tag === 'Literal') {
    const value = t.value
    if (typeof value === 'number') return [NodeTypes.Num, value, 0] as unknown as AstNode
    if (typeof value === 'string') return [NodeTypes.Str, value, 0] as unknown as AstNode
    if (typeof value === 'boolean') return [NodeTypes.Reserved, value ? 'true' : 'false', 0] as unknown as AstNode
  }
  if (t.tag === 'Atom') {
    return [NodeTypes.Atom, t.name, 0] as unknown as AstNode
  }
  if (t.tag === 'Primitive' && t.name === 'Null') {
    return [NodeTypes.Reserved, 'null', 0] as unknown as AstNode
  }
  if (t.tag === 'Tuple') {
    const elements: AstNode[] = []
    for (const elemType of t.elements) {
      const elem = literalTypeToAstNode(elemType)
      if (!elem) return null
      elements.push(elem)
    }
    return [NodeTypes.Array, elements, 0] as unknown as AstNode
  }
  if (t.tag === 'Record' && !t.open) {
    const entries: [AstNode, AstNode][] = []
    for (const [key, fieldType] of t.fields) {
      const valueAst = literalTypeToAstNode(fieldType)
      if (!valueAst) return null
      const keyAst = [NodeTypes.Str, key, 0] as unknown as AstNode
      entries.push([keyAst, valueAst])
    }
    return [NodeTypes.Object, entries, 0] as unknown as AstNode
  }
  return null
}

/**
 * Lift a runtime value back into a `Literal`-ish type.
 *
 * Supports the same shapes as `literalTypeToAstNode`: primitives, atoms,
 * null, PersistentVector → closed Tuple, PersistentMap → closed Record.
 * Recurses through composite elements / fields.
 */
function valueToLiteralType(value: unknown): Type | null {
  if (value === null || value === undefined) return NullType
  if (typeof value === 'number' && Number.isFinite(value)) return literal(value)
  if (typeof value === 'string') return literal(value)
  if (typeof value === 'boolean') return literal(value)
  // Atom values carry a `name` field (see typeGuards/dvala isAtom).
  if (typeof value === 'object' && value !== null && 'name' in value
    && typeof (value as { name: unknown }).name === 'string'
    && '^^atom^^' in value) {
    return atomType((value as { name: string }).name)
  }
  if (isPersistentVector(value)) {
    const elementTypes: Type[] = []
    for (const elem of value) {
      const elemType = valueToLiteralType(elem)
      if (!elemType) return null
      elementTypes.push(elemType)
    }
    return tuple(elementTypes)
  }
  if (isPersistentMap(value)) {
    const fields: Record<string, Type> = {}
    for (const [key, val] of value) {
      // Record keys are strings in the Dvala type system; skip anything else.
      if (typeof key !== 'string') return null
      const fieldType = valueToLiteralType(val)
      if (!fieldType) return null
      fields[key] = fieldType
    }
    // Closed record — every field is a known literal type.
    return record(fields, false)
  }
  return null
}

export interface FoldOutcome {
  /** Folded successfully — use this as the inferred result type. */
  type?: Type
  /** Fold surfaced an effect (typically `@dvala.error`) — caller should
   *  emit a warning and fall back to the normal inferred type. */
  effectName?: string
}

/**
 * Build the list of arg AST nodes for a fold call, or return null if any
 * argument isn't a reconstructible literal type.
 */
function reconstructArgAsts(argTypes: Type[]): AstNode[] | null {
  const argAsts: AstNode[] = []
  for (const argType of argTypes) {
    const litNode = literalTypeToAstNode(argType)
    if (!litNode) return null
    argAsts.push(litNode)
  }
  return argAsts
}

/**
 * Run a synthesized Call through the fold sandbox and translate the result
 * into a FoldOutcome. Shared by the builtin and user-function entry points.
 */
function runFold(syntheticCall: AstNode): FoldOutcome | null {
  const contextStack = createContextStack()
  const result = evaluateNodeForFold(syntheticCall, contextStack)
  if (result.ok) {
    const type = valueToLiteralType(result.value)
    return type ? { type } : null
  }
  if (result.reason === 'effect') {
    return { effectName: result.effectName }
  }
  return null
}

/**
 * Attempt to fold a direct builtin Call with all-primitive-literal args.
 *
 * @param calleeNode   The AST node of the callee (must be a Builtin node).
 * @param argTypes     The inferred types of each argument.
 * @returns
 *   - `{ type }`       on success: the literal type of the folded result.
 *   - `{ effectName }` when the fold performed an effect the sandbox caught
 *                      (caller emits a `severity: 'warning'` diagnostic).
 *   - `null`           when the call isn't eligible for folding (non-builtin
 *                      callee, non-literal args, budget exhaustion, or any
 *                      unhandled sandbox failure — silent fallback).
 */
export function tryFoldBuiltinCall(
  calleeNode: AstNode,
  argTypes: Type[],
): FoldOutcome | null {
  // Phase C v1: only direct Builtin references. Module-imported functions
  // enter by symbol lookup and arrive here as `NodeTypes.Sym` — not folded
  // yet. User-defined functions route through `tryFoldUserFunctionCall`.
  if (calleeNode[0] !== NodeTypes.Builtin) return null

  const argAsts = reconstructArgAsts(argTypes)
  if (!argAsts) return null

  // Synthesize a Call AST: [Call, [builtinNode, args, hints], nodeId].
  // nodeId=0 because this node is ephemeral and never surfaced.
  const calleeClone: AstNode = [NodeTypes.Builtin, calleeNode[1], 0] as unknown as AstNode
  const syntheticCall: AstNode = [
    NodeTypes.Call,
    [calleeClone, argAsts, null],
    0,
  ] as unknown as AstNode

  return runFold(syntheticCall)
}

/**
 * Recursively collect all symbol references (`NodeTypes.Sym`) reachable
 * from an AST subtree. Used by C6a to enumerate potential closure
 * captures; the caller then decides which of those references correspond
 * to outer let-bindings (versus params, builtins, or local lets).
 *
 * Implementation note: a universal walker that descends into every array
 * / object value in the payload. The AST's uniformly `[type, payload, id]`
 * shape means we can recognise Sym nodes by their first element.
 */
export function collectSymRefs(ast: AstNode): Set<string> {
  const refs = new Set<string>()
  walkForSymRefs(ast, refs)
  return refs
}

function walkForSymRefs(value: unknown, into: Set<string>): void {
  if (!Array.isArray(value)) return
  // Node shape: [type, payload, nodeId]. Any Sym ref has `type === 'Sym'`
  // and a string payload.
  if (value[0] === NodeTypes.Sym && typeof value[1] === 'string') {
    into.add(value[1])
    return
  }
  // Recurse into payload. For node-like values the payload is at index 1;
  // for inner arrays (e.g. params, body-statement lists) every element
  // is itself a node.
  for (const child of value) {
    if (Array.isArray(child)) walkForSymRefs(child, into)
    else if (child && typeof child === 'object') {
      for (const v of Object.values(child)) walkForSymRefs(v, into)
    }
  }
}

/**
 * Attempt to fold a Call to a user-defined function (C6 + C6a).
 *
 * @param functionAst  The Function-node AST that the caller's binding
 *                     resolves to (captured via `env.bindFunctionAst`).
 * @param argTypes     The inferred types of each argument.
 * @param captures     Map of free-variable name → reconstructed value AST.
 *                     The caller (inferExpr) walks the function body for
 *                     symbol references, resolves each through the outer
 *                     TypeEnv, and converts literal-typed ones via
 *                     `literalTypeToAstNode`. Capture entries become
 *                     `let name = <valueAst>` bindings wrapped around the
 *                     synthesized Call, so the sandbox can resolve them.
 * @returns Same contract as `tryFoldBuiltinCall`.
 *
 * How it works: we build a Block AST `do let c1 = v1; … let cN = vN; (<fn>)(<args>) end`,
 * evaluate through the sandbox, and lift the result back to a type.
 * Function-parameter shadowing works naturally — when a capture name
 * matches a function param, the param wins inside the body.
 *
 * When `captures` is empty (e.g. the function is closure-free), the
 * Block wrapping is skipped and we use the raw Call.
 *
 * Free variables the caller *didn't* include in `captures` are assumed
 * to be builtins (resolved globally by the sandbox's context stack) or
 * locally bound inside the function body. If either assumption fails —
 * typically because a capture wasn't reconstructible and the caller
 * passed a partial map — the sandbox raises ReferenceError, which
 * `evaluateNodeForFold` surfaces as `reason: 'error'` (silent fallback),
 * not as a warning.
 */
export function tryFoldUserFunctionCall(
  functionAst: AstNode,
  argTypes: Type[],
  captures: Map<string, AstNode>,
): FoldOutcome | null {
  if (functionAst[0] !== NodeTypes.Function) return null

  const argAsts = reconstructArgAsts(argTypes)
  if (!argAsts) return null

  // Synthesize `[Call, [<FunctionAst>, args, null], 0]`. The evaluator
  // treats the callee as a literal function expression, creates a value,
  // and immediately applies it to the args.
  const syntheticCall: AstNode = [
    NodeTypes.Call,
    [functionAst, argAsts, null],
    0,
  ] as unknown as AstNode

  // Wrap in a Block with let-bindings for each capture. Without captures,
  // skip the Block to avoid extra evaluator steps.
  let rootNode: AstNode = syntheticCall
  if (captures.size > 0) {
    const statements: AstNode[] = []
    for (const [name, valueAst] of captures) {
      // BindingTarget: ['symbol', [SymbolNode, default?], nodeId]
      const symbolNode: AstNode = [NodeTypes.Sym, name, 0] as unknown as AstNode
      const symbolBinding: AstNode = ['symbol', [symbolNode, undefined], 0] as unknown as AstNode
      // Let node: [Let, [BindingTarget, valueNode], nodeId]
      const letNode: AstNode = [NodeTypes.Let, [symbolBinding, valueAst], 0] as unknown as AstNode
      statements.push(letNode)
    }
    statements.push(syntheticCall)
    rootNode = [NodeTypes.Block, statements, 0] as unknown as AstNode
  }

  return runFold(rootNode)
}
