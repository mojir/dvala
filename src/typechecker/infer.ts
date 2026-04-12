/**
 * Simple-sub inference engine for Dvala.
 *
 * Adapted from Parreaux's Simple-sub — a simplified implementation of
 * Dolan's algebraic subtyping. Type variables accumulate bounds via
 * biunification (constrain lhs <: rhs). Let-polymorphism uses levels.
 *
 * This module provides:
 * - InferenceContext: manages type variable allocation and levels
 * - constrain(lhs, rhs): the core biunification function
 * - inferExpr(node, ctx, env): infers a type for an AST node
 */

import type { Type } from './types'
import {
  StringType, BooleanType, NullType,
  Unknown, Never,
  atom, literal, fn, array, tuple, union,
  typeToString,
} from './types'
import type { AstNode } from '../parser/types'
import { NodeTypes } from '../constants/constants'
import { getBuiltinType } from './builtinTypes'

// ---------------------------------------------------------------------------
// Type variable representation
// ---------------------------------------------------------------------------

/**
 * A mutable type variable. During inference, variables accumulate lower and
 * upper bounds. After inference, the bounds are resolved into a concrete type.
 *
 * The `level` field supports let-polymorphism: variables at a higher level
 * than the current scope are generalized (copied fresh) when referenced.
 */
export interface TypeVar {
  tag: 'Var'
  id: number
  level: number
  lowerBounds: Type[] // what this variable must contain (positive)
  upperBounds: Type[] // what this variable must fit within (negative)
}

// ---------------------------------------------------------------------------
// Inference context
// ---------------------------------------------------------------------------

/**
 * Manages type variable allocation, level tracking, and constraint caching.
 */
export class InferenceContext {
  private nextId = 0
  private _level = 0
  /** Cycle guard: tracks (lhs, rhs) pairs already processed by constrain. */
  private constraintCache = new Set<string>()

  get level(): number { return this._level }

  /** Allocate a fresh type variable at the current level. */
  freshVar(): TypeVar {
    const v: TypeVar = {
      tag: 'Var',
      id: this.nextId++,
      level: this._level,
      lowerBounds: [],
      upperBounds: [],
    }
    return v
  }

  /** Enter a new let-binding scope (raises the level). */
  enterLevel(): void { this._level++ }

  /** Leave a let-binding scope (lowers the level). */
  leaveLevel(): void { this._level-- }

  /** Reset the constraint cache (for fresh inference passes). */
  resetCache(): void { this.constraintCache.clear() }

  /**
   * Check if a constraint pair has been seen before (cycle guard).
   * Returns true if the pair was already in the cache.
   */
  checkAndAddConstraint(lhs: Type, rhs: Type): boolean {
    // Use object identity for variables, structural key for others
    const key = `${varKey(lhs)}<:${varKey(rhs)}`
    if (this.constraintCache.has(key)) return true
    this.constraintCache.add(key)
    return false
  }
}

function varKey(t: Type): string {
  if (t.tag === 'Var') return `v${t.id}`
  if (t.tag === 'Primitive') return `P:${t.name}`
  if (t.tag === 'Atom') return `A:${t.name}`
  if (t.tag === 'Literal') return `L:${String(t.value)}`
  if (t.tag === 'Function') return `F:${t.params.length}:${t.params.map(varKey).join(',')}:${varKey(t.ret)}`
  if (t.tag === 'Record') return `R:${[...t.fields.entries()].map(([k, v]) => `${k}=${varKey(v)}`).join(',')}`
  if (t.tag === 'Array') return `Ar:${varKey(t.element)}`
  if (t.tag === 'Tuple') return `Tu:${t.elements.map(varKey).join(',')}`
  if (t.tag === 'Union') return `U:${t.members.map(varKey).join('|')}`
  if (t.tag === 'Inter') return `I:${t.members.map(varKey).join('&')}`
  if (t.tag === 'Neg') return `N:${varKey(t.inner)}`
  if (t.tag === 'Unknown') return '?'
  if (t.tag === 'Never') return '!'
  return t.tag
}

// ---------------------------------------------------------------------------
// Constrain (biunification)
// ---------------------------------------------------------------------------

/**
 * The core of Simple-sub: propagate `lhs <: rhs` until everything
 * reduces to bounds on type variables.
 *
 * When a variable appears on the left, it gains an upper bound.
 * When a variable appears on the right, it gains a lower bound.
 * Existing bounds are then propagated transitively.
 */
export function constrain(ctx: InferenceContext, lhs: Type, rhs: Type): void {
  // Trivial cases
  if (lhs === rhs) return
  if (lhs.tag === 'Never' || rhs.tag === 'Unknown') return

  // Cycle guard
  if (ctx.checkAndAddConstraint(lhs, rhs)) return

  // --- Variable on the left: add upper bound + propagate ---
  if (lhs.tag === 'Var') {
    if (rhs.tag === 'Var' && lhs.id === rhs.id) return
    lhs.upperBounds.push(rhs)
    // Propagate: every existing lower bound must also be <: rhs
    for (const lb of lhs.lowerBounds) {
      constrain(ctx, lb, rhs)
    }
    return
  }

  // --- Variable on the right: add lower bound + propagate ---
  if (rhs.tag === 'Var') {
    rhs.lowerBounds.push(lhs)
    // Propagate: lhs must also be <: every existing upper bound
    for (const ub of rhs.upperBounds) {
      constrain(ctx, lhs, ub)
    }
    return
  }

  // --- Union on the left: each member must be <: rhs ---
  if (lhs.tag === 'Union') {
    for (const m of lhs.members) constrain(ctx, m, rhs)
    return
  }

  // --- Intersection on the left: any member satisfying rhs is enough ---
  // This is how overloaded function types work:
  //   (Number -> Number) & (Number[] -> Number[])  <:  (42 -> β)
  // The first overload matches (42 <: Number), so β gets lower bound Number.
  if (lhs.tag === 'Inter') {
    const errors: TypeInferenceError[] = []
    for (const m of lhs.members) {
      try {
        constrain(ctx, m, rhs)
        return // at least one member worked — done
      } catch (e) {
        if (e instanceof TypeInferenceError) {
          errors.push(e)
        } else {
          throw e
        }
      }
    }
    // No member worked — report the last error
    throw errors[errors.length - 1] ?? new TypeInferenceError(
      `No overload matches: ${typeToString(lhs)} is not a subtype of ${typeToString(rhs)}`,
    )
  }

  // --- Union on the right: lhs must be <: at least one member ---
  // Try each member; if one succeeds, we're done.
  if (rhs.tag === 'Union') {
    // For concrete types, try to find a matching member
    const errors: TypeInferenceError[] = []
    for (const m of rhs.members) {
      try {
        constrain(ctx, lhs, m)
        return
      } catch (e) {
        if (e instanceof TypeInferenceError) {
          errors.push(e)
        } else {
          throw e
        }
      }
    }
    throw errors[errors.length - 1] ?? new TypeInferenceError(
      `${typeToString(lhs)} is not a subtype of ${typeToString(rhs)}`,
    )
  }

  // --- Intersection on the right: lhs must be <: each member ---
  if (rhs.tag === 'Inter') {
    for (const m of rhs.members) constrain(ctx, lhs, m)
    return
  }

  // --- Same-tag structural constraints ---

  // Primitives: same name is ok, different name is an error
  if (lhs.tag === 'Primitive' && rhs.tag === 'Primitive') {
    if (lhs.name !== rhs.name) {
      throw new TypeInferenceError(`${lhs.name} is not a subtype of ${rhs.name}`)
    }
    return
  }

  // Literal <: Primitive: check the match
  if (lhs.tag === 'Literal' && rhs.tag === 'Primitive') {
    const ok = (typeof lhs.value === 'number' && rhs.name === 'Number')
      || (typeof lhs.value === 'string' && rhs.name === 'String')
      || (typeof lhs.value === 'boolean' && rhs.name === 'Boolean')
    if (!ok) {
      throw new TypeInferenceError(`${typeToString(lhs)} is not a subtype of ${rhs.name}`)
    }
    return
  }

  // Literal <: Literal: must be same value
  if (lhs.tag === 'Literal' && rhs.tag === 'Literal') {
    if (lhs.value !== rhs.value) {
      throw new TypeInferenceError(`${typeToString(lhs)} is not a subtype of ${typeToString(rhs)}`)
    }
    return
  }

  // Atom <: Atom: must be same name
  if (lhs.tag === 'Atom' && rhs.tag === 'Atom') {
    if (lhs.name !== rhs.name) {
      throw new TypeInferenceError(`:${lhs.name} is not a subtype of :${rhs.name}`)
    }
    return
  }

  // Function: contravariant params, covariant return
  if (lhs.tag === 'Function' && rhs.tag === 'Function') {
    if (lhs.params.length !== rhs.params.length) {
      throw new TypeInferenceError(
        `Function arity mismatch: expected ${rhs.params.length} params, got ${lhs.params.length}`,
      )
    }
    // Params: contravariant (FLIP direction)
    for (let i = 0; i < lhs.params.length; i++) {
      constrain(ctx, rhs.params[i]!, lhs.params[i]!)
    }
    // Return: covariant (KEEP direction)
    constrain(ctx, lhs.ret, rhs.ret)
    return
  }

  // Record: check that all rhs fields exist in lhs with subtypes
  if (lhs.tag === 'Record' && rhs.tag === 'Record') {
    for (const [name, rhsType] of rhs.fields) {
      const lhsType = lhs.fields.get(name)
      if (!lhsType) {
        if (lhs.open) {
          // Open record — field might exist, can't prove it doesn't.
          // In inference, this means we can't constrain further.
          continue
        }
        throw new TypeInferenceError(`Missing field '${name}' in ${typeToString(lhs)}`)
      }
      constrain(ctx, lhsType, rhsType)
    }
    return
  }

  // Array: covariant element type
  if (lhs.tag === 'Array' && rhs.tag === 'Array') {
    constrain(ctx, lhs.element, rhs.element)
    return
  }

  // Tuple: element-wise covariant, same length
  if (lhs.tag === 'Tuple' && rhs.tag === 'Tuple') {
    if (lhs.elements.length !== rhs.elements.length) {
      throw new TypeInferenceError(
        `Tuple length mismatch: expected ${rhs.elements.length}, got ${lhs.elements.length}`,
      )
    }
    for (let i = 0; i < lhs.elements.length; i++) {
      constrain(ctx, lhs.elements[i]!, rhs.elements[i]!)
    }
    return
  }

  // Tuple <: Array: all elements <: array element
  if (lhs.tag === 'Tuple' && rhs.tag === 'Array') {
    for (const e of lhs.elements) {
      constrain(ctx, e, rhs.element)
    }
    return
  }

  // Regex: always compatible
  if (lhs.tag === 'Regex' && rhs.tag === 'Regex') return

  // --- Callable non-function types ---
  // In Dvala, records/arrays/strings can be called as functions.
  // x.name desugars to x("name"), so Record <: Function([String], retVar)
  // means field access.

  // Record called with string literal → field access
  if (lhs.tag === 'Record' && rhs.tag === 'Function' && rhs.params.length === 1) {
    const paramType = rhs.params[0]!
    if (paramType.tag === 'Literal' && typeof paramType.value === 'string') {
      const fieldName = paramType.value
      const fieldType = lhs.fields.get(fieldName)
      if (fieldType) {
        constrain(ctx, fieldType, rhs.ret)
        return
      }
      if (lhs.open) return // open record — can't prove the field doesn't exist
      throw new TypeInferenceError(`Field '${fieldName}' not found in ${typeToString(lhs)}`)
    }
  }

  // Array called with number → element access
  if (lhs.tag === 'Array' && rhs.tag === 'Function' && rhs.params.length === 1) {
    constrain(ctx, lhs.element, rhs.ret)
    return
  }

  // Tuple called with number → element access (conservative: union of elements)
  if (lhs.tag === 'Tuple' && rhs.tag === 'Function' && rhs.params.length === 1) {
    for (const elem of lhs.elements) {
      constrain(ctx, elem, rhs.ret)
    }
    return
  }

  // Incompatible types
  throw new TypeInferenceError(`${typeToString(lhs)} is not a subtype of ${typeToString(rhs)}`)
}

// ---------------------------------------------------------------------------
// Type environment
// ---------------------------------------------------------------------------

/** Maps variable names to their inferred types. Supports scoping via linked list. */
export class TypeEnv {
  private bindings: Map<string, Type>
  private parent: TypeEnv | null

  constructor(parent: TypeEnv | null = null) {
    this.bindings = new Map()
    this.parent = parent
  }

  /** Look up a variable's type in this scope or any parent. */
  lookup(name: string): Type | undefined {
    return this.bindings.get(name) ?? this.parent?.lookup(name)
  }

  /** Bind a variable in the current scope. */
  bind(name: string, type: Type): void {
    this.bindings.set(name, type)
  }

  /** Create a child scope. */
  child(): TypeEnv {
    return new TypeEnv(this)
  }
}

// ---------------------------------------------------------------------------
// AST type inference
// ---------------------------------------------------------------------------

/**
 * Infer the type of an AST expression.
 * Returns the inferred type and populates the type map (nodeId → Type).
 */
export function inferExpr(
  node: AstNode,
  ctx: InferenceContext,
  env: TypeEnv,
  typeMap: Map<number, Type>,
): Type {
  const nodeType = node[0] as string
  const payload = node[1]
  const nodeId = node[2]

  let result: Type

  switch (nodeType) {
    // --- Literals ---
    case NodeTypes.Num:
      result = literal(payload as number)
      break

    case NodeTypes.Str:
      result = literal(payload as string)
      break

    case NodeTypes.Atom:
      result = atom(payload as string)
      break

    // --- Variables ---
    case NodeTypes.Sym: {
      const name = payload as string
      const t = env.lookup(name)
      if (!t) {
        throw new TypeInferenceError(`Undefined variable: ${name}`)
      }
      // Let-polymorphism: freshen variables above current level
      result = freshen(ctx, t)
      break
    }

    // --- Builtin reference — look up type from parsed docs ---
    case NodeTypes.Builtin: {
      const builtinName = payload as string
      const info = getBuiltinType(builtinName)
      result = info.type
      break
    }

    // --- Boolean literals (encoded as Reserved symbols) ---
    case NodeTypes.Reserved: {
      const val = payload as string
      if (val === 'true') result = literal(true)
      else if (val === 'false') result = literal(false)
      else if (val === 'null') result = NullType
      else result = Unknown
      break
    }

    // --- Block (sequence of expressions) ---
    case NodeTypes.Block: {
      const nodes = payload as AstNode[]
      const blockEnv = env.child()
      let blockType: Type = NullType
      for (const stmt of nodes) {
        blockType = inferExpr(stmt, ctx, blockEnv, typeMap)
      }
      result = blockType
      break
    }

    // --- If expression ---
    case NodeTypes.If: {
      const [cond, thenNode, elseNode] = payload as [AstNode, AstNode, AstNode | undefined]
      const condType = inferExpr(cond, ctx, env, typeMap)
      constrain(ctx, condType, BooleanType)
      const thenType = inferExpr(thenNode, ctx, env, typeMap)
      if (elseNode) {
        const elseType = inferExpr(elseNode, ctx, env, typeMap)
        result = union(thenType, elseType)
      } else {
        result = union(thenType, NullType)
      }
      break
    }

    // --- Let binding ---
    case NodeTypes.Let: {
      const [binding, valueNode] = payload as [AstNode, AstNode]
      // Infer the value's type at a higher level for generalization
      ctx.enterLevel()
      const valueType = inferExpr(valueNode, ctx, env, typeMap)
      ctx.leaveLevel()
      // Bind the variable in the environment
      bindPattern(binding, valueType, env, ctx)
      result = valueType
      break
    }

    // --- Function definition ---
    case NodeTypes.Function: {
      const [params, bodyNodes] = payload as [AstNode[], AstNode[]]
      const funcEnv = env.child()
      const paramTypes: Type[] = []

      for (const param of params) {
        const paramVar = ctx.freshVar()
        paramTypes.push(paramVar)
        // Bind each parameter name in the function scope
        // Params are binding targets like ["symbol", [nameNode, default], id]
        bindPattern(param, paramVar, funcEnv, ctx)
      }

      // Infer the body — last expression is the return type
      let retType: Type = NullType
      for (const bodyNode of bodyNodes) {
        retType = inferExpr(bodyNode, ctx, funcEnv, typeMap)
      }

      result = fn(paramTypes, retType)
      break
    }

    // --- Function application (Call) ---
    case NodeTypes.Call: {
      const [calleeNode, argNodes] = payload as [AstNode, AstNode[]]
      const calleeType = inferExpr(calleeNode, ctx, env, typeMap)
      const argTypes = argNodes.map(arg => inferExpr(arg, ctx, env, typeMap))

      // Create a fresh variable for the return type
      const retVar = ctx.freshVar()

      // Constrain: callee <: (argTypes...) -> retVar
      // If the callee is a record and arg is a string, constrain() handles
      // this as property access (see Record <: Function case in constrain).
      constrain(ctx, calleeType, fn(argTypes, retVar))

      result = retVar
      break
    }

    // --- Array literal ---
    case NodeTypes.Array: {
      const elements = payload as AstNode[]
      if (elements.length === 0) {
        result = array(ctx.freshVar())
      } else {
        const elemTypes = elements.map(e => inferExpr(e, ctx, env, typeMap))
        // All elements contribute to a union of the element type
        const elemVar = ctx.freshVar()
        for (const et of elemTypes) {
          constrain(ctx, et, elemVar)
        }
        result = array(elemVar)
      }
      break
    }

    // --- Object literal ---
    case NodeTypes.Object: {
      const entries = payload as ([AstNode, AstNode] | AstNode)[]
      const fields = new Map<string, Type>()
      for (const entry of entries) {
        if (Array.isArray(entry) && entry.length === 2) {
          const [keyNode, valueNode] = entry
          // Key is either a string literal or a symbol
          const keyName = keyNode[0] === NodeTypes.Str
            ? keyNode[1] as string
            : keyNode[0] === NodeTypes.Sym
              ? keyNode[1] as string
              : String(keyNode[1])
          const valueType = inferExpr(valueNode, ctx, env, typeMap)
          fields.set(keyName, valueType)
        }
        // Spread entries are handled at a later step
      }
      result = { tag: 'Record', fields, open: false }
      break
    }

    // --- Perform (effect invocation) ---
    case NodeTypes.Perform:
      // Phase A: perform returns Unknown (effect typing comes in Phase B)
      result = Unknown
      break

    // --- Effect reference ---
    case NodeTypes.Effect:
      result = Unknown
      break

    // --- Template string ---
    case NodeTypes.TmplStr:
      result = StringType
      break

    // --- And / Or ---
    case NodeTypes.And:
    case NodeTypes.Or: {
      const operands = payload as AstNode[]
      // Both operands contribute to the result type
      const types = operands.map(op => inferExpr(op, ctx, env, typeMap))
      result = union(...types)
      break
    }

    // --- Nullish coalescing ---
    case NodeTypes.Qq: {
      const [left, right] = payload as [AstNode, AstNode]
      const leftType = inferExpr(left, ctx, env, typeMap)
      const rightType = inferExpr(right, ctx, env, typeMap)
      result = union(leftType, rightType)
      break
    }

    // --- Match ---
    case NodeTypes.Match: {
      const [matchExpr, ...cases] = payload as [AstNode, ...[AstNode, AstNode][]]
      inferExpr(matchExpr, ctx, env, typeMap)

      // Each branch produces a type; the result is their union
      const branchTypes: Type[] = []
      for (const matchCase of cases) {
        const [_pattern, body] = matchCase
        const branchType = inferExpr(body, ctx, env, typeMap)
        branchTypes.push(branchType)
      }
      result = branchTypes.length > 0 ? union(...branchTypes) : Never
      break
    }

    // --- Loop ---
    case NodeTypes.Loop: {
      // Loop returns whatever the body returns when it doesn't recur
      // For now, type it as Unknown (proper loop typing needs fixpoint)
      result = Unknown
      break
    }

    // --- For comprehension ---
    case NodeTypes.For:
      result = array(Unknown) // Conservative: array of unknown element type
      break

    // --- Import ---
    case NodeTypes.Import:
      result = Unknown // Module types are future work
      break

    // --- Handler, WithHandler, Resume ---
    case NodeTypes.Handler:
    case NodeTypes.WithHandler:
    case NodeTypes.Resume:
      result = Unknown // Handler typing is Phase C
      break

    // --- Macro, MacroCall ---
    case NodeTypes.Macro:
    case NodeTypes.MacroCall:
      result = Unknown // Macros produce AST data
      break

    // --- Recur ---
    case NodeTypes.Recur:
      result = Never // recur never returns (it jumps back to loop)
      break

    default:
      result = Unknown
  }

  // Record the inferred type in the side-table
  if (nodeId > 0) {
    typeMap.set(nodeId, result)
  }

  return result
}

// ---------------------------------------------------------------------------
// Let-polymorphism: freshen type variables above current level
// ---------------------------------------------------------------------------

/**
 * Copy a type, replacing any type variables at a level higher than the
 * current context level with fresh variables. This implements
 * let-polymorphism: each use of a polymorphic binding gets its own copy.
 */
function freshen(ctx: InferenceContext, t: Type): Type {
  if (t.tag !== 'Var' && !containsVarsAboveLevel(t, ctx.level)) return t
  return freshenInner(ctx, t, new Map())
}

function freshenInner(ctx: InferenceContext, t: Type, mapping: Map<number, TypeVar>): Type {
  switch (t.tag) {
    case 'Var': {
      if (t.level <= ctx.level) return t
      // Variable is above the current level — copy it
      const existing = mapping.get(t.id)
      if (existing) return existing
      const fresh = ctx.freshVar()
      mapping.set(t.id, fresh)
      // Copy bounds (freshened recursively)
      for (const lb of t.lowerBounds) {
        fresh.lowerBounds.push(freshenInner(ctx, lb, mapping))
      }
      for (const ub of t.upperBounds) {
        fresh.upperBounds.push(freshenInner(ctx, ub, mapping))
      }
      return fresh
    }
    case 'Function':
      return fn(
        t.params.map(p => freshenInner(ctx, p, mapping)),
        freshenInner(ctx, t.ret, mapping),
      )
    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [k, v] of t.fields) {
        fields.set(k, freshenInner(ctx, v, mapping))
      }
      return { tag: 'Record', fields, open: t.open }
    }
    case 'Array':
      return array(freshenInner(ctx, t.element, mapping))
    case 'Tuple':
      return tuple(t.elements.map(e => freshenInner(ctx, e, mapping)))
    case 'Union':
      return union(...t.members.map(m => freshenInner(ctx, m, mapping)))
    case 'Inter':
      return { tag: 'Inter', members: t.members.map(m => freshenInner(ctx, m, mapping)) }
    default:
      return t
  }
}

/** Check if a type contains any variables above the given level. */
function containsVarsAboveLevel(t: Type, level: number): boolean {
  switch (t.tag) {
    case 'Var': return t.level > level
    case 'Function': return t.params.some(p => containsVarsAboveLevel(p, level)) || containsVarsAboveLevel(t.ret, level)
    case 'Record': return [...t.fields.values()].some(v => containsVarsAboveLevel(v, level))
    case 'Array': return containsVarsAboveLevel(t.element, level)
    case 'Tuple': return t.elements.some(e => containsVarsAboveLevel(e, level))
    case 'Union':
    case 'Inter': return t.members.some(m => containsVarsAboveLevel(m, level))
    default: return false
  }
}

// ---------------------------------------------------------------------------
// Pattern binding helpers
// ---------------------------------------------------------------------------

/**
 * Bind a let-binding pattern to a type in the environment.
 * Binding targets are: ["symbol", [nameNode, default], id]
 *                      ["object", [fields, default], id]
 *                      ["array", [elements, default], id]
 *                      ["rest", [name, default], id]
 */
function bindPattern(pattern: AstNode, type: Type, env: TypeEnv, ctx?: InferenceContext): void {
  const patternType = pattern[0] as string
  switch (patternType) {
    case 'symbol': {
      // ["symbol", [["Sym", name, id], defaultNode | null], id]
      const [nameNode] = pattern[1] as [AstNode, AstNode | undefined]
      const name = nameNode[1] as string
      env.bind(name, type)
      break
    }
    case 'object': {
      // ["object", [{name: bindingTarget, ...}, default], id]
      // Constrain the value type as an open record with the destructured fields
      const [fieldsObj] = pattern[1] as [Record<string, AstNode>, AstNode | undefined]
      for (const [fieldName, fieldPattern] of Object.entries(fieldsObj)) {
        if (ctx) {
          // Create a fresh variable for the field type and constrain
          const fieldVar = ctx.freshVar()
          constrain(ctx, type, { tag: 'Record', fields: new Map([[fieldName, fieldVar]]), open: true })
          bindPattern(fieldPattern, fieldVar, env, ctx)
        } else {
          // Without context, bind as Unknown
          bindPattern(fieldPattern, Unknown, env)
        }
      }
      break
    }
    case 'array': {
      // ["array", [[bindingTarget, ...], default], id]
      const [elements] = pattern[1] as [AstNode[], AstNode | undefined]
      for (let i = 0; i < elements.length; i++) {
        const elem = elements[i]!
        if ((elem[0] as string) === 'rest') {
          // Rest element: ...rest gets the array type
          const [restName] = elem[1] as [string, AstNode | undefined]
          if (restName && restName !== 'rest') {
            env.bind(restName, type) // conservative: bind rest to the full type
          }
        } else if (ctx) {
          // Each element gets a fresh variable constrained by the array element type
          const elemVar = ctx.freshVar()
          if (type.tag === 'Tuple' && i < type.elements.length) {
            constrain(ctx, type.elements[i]!, elemVar)
          } else if (type.tag === 'Array') {
            constrain(ctx, type.element, elemVar)
          }
          bindPattern(elem, elemVar, env, ctx)
        } else {
          bindPattern(elem, Unknown, env)
        }
      }
      break
    }
    case 'rest': {
      // ["rest", [name, default], id]
      const [restName] = pattern[1] as [string, AstNode | undefined]
      if (restName) {
        env.bind(restName, type)
      }
      break
    }
    default:
      break
  }
}

// ---------------------------------------------------------------------------
// Expand type variables to concrete types
// ---------------------------------------------------------------------------

/**
 * Resolve a type by expanding all type variables to their bounds.
 * Positive polarity: variables expand to their lower bounds (union).
 * Negative polarity: variables expand to their upper bounds (intersection).
 */
export function expandType(t: Type, polarity: 'positive' | 'negative' = 'positive', visited = new Set<number>()): Type {
  switch (t.tag) {
    case 'Var': {
      if (visited.has(t.id)) return polarity === 'positive' ? Never : Unknown
      visited.add(t.id)
      if (polarity === 'positive') {
        // Positive: expand to union of lower bounds
        const expanded = t.lowerBounds.map(lb => expandType(lb, 'positive', visited))
        return expanded.length === 0 ? Never : expanded.length === 1 ? expanded[0]! : union(...expanded)
      } else {
        // Negative: expand to intersection of upper bounds
        const expanded = t.upperBounds.map(ub => expandType(ub, 'negative', visited))
        return expanded.length === 0 ? Unknown : expanded.length === 1 ? expanded[0]! : { tag: 'Inter', members: expanded }
      }
    }
    case 'Function':
      return fn(
        t.params.map(p => expandType(p, polarity === 'positive' ? 'negative' : 'positive', new Set(visited))),
        expandType(t.ret, polarity, new Set(visited)),
      )
    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [k, v] of t.fields) {
        fields.set(k, expandType(v, polarity, new Set(visited)))
      }
      return { tag: 'Record', fields, open: t.open }
    }
    case 'Array':
      return array(expandType(t.element, polarity, new Set(visited)))
    case 'Tuple':
      return tuple(t.elements.map(e => expandType(e, polarity, new Set(visited))))
    case 'Union':
      return union(...t.members.map(m => expandType(m, polarity, new Set(visited))))
    case 'Inter':
      return { tag: 'Inter', members: t.members.map(m => expandType(m, polarity, new Set(visited))) }
    default:
      return t
  }
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class TypeInferenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TypeInferenceError'
  }
}
