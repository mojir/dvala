/**
 * Builds a symbol table from a Dvala AST.
 *
 * Walks the AST collecting definitions (let bindings, function params, handler
 * clause params, for/match bindings) and references (every Sym node). Maintains
 * a static scope stack for symbol resolution — references are linked to the
 * nearest enclosing definition, or flagged as unresolved.
 *
 * Modeled on getUndefinedSymbols but instead of returning a set of names,
 * produces full SymbolDef[] and SymbolRef[] with source locations.
 */

import { NodeTypes } from '../constants/constants'
import { bindingTargetTypes } from '../parser/types'
import type { AstNode, BindingTarget, SourceMap, SourceMapPosition } from '../parser/types'
import type { SymbolDef, SymbolRef } from './types'

/** Scope entry: maps symbol name → definition */
type Scope = Map<string, SymbolDef>

interface BuilderState {
  definitions: SymbolDef[]
  references: SymbolRef[]
  scopes: Scope[] // stack of scopes, innermost last
  scopeDepth: number
  sourceMap: SourceMap | undefined
  filePath: string
  /** Set of all builtin names — references to these skip resolution */
  builtinNames: Set<string>
}

/**
 * Build a symbol table from AST nodes.
 * Returns all definitions and references found, with resolved cross-references.
 */
export function buildSymbolTable(
  nodes: AstNode[],
  sourceMap: SourceMap | undefined,
  filePath: string,
  builtinNames: Set<string>,
): { definitions: SymbolDef[]; references: SymbolRef[] } {
  const state: BuilderState = {
    definitions: [],
    references: [],
    scopes: [new Map()], // top-level scope
    scopeDepth: 0,
    sourceMap,
    filePath,
    builtinNames,
  }

  // Walk all top-level nodes as a sequence (let bindings are additive)
  walkSequence(nodes, state)

  return { definitions: state.definitions, references: state.references }
}

// ---------------------------------------------------------------------------
// AST walk
// ---------------------------------------------------------------------------

/** Walk a sequence of nodes where let bindings accumulate in the current scope. */
function walkSequence(nodes: AstNode[], state: BuilderState): void {
  for (const node of nodes) {
    walkNode(node, state)
  }
}

function walkNode(node: AstNode, state: BuilderState): void {
  const [type, payload, nodeId] = node

  switch (type) {
    case NodeTypes.Sym: {
      // Symbol reference — resolve against scope stack
      const name = payload as string
      if (state.builtinNames.has(name)) break // skip builtins
      const def = lookupScope(name, state)
      const location = nodeLocation(nodeId, state)
      state.references.push({ name, nodeId, location, resolvedDef: def })
      break
    }

    case NodeTypes.Let: {
      // let binding: [BindingTarget, valueExpr]
      const [target, valueExpr] = payload as [BindingTarget, AstNode]
      // Walk the value expression first (before the name is in scope)
      walkNode(valueExpr, state)
      // Register the defined names in the current scope
      registerBindingTarget(target, state, 'variable', valueExpr)
      break
    }

    case NodeTypes.Function:
    case NodeTypes.Macro: {
      // Function/macro: [BindingTarget[], AstNode[]] — params and body
      const [params, body] = payload as [BindingTarget[], AstNode[]]
      pushScope(state)
      for (const param of params) {
        registerBindingTarget(param, state, 'parameter')
      }
      walkSequence(body, state)
      popScope(state)
      break
    }

    case NodeTypes.Block: {
      // do...end block: new scope for inner let bindings
      const bodyNodes = payload as AstNode[]
      pushScope(state)
      walkSequence(bodyNodes, state)
      popScope(state)
      break
    }

    case NodeTypes.Handler: {
      // Handler: [clauses[], transform | null]
      const [clauses, transform] = payload as [
        { params: BindingTarget[]; body: AstNode[] }[],
        [BindingTarget, AstNode[]] | null,
      ]
      for (const clause of clauses) {
        pushScope(state)
        for (const param of clause.params) {
          registerBindingTarget(param, state, 'parameter')
        }
        walkSequence(clause.body, state)
        popScope(state)
      }
      if (transform) {
        pushScope(state)
        registerBindingTarget(transform[0], state, 'parameter')
        walkSequence(transform[1], state)
        popScope(state)
      }
      break
    }

    case NodeTypes.WithHandler: {
      // do with handler; body end: [handlerExpr, bodyNodes]
      const [handlerExpr, bodyNodes] = payload as [AstNode, AstNode[]]
      walkNode(handlerExpr, state)
      pushScope(state)
      walkSequence(bodyNodes, state)
      popScope(state)
      break
    }

    case NodeTypes.For: {
      // for: [LoopBindingNode[], bodyExpr]
      const [bindings, bodyExpr] = payload as [unknown[], AstNode]
      pushScope(state)
      for (const binding of bindings) {
        // LoopBindingNode: [[BindingTarget, collectionExpr], letBindings[], whenExpr?, whileExpr?]
        const [[target, collectionExpr], letBindings] = binding as [
          [BindingTarget, AstNode],
          [BindingTarget, AstNode][],
          ...unknown[],
        ]
        walkNode(collectionExpr, state)
        registerBindingTarget(target, state, 'variable')
        for (const [letTarget, letValue] of letBindings) {
          walkNode(letValue, state)
          registerBindingTarget(letTarget, state, 'variable')
        }
      }
      walkNode(bodyExpr, state)
      popScope(state)
      break
    }

    case NodeTypes.Loop: {
      // loop: [LoopBindingNode[], bodyExpr] — same structure as for
      const [bindings, bodyExpr] = payload as [unknown[], AstNode]
      pushScope(state)
      for (const binding of bindings) {
        const [[target, initExpr], letBindings] = binding as [
          [BindingTarget, AstNode],
          [BindingTarget, AstNode][],
          ...unknown[],
        ]
        walkNode(initExpr, state)
        registerBindingTarget(target, state, 'variable')
        for (const [letTarget, letValue] of letBindings) {
          walkNode(letValue, state)
          registerBindingTarget(letTarget, state, 'variable')
        }
      }
      walkNode(bodyExpr, state)
      popScope(state)
      break
    }

    case NodeTypes.Match: {
      // match: [expr, MatchCase[]] where MatchCase = [BindingTarget, bodyExpr, guardExpr?]
      const [expr, cases] = payload as [AstNode, [BindingTarget, AstNode, AstNode | undefined][]]
      walkNode(expr, state)
      for (const [pattern, body, guard] of cases) {
        pushScope(state)
        registerBindingTarget(pattern, state, 'variable')
        if (guard) walkNode(guard, state)
        walkNode(body, state)
        popScope(state)
      }
      break
    }

    case NodeTypes.If: {
      // if: [condition, thenBranch, elseBranch?]
      const parts = payload as AstNode[]
      for (const part of parts) {
        if (part) walkNode(part, state)
      }
      break
    }

    case NodeTypes.Call: {
      // Function call: [calleeNode | symbolNode, argNodes[]]
      const [callee, args] = payload as [AstNode, AstNode[]]
      walkNode(callee, state)
      for (const arg of args) {
        walkNode(arg, state)
      }
      break
    }

    case NodeTypes.MacroCall: {
      // #name expr: [symNode, argNodes[]]
      const [symNode, args] = payload as [AstNode, AstNode[]]
      walkNode(symNode, state)
      for (const arg of args) {
        walkNode(arg, state)
      }
      break
    }

    case NodeTypes.Array:
    case NodeTypes.Recur:
    case NodeTypes.Parallel:
    case NodeTypes.Race: {
      // Array of sub-expressions
      const elements = payload as AstNode[]
      for (const element of elements) {
        walkNode(element, state)
      }
      break
    }

    case NodeTypes.Object: {
      // Object entries: ([keyNode, valueNode] | SpreadNode)[]
      const entries = payload as (AstNode[] | AstNode)[]
      for (const entry of entries) {
        if (Array.isArray(entry) && Array.isArray(entry[0])) {
          const [key, value] = entry as [AstNode, AstNode]
          walkNode(key, state)
          walkNode(value, state)
        } else {
          walkNode(entry as AstNode, state)
        }
      }
      break
    }

    case NodeTypes.TmplStr: {
      // Template string segments
      const segments = payload as AstNode[]
      for (const segment of segments) {
        walkNode(segment, state)
      }
      break
    }

    case NodeTypes.Spread:
      walkNode(payload as AstNode, state)
      break

    case NodeTypes.And:
    case NodeTypes.Or:
    case NodeTypes.Qq: {
      const operands = payload as AstNode[]
      for (const operand of operands) {
        walkNode(operand, state)
      }
      break
    }

    case NodeTypes.Perform: {
      const [effectExpr, argExpr] = payload as [AstNode, AstNode | undefined]
      walkNode(effectExpr, state)
      if (argExpr) walkNode(argExpr, state)
      break
    }

    case NodeTypes.Resume: {
      const arg = payload as AstNode | 'ref'
      if (arg !== 'ref') walkNode(arg, state)
      break
    }

    case NodeTypes.Import:
      // Import expressions are handled at the WorkspaceIndex level
      break

    case NodeTypes.CodeTmpl: {
      // Code template: [templateNodes, spliceExprs]
      const [, spliceExprs] = payload as [AstNode[], AstNode[]]
      for (const expr of spliceExprs) {
        walkNode(expr, state)
      }
      break
    }

    // Leaf nodes — no children to walk
    case NodeTypes.Num:
    case NodeTypes.Str:
    case NodeTypes.Builtin:
    case NodeTypes.Special:
    case NodeTypes.Reserved:
    case NodeTypes.Binding:
    case NodeTypes.Effect:
    case NodeTypes.Splice:
    case NodeTypes.InlinedData:
    case NodeTypes.SpecialExpression:
      break
  }
}

// ---------------------------------------------------------------------------
// Scope management
// ---------------------------------------------------------------------------

function pushScope(state: BuilderState): void {
  state.scopeDepth++
  state.scopes.push(new Map())
}

function popScope(state: BuilderState): void {
  state.scopes.pop()
  state.scopeDepth--
}

function lookupScope(name: string, state: BuilderState): SymbolDef | null {
  // Walk from innermost scope outward
  for (let i = state.scopes.length - 1; i >= 0; i--) {
    const def = state.scopes[i]!.get(name)
    if (def) return def
  }
  return null
}

function currentScope(state: BuilderState): Scope {
  return state.scopes[state.scopes.length - 1]!
}

// ---------------------------------------------------------------------------
// Binding target registration
// ---------------------------------------------------------------------------

/**
 * Register all names from a binding target as definitions in the current scope.
 * Determines the kind based on the RHS expression when available.
 */
function registerBindingTarget(
  target: BindingTarget,
  state: BuilderState,
  defaultKind: SymbolDef['kind'],
  rhsNode?: AstNode,
): void {
  const kind = rhsNode ? classifyRhs(rhsNode, defaultKind) : defaultKind
  walkBindingTarget(target, state, kind)
}

/** Classify a let binding's kind from the RHS AST node. */
function classifyRhs(rhs: AstNode, fallback: SymbolDef['kind']): SymbolDef['kind'] {
  const type = rhs[0]
  if (type === NodeTypes.Function) return 'function'
  if (type === NodeTypes.Macro) return 'macro'
  if (type === NodeTypes.Handler) return 'handler'
  if (type === NodeTypes.Import) return 'import'
  return fallback
}

/** Recursively walk a binding target, registering each name as a definition. */
function walkBindingTarget(target: BindingTarget, state: BuilderState, kind: SymbolDef['kind']): void {
  const [targetType, targetPayload, targetNodeId] = target

  switch (targetType) {
    case bindingTargetTypes.symbol: {
      // [SymbolNode, defaultExpr?]
      const [symbolNode, defaultExpr] = targetPayload as [AstNode, AstNode | undefined]
      const name = symbolNode[1] as string
      const location = nodeLocation(symbolNode[2], state)
      const def: SymbolDef = { name, kind, nodeId: symbolNode[2], location, scope: state.scopeDepth }
      state.definitions.push(def)
      currentScope(state).set(name, def)
      // Walk default expression if present
      if (defaultExpr) walkNode(defaultExpr, state)
      break
    }
    case bindingTargetTypes.rest: {
      // [name, defaultExpr?]
      const [name, defaultExpr] = targetPayload as [string, AstNode | undefined]
      const location = nodeLocation(targetNodeId, state)
      const def: SymbolDef = { name, kind, nodeId: targetNodeId, location, scope: state.scopeDepth }
      state.definitions.push(def)
      currentScope(state).set(name, def)
      if (defaultExpr) walkNode(defaultExpr, state)
      break
    }
    case bindingTargetTypes.object: {
      // [Record<string, BindingTarget>, defaultExpr?]
      const [targets, defaultExpr] = targetPayload as [Record<string, BindingTarget>, AstNode | undefined]
      for (const subTarget of Object.values(targets)) {
        walkBindingTarget(subTarget, state, kind)
      }
      if (defaultExpr) walkNode(defaultExpr, state)
      break
    }
    case bindingTargetTypes.array: {
      // [(BindingTarget | null)[], defaultExpr?]
      const [targets, defaultExpr] = targetPayload as [(BindingTarget | null)[], AstNode | undefined]
      for (const subTarget of targets) {
        if (subTarget) walkBindingTarget(subTarget, state, kind)
      }
      if (defaultExpr) walkNode(defaultExpr, state)
      break
    }
    case bindingTargetTypes.literal:
    case bindingTargetTypes.wildcard:
      // No names to register
      break
  }
}

// ---------------------------------------------------------------------------
// Source location helpers
// ---------------------------------------------------------------------------

function nodeLocation(nodeId: number, state: BuilderState): { file: string; line: number; column: number } {
  if (!state.sourceMap) {
    return { file: state.filePath, line: 0, column: 0 }
  }
  const pos: SourceMapPosition | undefined = state.sourceMap.positions.get(nodeId)
  if (!pos) {
    return { file: state.filePath, line: 0, column: 0 }
  }
  const source = state.sourceMap.sources[pos.source]
  return {
    file: source?.path ?? state.filePath,
    line: pos.start[0] + 1, // source map is 0-based, we store 1-based
    column: pos.start[1] + 1,
  }
}
