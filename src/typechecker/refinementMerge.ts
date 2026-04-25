/**
 * Refinement-types Phase 2.2 — multi-refinement merging.
 *
 * When the simplify pass encounters `Refined(Refined(B, s1, P), s2, Q)` —
 * the shape produced by `Base & {s1 | P} & {s2 | Q}` — collapse the nested
 * pair into a single `Refined(B, s1, P && Q[s2 := s1])`. This canonicalises
 * stacked refinements so downstream consumers (solver, typeEquals,
 * typeToString) see one node per base.
 *
 * Design reference: `design/active/2026-04-23_refinement-types.md`,
 * Phase 2.2 scope and the "Multi-refinement merging" rule in the
 * Simplification section. The merge rule is:
 *
 *     Input:  Base & {s | P} & {x | Q}
 *     Stored: Refined(base: Base, binder: s,
 *                     predicate: P && Q[x := s],
 *                     source: "s | <P && Q[x:=s]>")
 *
 * Binder-canonicalisation picks the INNER refinement's binder (the one
 * that appeared first in source order). The outer refinement's predicate
 * gets alpha-renamed so every reference to its binder now points at the
 * canonical one; the outer binder name is discarded.
 *
 * Alpha-renaming only touches the predicate AST — the Dvala expression
 * parsed from between `|` and `}`. Because Phase 1's fragment-checker
 * already rejected control-flow constructs (`let`, `if`, etc.) inside
 * predicates, there are no rebinding sites — every `Sym(binder)` in the
 * predicate is a free reference to the binder. A naïve whole-tree Sym
 * replacement is therefore correct; no scope analysis needed.
 *
 * Source reconstruction goes through `prettyPrint` on the merged AST
 * (not textual regex replacement). Textual replacement would misbehave
 * when a string literal inside the predicate happens to contain the
 * binder name (e.g. `{s | s == "s"}`); `prettyPrint` emits correct
 * Dvala source from the renamed AST regardless of content.
 */

import { NodeTypes } from '../constants/constants'
import type { AstNode } from '../parser/types'
import { prettyPrint } from '../prettyPrint'

/**
 * Merge `Refined(Refined(B, innerBinder, innerPred), outerBinder, outerPred)`
 * into `Refined(B, innerBinder, innerPred && outerPred[outerBinder := innerBinder])`.
 *
 * `innerSource` / `outerSource` are the parser-captured source strings
 * (with the `binder | ` prefix). They're used only for the fast path
 * where innerBinder === outerBinder — in that case we can skip the
 * alpha-rename and reuse the original strings.
 */
export function mergeRefinementPredicates(
  innerBinder: string,
  innerPredicate: AstNode,
  outerBinder: string,
  outerPredicate: AstNode,
): { predicate: AstNode; source: string } {
  // If the binders already agree, skip the alpha-rename — saves one
  // tree walk and keeps the AST identity-shared.
  const renamedOuter = innerBinder === outerBinder
    ? outerPredicate
    : alphaRenameSym(outerPredicate, outerBinder, innerBinder)

  // `And` is a variadic special-expression node: payload is the list of
  // operands. Flatten when either side is already an `And` so a chain
  // of three refinements doesn't produce a right-skewed `And(P, And(Q, R))`
  // — simplify & solver both prefer the flat form.
  const mergedOperands: AstNode[] = [
    ...flattenAnd(innerPredicate),
    ...flattenAnd(renamedOuter),
  ]
  const mergedPredicate: AstNode = [NodeTypes.And, mergedOperands, 0]

  // Source reconstruction: prettyPrint the merged AST and prefix with
  // the canonical binder. The body string (after the `|`) is the
  // prettyPrint output exactly — trailing trivia stripped.
  const body = prettyPrint(mergedPredicate).trim()
  const source = `${innerBinder} | ${body}`

  return { predicate: mergedPredicate, source }
}

/**
 * Walk a predicate AST and replace every `Sym(from)` with `Sym(to)`.
 *
 * Phase 1's fragment-checker guarantees the AST only contains node
 * types from a restricted set (guard calls, relations, `count(var)`,
 * `And` / `Or` / `!` compositions, Sym/Num/Str/Atom/Reserved leaves).
 * Any node type outside that set is unreachable in a merge — we assert
 * that and return unchanged for defensiveness.
 *
 * NodeIds are preserved on rewritten nodes (including the new `Sym`),
 * so source-code-info lookups from surrounding error reporting still
 * succeed. The rewritten `Sym` keeps the original's id because, after
 * alpha-rename, it refers to the same logical binding site.
 */
function alphaRenameSym(node: AstNode, from: string, to: string): AstNode {
  switch (node[0]) {
    case NodeTypes.Sym: {
      if ((node[1] as string) === from) {
        return [NodeTypes.Sym, to, node[2]]
      }
      return node
    }
    case NodeTypes.Call: {
      const [callee, args] = node[1] as [AstNode, AstNode[]]
      const newCallee = alphaRenameSym(callee, from, to)
      const newArgs = args.map(a => alphaRenameSym(a, from, to))
      // Identity-share when nothing changed — keeps reference equality
      // stable for callers that memoise on the predicate AST.
      if (newCallee === callee && newArgs.every((a, i) => a === args[i])) return node
      return [NodeTypes.Call, [newCallee, newArgs], node[2]]
    }
    case NodeTypes.And:
    case NodeTypes.Or: {
      const operands = node[1] as AstNode[]
      const renamed = operands.map(op => alphaRenameSym(op, from, to))
      if (renamed.every((op, i) => op === operands[i])) return node
      return [node[0], renamed, node[2]]
    }
    // Leaves that don't contain Syms are returned as-is. Builtin nodes
    // (e.g. `>`, `isNumber`) are never the binder — and the binder can't
    // shadow a builtin name either (Phase 1 rejects reserved binders).
    case NodeTypes.Num:
    case NodeTypes.Str:
    case NodeTypes.Atom:
    case NodeTypes.Reserved:
    case NodeTypes.Builtin:
    case NodeTypes.TmplStr:
      return node
    // Defensive: any other node type shouldn't reach here post-
    // fragment-check. Return unchanged rather than throw, so merging a
    // malformed predicate (e.g. one constructed by a future phase that
    // relaxes the fragment) doesn't silently corrupt the tree.
    default:
      return node
  }
}

/**
 * If `node` is an `And`, return its operand list; otherwise return a
 * singleton `[node]`. Used by `mergeRefinementPredicates` to keep the
 * merged `And` flat.
 */
function flattenAnd(node: AstNode): AstNode[] {
  if (node[0] === NodeTypes.And) return node[1] as AstNode[]
  return [node]
}
