/**
 * Refinement-types Phase 1 — fragment-checker walker.
 *
 * Walks a Dvala expression AST (the predicate body parsed by the main
 * Dvala parser) and either returns silently (the predicate is in the
 * accepted fragment) or throws a `RefinementError` with the appropriate
 * `kind`.
 *
 * Design reference: `design/active/2026-04-23_refinement-types.md`,
 * Phase 1 ship gate.
 *
 * Phase 1 accepts (top-level shape must reduce to Boolean):
 *   - `isX(var)` — any type-guard builtin applied to the binder
 *   - `var REL literal`  (REL ∈ ==, !=, <, <=, >, >=)
 *   - `!P`, `P && Q`, `P || Q`  where P, Q are themselves accepted
 *   - `count(var) REL literal`
 *
 * Rejected shapes (each with a distinct error phrasing):
 *   - Bare var / non-Boolean body           → kind: `predicate-type`
 *   - Arithmetic (`+`, `-`, `*`, `/`, `%`)  → kind: `fragment`
 *   - Unknown / non-guard builtin call      → kind: `fragment`
 *   - Effect (`perform`)                    → kind: `fragment`
 *   - Control flow (`if`, `match`, `let`,
 *     `loop`, `for`)                        → kind: `fragment`
 *   - Field access on binder                → kind: `fragment`
 *                                             (deferred-by-design; Phase 1.x)
 *   - `lit REL var` (swapped operands)      → kind: `fragment`
 *                                             (deferred-by-design; Phase 1.x)
 *
 * Walker strategy is a simple switch on `NodeTypes`. Each accepted case
 * recurses into its children; every other case throws. No classification
 * is *stored* (per Phase 1 scope — the `Refined` AST node arrives in
 * Phase 2); the walker's return value is unused and its side-effect is
 * either "no throw" (accept) or "throw RefinementError" (reject).
 */

import { NodeTypes } from '../constants/constants'
import type { AstNode } from '../parser/types'
import { isTypeGuard } from './builtinTypes'
import { RefinementError } from './parseType'

/** Relations accepted on the RHS of a refinement binder. */
const RELATION_BUILTINS = new Set(['==', '!=', '<', '<=', '>', '>='])

/**
 * Arithmetic operators explicitly named in the rejection message so the
 * error points at the operator that triggered it (rather than a generic
 * "not in fragment"). Keeps the kind `'fragment'`.
 */
const ARITHMETIC_BUILTINS = new Set(['+', '-', '*', '/', '%', '^', 'mod', 'quot'])

/**
 * Check that `predicate` is in the Phase 1 refinement fragment. The
 * binder name is tracked so the walker can verify `isX(var)` and
 * `var REL lit` actually reference it (rather than some other symbol).
 *
 * Throws `RefinementError` on rejection. Returns undefined on accept.
 *
 * `source` / `position` are threaded through so the error message can
 * point at the original refinement annotation (the Dvala AST nodes have
 * their own source positions but those reference the predicate body,
 * which isn't what the user sees in the type-annotation context).
 */
export function fragmentCheckPredicate(
  predicate: AstNode,
  binder: string,
  source: string,
  position: number,
): void {
  checkBooleanExpr(predicate, binder, source, position)
}

/** Top-level: the node must produce Boolean through an accepted shape. */
function checkBooleanExpr(node: AstNode, binder: string, source: string, position: number): void {
  switch (node[0]) {
    case NodeTypes.And:
    case NodeTypes.Or: {
      // `P && Q` / `P || Q` — each operand must also be a Boolean
      // expression in the fragment. Recurse.
      const operands = node[1] as AstNode[]
      for (const op of operands) {
        checkBooleanExpr(op, binder, source, position)
      }
      return
    }
    case NodeTypes.Call: {
      checkCall(node, binder, source, position)
      return
    }
    case NodeTypes.Sym: {
      // Bare var reference `{x | x}` — not a Boolean expression. This is
      // the `predicate-type` branch from the design doc: no coercion, a
      // var on its own isn't a predicate.
      throw new RefinementError(
        `Refinement predicate must be a Boolean expression; got a bare identifier '${node[1] as string}'. `
        + 'Use a relation (e.g. `x != 0`), a type-guard call (e.g. `isNumber(x)`), or a Boolean composition of those.',
        'predicate-type',
        source,
        position,
      )
    }
    case NodeTypes.Num:
    case NodeTypes.Str:
    case NodeTypes.Atom:
    case NodeTypes.TmplStr: {
      throw new RefinementError(
        'Refinement predicate must be a Boolean expression; got a literal. '
        + 'A literal on its own is not a predicate — use a comparison like `x == <literal>`.',
        'predicate-type',
        source,
        position,
      )
    }
    case NodeTypes.If:
    case NodeTypes.Match:
    case NodeTypes.Let:
    case NodeTypes.Loop:
    case NodeTypes.For:
    case NodeTypes.Block: {
      throw new RefinementError(
        `Refinement predicate uses control-flow construct '${node[0] as string}', which is not in the accepted fragment. `
        + 'Predicates must be pure Boolean expressions (relations, guards, `&&`/`||`/`!`).',
        'fragment',
        source,
        position,
      )
    }
    case NodeTypes.Perform:
    case NodeTypes.Resume:
    case NodeTypes.WithHandler:
    case NodeTypes.Handler: {
      throw new RefinementError(
        `Refinement predicate contains an effect operation ('${node[0] as string}'). `
        + 'Refinements describe values, not behaviors — effectful predicates are rejected.',
        'fragment',
        source,
        position,
      )
    }
    default: {
      throw new RefinementError(
        `Refinement predicate uses a construct ('${node[0] as string}') that is not in the accepted fragment. `
        + 'Allowed shapes: type-guard calls, relations, `count(var)`, and `&&` / `||` / `!` compositions of those.',
        'fragment',
        source,
        position,
      )
    }
  }
}

/**
 * A `Call` node in a predicate must be one of:
 *   - `!arg`              — unary not, recurse on the argument
 *   - `isX(var)`          — type-guard applied to the binder
 *   - `var REL literal`   — relation with binder on the left, literal on the right
 *   - `count(var) REL lit`— sequence-length relation (var is the binder)
 */
function checkCall(node: AstNode, binder: string, source: string, position: number): void {
  const [callee, args] = node[1] as [AstNode, AstNode[]]

  // Only Builtin callees are permitted. User-defined symbols, closures,
  // property-accessor strings — all rejected.
  if (callee[0] !== NodeTypes.Builtin) {
    throw new RefinementError(
      'Refinement predicate may only call Dvala builtin functions (type guards, relations, `count`, `!`). '
      + 'User-defined or module-qualified functions are not in the Phase 1 fragment.',
      'fragment',
      source,
      position,
    )
  }
  const name = callee[1] as string

  // Unary `!`: recurse.
  if (name === '!') {
    if (args.length !== 1) {
      throw new RefinementError(
        `Refinement predicate: '!' takes exactly one argument; got ${args.length}.`,
        'fragment',
        source,
        position,
      )
    }
    checkBooleanExpr(args[0]!, binder, source, position)
    return
  }

  // Type-guard call: `isX(binder)`.
  if (isTypeGuard(name)) {
    if (args.length !== 1) {
      throw new RefinementError(
        `Refinement predicate: type-guard '${name}' takes exactly one argument; got ${args.length}.`,
        'fragment',
        source,
        position,
      )
    }
    if (!isBinderRef(args[0]!, binder)) {
      throw new RefinementError(
        `Refinement predicate: type-guard '${name}' must be applied to the binder '${binder}'. `
        + 'Field access and other sub-expressions are deferred to a later phase.',
        'fragment',
        source,
        position,
      )
    }
    return
  }

  // Relation: `var REL lit` or `count(var) REL lit`.
  if (RELATION_BUILTINS.has(name)) {
    if (args.length !== 2) {
      throw new RefinementError(
        `Refinement predicate: relation '${name}' must be used with exactly two operands.`,
        'fragment',
        source,
        position,
      )
    }
    checkRelationOperands(args[0]!, args[1]!, name, binder, source, position)
    return
  }

  // Arithmetic — rejected with a targeted message because users commonly
  // try things like `{n | n * n > 0}` or `{i | i + 1 < N}` on first try.
  if (ARITHMETIC_BUILTINS.has(name)) {
    throw new RefinementError(
      `Refinement predicate contains arithmetic operator '${name}', which is not in the Phase 1 fragment. `
      + 'Phase 1 accepts relations (e.g. `x > 0`), type-guards (e.g. `isInteger(x)`), and `count(var)` only. '
      + 'Arithmetic on refined variables is solved by Phase 3 (multi-variable linear arithmetic).',
      'fragment',
      source,
      position,
    )
  }

  // Any other builtin — rejected as outside the fragment.
  throw new RefinementError(
    `Refinement predicate calls builtin '${name}', which is not in the accepted fragment. `
    + 'Phase 1 accepts: type guards, relations (==, !=, <, <=, >, >=), `count(var)`, and `!` / `&&` / `||`.',
    'fragment',
    source,
    position,
  )
}

/**
 * Accepted operand shapes on each side of a relation:
 *   LHS:  `binder` (Sym) OR `count(binder)` (Call of `count` builtin on binder)
 *   RHS:  literal (Num, Str, Atom, or `true`/`false` reserved)
 *
 * `lit REL var` (swapped operands) is rejected — deferred to Phase 1.x.
 */
function checkRelationOperands(
  lhs: AstNode,
  rhs: AstNode,
  relName: string,
  binder: string,
  source: string,
  position: number,
): void {
  const lhsKind = classifyRelationLhs(lhs, binder)
  if (lhsKind === 'other') {
    throw new RefinementError(
      `Refinement predicate: relation '${relName}' must have the binder '${binder}' `
      + `(or 'count(${binder})') on its left-hand side. `
      + 'Literal-on-left forms (e.g. `0 < n`) and sub-expression LHS are deferred to a later phase — rewrite as `n > 0`.',
      'fragment',
      source,
      position,
    )
  }

  if (!isLiteralLike(rhs)) {
    throw new RefinementError(
      `Refinement predicate: relation '${relName}' requires a literal on the right-hand side. `
      + 'References to other variables, arithmetic, and sub-expressions are deferred to a later phase.',
      'fragment',
      source,
      position,
    )
  }
}

/** Is `node` a reference to the binder `Sym(binder)`? */
function isBinderRef(node: AstNode, binder: string): boolean {
  return node[0] === NodeTypes.Sym && (node[1] as string) === binder
}

/**
 * Classify the LHS of a relation. `binder` if it's a plain binder
 * reference; `countBinder` if it's `count(binder)`; `other` for anything
 * else (rejection).
 */
function classifyRelationLhs(node: AstNode, binder: string): 'binder' | 'countBinder' | 'other' {
  if (isBinderRef(node, binder)) return 'binder'
  if (node[0] === NodeTypes.Call) {
    const [callee, args] = node[1] as [AstNode, AstNode[]]
    if (
      callee[0] === NodeTypes.Builtin
      && (callee[1] as string) === 'count'
      && args.length === 1
      && isBinderRef(args[0]!, binder)
    ) {
      return 'countBinder'
    }
  }
  return 'other'
}

/**
 * Literal-like RHS operand for a relation: number, string, atom, or
 * the reserved-symbol literals `true` / `false` / `null`. The reserved
 * keyword forms parse as `Reserved` nodes in Dvala.
 */
function isLiteralLike(node: AstNode): boolean {
  switch (node[0]) {
    case NodeTypes.Num:
    case NodeTypes.Str:
    case NodeTypes.Atom:
      return true
    case NodeTypes.Reserved: {
      const name = node[1] as string
      return name === 'true' || name === 'false' || name === 'null'
    }
    default:
      return false
  }
}
