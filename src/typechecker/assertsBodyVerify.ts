import { NodeTypes, isNodeType } from '../constants/constants'
import { resolveSourceCodeInfo } from '../parser/types'
import type { Ast, AstNode, BindingTarget } from '../parser/types'
import { bindingTargetTypes } from '../parser/types'
import { prettyPrint } from '../prettyPrint'
import { parseTypeAnnotation, TypeParseError } from './parseType'
import { simplify } from './simplify'
import type { AssertsInfo } from './types'
import type { TypeDiagnostic } from './typecheck'

interface AssertionFunctionInfo {
  binding: BindingTarget
  bodyNodes: AstNode[]
  name?: string
  node: AstNode
  valueNode: AstNode
  asserts: AssertsInfo
}

export function verifyAssertionFunctionBodies(ast: Ast): TypeDiagnostic[] {
  if (!ast.typeAnnotations || ast.typeAnnotations.size === 0) return []

  const diagnostics: TypeDiagnostic[] = []
  verifyStatementList(ast.body, ast, diagnostics)
  return diagnostics
}

function verifyStatementList(nodes: AstNode[], ast: Ast, diagnostics: TypeDiagnostic[]): void {
  const assertionFunctions = collectAssertionFunctions(nodes, ast)
  const cyclicFunctions = findRecursiveAssertionFunctions(assertionFunctions)

  for (const info of assertionFunctions) {
    const blocked = emitPreflightDiagnostics(info, ast, diagnostics, cyclicFunctions)
    if (!blocked && !bodyProvesAssertion(info, assertionFunctions, new Set())) {
      diagnostics.push({
        message: `Assertion function '${info.name ?? '<anonymous>'}' does not prove ${info.asserts.source} on all normal-return paths.`,
        severity: 'error',
        sourceCodeInfo: resolveNodeSourceInfo(info.valueNode, ast),
      })
    }
  }

  for (const node of nodes) {
    visitNestedStatementLists(node, ast, diagnostics)
  }
}

function collectAssertionFunctions(nodes: AstNode[], ast: Ast): AssertionFunctionInfo[] {
  const out: AssertionFunctionInfo[] = []
  for (const node of nodes) {
    if (node[0] !== NodeTypes.Let) continue
    const [binding, valueNode] = node[1] as [BindingTarget, AstNode]
    if (valueNode[0] !== NodeTypes.Function) continue

    const annotation = ast.typeAnnotations?.get(binding[2])
    if (!annotation) continue

    try {
      const declaredType = simplify(parseTypeAnnotation(annotation))
      if (declaredType.tag !== 'Function' || !declaredType.asserts) continue
      const [, bodyNodes] = valueNode[1] as [AstNode[], AstNode[]]
      out.push({
        binding,
        bodyNodes,
        name: getSymbolBindingName(binding),
        node,
        valueNode,
        asserts: declaredType.asserts,
      })
    } catch (error) {
      if (error instanceof TypeParseError) continue
      throw error
    }
  }
  return out
}

function emitPreflightDiagnostics(
  info: AssertionFunctionInfo,
  ast: Ast,
  diagnostics: TypeDiagnostic[],
  cyclicFunctions: Set<AssertionFunctionInfo>,
): boolean {
  let blocked = false
  if (cyclicFunctions.has(info)) {
    diagnostics.push({
      message: `Assertion function '${info.name ?? '<anonymous>'}' may not recurse or participate in recursive assertion cycles.`,
      severity: 'error',
      sourceCodeInfo: resolveNodeSourceInfo(info.binding as unknown as AstNode, ast),
    })
    blocked = true
  }

  for (const withHandlerNode of findWithHandlerNodes(info.bodyNodes)) {
    diagnostics.push({
      message: 'Assertion function bodies may not install handlers with `do with ... end`.',
      severity: 'error',
      sourceCodeInfo: resolveNodeSourceInfo(withHandlerNode, ast),
    })
    blocked = true
  }
  return blocked
}

function findWithHandlerNodes(nodes: AstNode[]): AstNode[] {
  const hits: AstNode[] = []
  for (const node of nodes) {
    visitBodyNode(node, hits, true)
  }
  return hits
}

function findRecursiveAssertionFunctions(infos: AssertionFunctionInfo[]): Set<AssertionFunctionInfo> {
  const byName = new Map(infos.flatMap(info => info.name ? [[info.name, info]] : []))
  const edges = new Map<AssertionFunctionInfo, Set<AssertionFunctionInfo>>()
  for (const info of infos) {
    const callees = new Set<AssertionFunctionInfo>()
    for (const calleeName of collectCalledAssertionNames(info.bodyNodes, new Set(byName.keys()))) {
      const callee = byName.get(calleeName)
      if (callee) callees.add(callee)
    }
    edges.set(info, callees)
  }

  const cyclic = new Set<AssertionFunctionInfo>()
  for (const info of infos) {
    if (hasCycle(info, info, edges, new Set())) {
      cyclic.add(info)
      for (const other of infos) {
        if (other !== info && hasCycle(info, other, edges, new Set()) && hasCycle(other, info, edges, new Set())) {
          cyclic.add(other)
        }
      }
    }
  }
  return cyclic
}

function visitBodyNode(node: AstNode, hits: AstNode[], allowNestedFunctions: boolean, bindingName?: string): void {
  if (node[0] === NodeTypes.WithHandler) {
    hits.push(node)
  }
  if (bindingName && node[0] === NodeTypes.Call) {
    const [calleeNode] = node[1] as [AstNode, AstNode[]]
    if (calleeNode[0] === NodeTypes.Sym && calleeNode[1] === bindingName) {
      hits.push(node)
    }
  }
  if (node[0] === NodeTypes.Function && !allowNestedFunctions) {
    return
  }
  walkBodyChildren(node[1], hits, node[0] === NodeTypes.Function ? false : allowNestedFunctions, bindingName)
}

function collectCalledAssertionNames(nodes: AstNode[], names: Set<string>): Set<string> {
  const hits = new Set<string>()
  const visit = (node: AstNode, allowNestedFunctions: boolean): void => {
    if (node[0] === NodeTypes.Call) {
      const [calleeNode] = node[1] as [AstNode, AstNode[]]
      if (calleeNode[0] === NodeTypes.Sym && names.has(calleeNode[1] as string)) {
        hits.add(calleeNode[1] as string)
      }
    }
    if (node[0] === NodeTypes.Function && !allowNestedFunctions) return
    walkValue(node[1], node[0] === NodeTypes.Function ? false : allowNestedFunctions)
  }

  const walkValue = (value: unknown, allowNestedFunctions: boolean): void => {
    if (isAstNode(value)) {
      if (value[0] === NodeTypes.Function && !allowNestedFunctions) return
      visit(value, allowNestedFunctions)
      return
    }
    if (!Array.isArray(value)) return
    for (const item of value) walkValue(item, allowNestedFunctions)
  }

  for (const node of nodes) walkValue(node, false)
  return hits
}

function hasCycle(
  current: AssertionFunctionInfo,
  target: AssertionFunctionInfo,
  edges: Map<AssertionFunctionInfo, Set<AssertionFunctionInfo>>,
  visited: Set<AssertionFunctionInfo>,
): boolean {
  if (visited.has(current)) return false
  visited.add(current)
  for (const next of edges.get(current) ?? []) {
    if (next === target) return true
    if (hasCycle(next, target, edges, visited)) return true
  }
  return false
}

function bodyProvesAssertion(
  info: AssertionFunctionInfo,
  assertionFunctions: AssertionFunctionInfo[],
  stack: Set<AssertionFunctionInfo>,
): boolean {
  if (stack.has(info)) return false
  stack.add(info)
  try {
    return sequenceProves(info.bodyNodes, info, assertionFunctions, false, stack)
  } finally {
    stack.delete(info)
  }
}

function sequenceProves(
  nodes: AstNode[],
  info: AssertionFunctionInfo,
  assertionFunctions: AssertionFunctionInfo[],
  proven: boolean,
  stack: Set<AssertionFunctionInfo>,
): boolean {
  if (nodes.length === 0) return proven
  let currentProven = proven
  for (let i = 0; i < nodes.length - 1; i++) {
    currentProven = statementGuarantees(nodes[i]!, info, assertionFunctions, currentProven, stack)
  }
  return terminalProves(nodes.at(-1)!, info, assertionFunctions, currentProven, stack)
}

function statementGuarantees(
  node: AstNode,
  info: AssertionFunctionInfo,
  assertionFunctions: AssertionFunctionInfo[],
  proven: boolean,
  stack: Set<AssertionFunctionInfo>,
): boolean {
  if (proven) return true
  if (node[0] === NodeTypes.Block) {
    return sequenceProves(node[1] as AstNode[], info, assertionFunctions, proven, stack)
  }
  if (node[0] === NodeTypes.If) {
    const [cond, thenNode, elseNode] = node[1] as [AstNode, AstNode, AstNode | undefined]
    const thenProven = terminalProves(thenNode, info, assertionFunctions, proven || predicateMatchesTarget(cond, info), stack)
    const elseProven = terminalProves(elseNode ?? thenNode, info, assertionFunctions, proven, stack)
    return thenProven && elseProven
  }
  if (node[0] === NodeTypes.Match) {
    return matchProves(node, info, assertionFunctions, proven, stack)
  }
  return establishesTargetPredicate(node, info, assertionFunctions, stack)
}

function terminalProves(
  node: AstNode,
  info: AssertionFunctionInfo,
  assertionFunctions: AssertionFunctionInfo[],
  proven: boolean,
  stack: Set<AssertionFunctionInfo>,
): boolean {
  if (proven) return true
  if (node[0] === NodeTypes.Block) {
    return sequenceProves(node[1] as AstNode[], info, assertionFunctions, proven, stack)
  }
  if (node[0] === NodeTypes.If) {
    const [cond, thenNode, elseNode] = node[1] as [AstNode, AstNode, AstNode | undefined]
    const thenProven = terminalProves(thenNode, info, assertionFunctions, proven || predicateMatchesTarget(cond, info), stack)
    const elseProven = terminalProves(elseNode ?? thenNode, info, assertionFunctions, proven, stack)
    return thenProven && elseProven
  }
  if (node[0] === NodeTypes.Match) {
    return matchProves(node, info, assertionFunctions, proven, stack)
  }
  return establishesTargetPredicate(node, info, assertionFunctions, stack)
}

/**
 * `match` proof check — every case body must prove the asserted
 * predicate, since each case is a possible normal-return path. Mirrors
 * the `If` treatment with both branches required to prove.
 *
 * Called from both `terminalProves` (the match is the function's
 * terminal expression) and `statementGuarantees` (the match is in
 * non-terminal position; if every case proves P, downstream
 * statements inherit proven=true via the `sequenceProves` loop).
 * Each case body is itself a terminal expression *within* its case,
 * so we recurse via `terminalProves` regardless of caller — the
 * same shape `If` uses for its non-terminal `statementGuarantees`
 * case.
 *
 * Two narrowing-related bonuses are applied per case:
 *
 *   1. **Guard narrowing.** A `case n when cond then ...` whose
 *      `cond` matches the target predicate starts the case body
 *      with `proven=true`. Mirrors the `If` treatment of the
 *      condition.
 *   2. **Pattern-binding-aware substitution.** When the match's
 *      scrutinee is the asserted parameter and the case binds a
 *      single Sym (`case n then ...`), the binder `n` is recognised
 *      as a local alias for the outer parameter. Predicates inside
 *      the case body that reference `n` are rewritten as if they
 *      referenced the outer parameter, so `assert(n > 0)` correctly
 *      proves `x > 0`. Limited to simple Sym bindings — destructuring
 *      / nested patterns / literal patterns don't substitute.
 */
function matchProves(
  node: AstNode,
  info: AssertionFunctionInfo,
  assertionFunctions: AssertionFunctionInfo[],
  proven: boolean,
  stack: Set<AssertionFunctionInfo>,
): boolean {
  const [scrutinee, cases] = node[1] as [AstNode, [BindingTarget, AstNode, AstNode | undefined][]]
  // Every case body must establish the predicate. An empty match
  // (no cases) is structurally degenerate — fail the proof so the
  // user sees a diagnostic rather than a silent accept.
  if (cases.length === 0) return false
  // Pattern-binding substitution requires the scrutinee to be the
  // asserted parameter directly. `match expr ...` where `expr` is
  // anything else doesn't establish that the case binding aliases
  // the asserted parameter — bail out of the substitution layer in
  // that case.
  const scrutineeIsAssertedParam
    = scrutinee[0] === NodeTypes.Sym && scrutinee[1] === info.asserts.binder
  return cases.every(([binding, body, guard]) => {
    let caseInfo = info
    if (scrutineeIsAssertedParam) {
      caseInfo = applyCaseBinderAlias(info, binding)
    }
    // Guard narrowing: if the guard's predicate matches the (per-case)
    // target predicate, the body starts with proven=true. Same shape
    // as the `If` treatment for its condition.
    const caseProven = proven || (guard !== undefined && predicateMatchesTarget(guard, caseInfo))
    return terminalProves(body, caseInfo, assertionFunctions, caseProven, stack)
  })
}

/**
 * If a case's binding is a single Sym (`case n then ...`), treat the
 * bound name as a local alias for the outer asserted parameter. The
 * info's binder + predicate are rewritten so the existing
 * `predicateMatchesTarget` structural compare matches user-written
 * predicates referring to the case binding.
 *
 * Other binding shapes (object/array destructuring, literal patterns,
 * wildcards, rest) don't introduce a single aliasing name, so they
 * leave info untouched — predicates referring to the outer parameter
 * by its original name still match.
 */
function applyCaseBinderAlias(info: AssertionFunctionInfo, binding: BindingTarget): AssertionFunctionInfo {
  if (binding[0] !== bindingTargetTypes.symbol) return info
  const [symbolNode] = binding[1] as [AstNode, AstNode | undefined]
  if (symbolNode[0] !== NodeTypes.Sym) return info
  const aliasName = symbolNode[1] as string
  if (aliasName === info.asserts.binder) return info
  // Rewrite `source` alongside `binder` and `predicate` to preserve
  // the invariant that `info.source` begins with `info.binder | ...`.
  // The alpha-aware compare in `establishesTargetPredicate` renames
  // a candidate helper's predicate to use `info.binder`, so this
  // invariant is what makes the helper-call path work for both
  // pattern-binding-aliased calls (`case n then assertPositive(n)`)
  // and ordinary cross-binder helper calls.
  const renamedPredicate = renameBinderInPredicate(info.asserts.predicate, info.asserts.binder, aliasName)
  return {
    ...info,
    asserts: {
      ...info.asserts,
      binder: aliasName,
      predicate: renamedPredicate,
      source: `${aliasName} | ${prettyPrint(renamedPredicate).trim()}`,
    },
  }
}

/**
 * Rewrite every `Sym(oldName)` in a predicate AST to `Sym(newName)`.
 * Walks the structural shapes that can contain binder references:
 * Sym (the leaf substitution case), And, Or, Call. Leaves that can't
 * transitively contain a Sym (Num, Str, Atom, TmplStr, etc.) are
 * returned unchanged via the bottom of the walk.
 *
 * Mirrors the structure of `substitutePredicateBinder` in subtype.ts
 * (which substitutes Sym for a literal). Kept private — refinement-
 * solver work that needs a similar utility should pull this out.
 */
function renameBinderInPredicate(node: AstNode, oldName: string, newName: string): AstNode {
  const rewritten = new Map<AstNode, AstNode>()
  const stack: { node: AstNode; exiting: boolean }[] = [{ node, exiting: false }]

  while (stack.length > 0) {
    const frame = stack.pop()!
    const current = frame.node

    if (frame.exiting) {
      rewritten.set(current, rewriteRenamedNode(current, oldName, newName, rewritten))
      continue
    }

    stack.push({ node: current, exiting: true })

    if (current[0] === NodeTypes.Call && Array.isArray(current[1])) {
      const [callee, args] = current[1] as [AstNode, AstNode[]]
      for (let index = args.length - 1; index >= 0; index--) {
        stack.push({ node: args[index]!, exiting: false })
      }
      stack.push({ node: callee, exiting: false })
      continue
    }

    if ((current[0] === NodeTypes.And || current[0] === NodeTypes.Or) && Array.isArray(current[1])) {
      const operands = current[1] as AstNode[]
      for (let index = operands.length - 1; index >= 0; index--) {
        stack.push({ node: operands[index]!, exiting: false })
      }
    }
  }

  return rewritten.get(node) ?? node
}

function rewriteRenamedNode(
  node: AstNode,
  oldName: string,
  newName: string,
  rewritten: Map<AstNode, AstNode>,
): AstNode {
  if (node[0] === NodeTypes.Sym && node[1] === oldName) {
    return [NodeTypes.Sym, newName, node[2]] as unknown as AstNode
  }

  if (node[0] === NodeTypes.Call && Array.isArray(node[1])) {
    const [callee, args, hints] = node[1] as [AstNode, AstNode[], unknown]
    const rewrittenCallee = rewritten.get(callee) ?? callee
    const rewrittenArgs = args.map(arg => rewritten.get(arg) ?? arg)
    const unchanged = rewrittenCallee === callee && rewrittenArgs.every((arg, index) => arg === args[index])
    if (unchanged) return node
    return [NodeTypes.Call, [rewrittenCallee, rewrittenArgs, hints], node[2]] as unknown as AstNode
  }

  if ((node[0] === NodeTypes.And || node[0] === NodeTypes.Or) && Array.isArray(node[1])) {
    const operands = node[1] as AstNode[]
    const rewrittenOperands = operands.map(operand => rewritten.get(operand) ?? operand)
    if (rewrittenOperands.every((operand, index) => operand === operands[index])) return node
    return [node[0], rewrittenOperands, node[2]] as AstNode
  }

  return node
}

function establishesTargetPredicate(
  node: AstNode,
  info: AssertionFunctionInfo,
  assertionFunctions: AssertionFunctionInfo[],
  stack: Set<AssertionFunctionInfo>,
): boolean {
  if (isExactBuiltinAssert(node, info)) return true
  if (node[0] !== NodeTypes.Call) return false
  const [calleeNode, argNodes] = node[1] as [AstNode, AstNode[]]
  if (calleeNode[0] !== NodeTypes.Sym) return false
  const helper = assertionFunctions.find(candidate => candidate.name === calleeNode[1])
  if (!helper) return false
  // Alpha-aware source compare. The helper's source uses its own
  // binder (e.g. `assertPositive` declares `asserts {x | x > 0}` with
  // binder `x`). The info's source might use a different binder —
  // either the caller declared its assertion with a different
  // parameter name (`outer: (y: Number) -> asserts {y | y > 0}` with
  // binder `y`) or `applyCaseBinderAlias` rewrote info to a case-
  // binding alias (binder `n`). Rename helper's predicate to use
  // info's binder before comparing, so structurally-equivalent
  // predicates match regardless of which name they were authored
  // with. Sound: the helper is verified to establish its predicate
  // for whatever its argument is; alpha-renaming is a no-op on
  // semantics.
  const helperRenamed = renameBinderInPredicate(
    helper.asserts.predicate,
    helper.asserts.binder,
    info.asserts.binder,
  )
  const helperSourceRenamed = `${info.asserts.binder} | ${prettyPrint(helperRenamed).trim()}`
  if (helperSourceRenamed !== info.asserts.source) return false
  const helperArg = argNodes[helper.asserts.paramIndex]
  if (!helperArg || helperArg[0] !== NodeTypes.Sym || helperArg[1] !== info.asserts.binder) return false
  return bodyProvesAssertion(helper, assertionFunctions, stack)
}

function isExactBuiltinAssert(node: AstNode, info: AssertionFunctionInfo): boolean {
  if (node[0] !== NodeTypes.Call) return false
  const [calleeNode, argNodes] = node[1] as [AstNode, AstNode[]]
  if (calleeNode[0] !== NodeTypes.Builtin || calleeNode[1] !== 'assert') return false
  const predicate = argNodes[0]
  return predicate ? predicateMatchesTarget(predicate, info) : false
}

function predicateMatchesTarget(node: AstNode, info: AssertionFunctionInfo): boolean {
  return prettyPrint(node).trim() === prettyPrint(info.asserts.predicate).trim()
}

function walkAstChildren(node: AstNode, ast: Ast, diagnostics: TypeDiagnostic[], allowNestedFunctions: boolean): void {
  if (node[0] === NodeTypes.Function && !allowNestedFunctions) {
    return
  }
  walkAstValue(node[1], ast, diagnostics, node[0] === NodeTypes.Function ? true : allowNestedFunctions)
}

function walkAstValue(value: unknown, ast: Ast, diagnostics: TypeDiagnostic[], allowNestedFunctions: boolean): void {
  if (isAstNode(value)) {
    if (value[0] === NodeTypes.Function && !allowNestedFunctions) return
    visitNestedStatementLists(value, ast, diagnostics)
    return
  }
  if (!Array.isArray(value)) return
  for (const item of value) {
    walkAstValue(item, ast, diagnostics, allowNestedFunctions)
  }
}

function walkBodyChildren(value: unknown, hits: AstNode[], allowNestedFunctions: boolean, bindingName?: string): void {
  if (isAstNode(value)) {
    visitBodyNode(value, hits, allowNestedFunctions, bindingName)
    return
  }
  if (!Array.isArray(value)) return
  for (const item of value) {
    walkBodyChildren(item, hits, allowNestedFunctions, bindingName)
  }
}

function visitNestedStatementLists(node: AstNode, ast: Ast, diagnostics: TypeDiagnostic[]): void {
  switch (node[0]) {
    case NodeTypes.Function: {
      const [, bodyNodes] = node[1] as [AstNode[], AstNode[]]
      verifyStatementList(bodyNodes, ast, diagnostics)
      return
    }
    case NodeTypes.Block:
      verifyStatementList(node[1] as AstNode[], ast, diagnostics)
      return
    case NodeTypes.WithHandler: {
      const [handlerExpr, bodyNodes] = node[1] as [AstNode, AstNode[]]
      visitNestedStatementLists(handlerExpr, ast, diagnostics)
      verifyStatementList(bodyNodes, ast, diagnostics)
      return
    }
    default:
      walkAstChildren(node, ast, diagnostics, true)
  }
}

function isAstNode(value: unknown): value is AstNode {
  return Array.isArray(value) && value.length >= 3 && isNodeType(value[0])
}

function getSymbolBindingName(binding: BindingTarget): string | undefined {
  if (binding[0] !== bindingTargetTypes.symbol) return undefined
  const [nameNode] = binding[1] as [AstNode, AstNode | undefined]
  return nameNode[0] === NodeTypes.Sym ? nameNode[1] as string : undefined
}

function resolveNodeSourceInfo(node: AstNode, ast: Ast) {
  const nodeId = node[2]
  if (!ast.sourceMap || nodeId <= 0) return undefined
  return resolveSourceCodeInfo(nodeId, ast.sourceMap) ?? undefined
}
