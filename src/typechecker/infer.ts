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

import type { Type, EffectSet } from './types'
import {
  StringType, BooleanType, NullType,
  Unknown, Never, PureEffects, AnyFunction,
  atom, literal, fn, array, tuple, union, inter, neg, handlerType,
  functionAcceptsArity, functionArityLabel, getFunctionParamType,
  typeToString, typeEquals,
  subtractEffects,
} from './types'
import type { AstNode } from '../parser/types'
import { NodeTypes } from '../constants/constants'
import { getBuiltinType, getModuleType } from './builtinTypes'
import { parseTypeAnnotation } from './parseType'
import { getEffectDeclaration } from './effectTypes'
import { isSubtype } from './subtype'

interface ResumeContext {
  argType: Type
  answerType: Type
}

type HandledSignatureMap = Map<string, { argType: Type; retType: Type }>

const typeVarObjectIds = new WeakMap<TypeVar, number>()
let nextTypeVarObjectId = 0

function typeVarIdentity(typeVar: TypeVar): string {
  let objectId = typeVarObjectIds.get(typeVar)
  if (objectId === undefined) {
    objectId = nextTypeVarObjectId++
    typeVarObjectIds.set(typeVar, objectId)
  }
  return `v${objectId}`
}

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
  displayLowerBounds?: Type[] // hover-only viable lower-bound alternatives
  displayUpperBounds?: Type[] // hover-only viable upper-bound alternatives
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
  /** Type annotations from the parser side-table. Keyed by binding target nodeId. */
  typeAnnotations = new Map<number, string>()
  /** Resolves file imports for cross-file type checking. */
  resolveFileType?: (importPath: string) => Type
  /** Stack of effect sets — each function body pushes a new set. */
  private effectStack: EffectSet[] = [{ effects: new Set(), open: false }]
  /** Stack of active handler clause resume contexts. */
  private resumeStack: ResumeContext[] = []
  /** Active handled signatures available to direct perform() sites. */
  private handledSignatureStack: HandledSignatureMap[] = []
  /** Parameter vars proven to feed directly into a handler thunk call. */
  private wrappedThunkVarHandled = new Map<number, HandledSignatureMap>()
  /** Recoverable inference errors collected while continuing analysis. */
  private deferredErrors: TypeInferenceError[] = []

  get level(): number { return this._level }

  /** Get the current (innermost) effect set being built. */
  get currentEffects(): EffectSet { return this.effectStack[this.effectStack.length - 1]! }

  /** Push a fresh effect set (entering a function body). */
  pushEffects(): void { this.effectStack.push({ effects: new Set(), open: false }) }

  /** Pop and return the effect set (leaving a function body). */
  popEffects(): EffectSet { return this.effectStack.pop() ?? PureEffects }

  get currentResume(): ResumeContext | undefined {
    return this.resumeStack[this.resumeStack.length - 1]
  }

  pushResume(argType: Type, answerType: Type): void {
    this.resumeStack.push({ argType, answerType })
  }

  popResume(): void {
    this.resumeStack.pop()
  }

  get currentHandledSignatures(): HandledSignatureMap | undefined {
    return this.handledSignatureStack[this.handledSignatureStack.length - 1]
  }

  pushHandledSignatures(signatures: HandledSignatureMap): void {
    this.handledSignatureStack.push(signatures)
  }

  popHandledSignatures(): void {
    this.handledSignatureStack.pop()
  }

  noteWrappedThunkVar(varId: number, signatures: HandledSignatureMap): void {
    this.wrappedThunkVarHandled.set(varId, signatures)
  }

  getWrappedThunkVar(varId: number): HandledSignatureMap | undefined {
    return this.wrappedThunkVarHandled.get(varId)
  }

  deferError(error: TypeInferenceError): void {
    this.deferredErrors.push(error)
  }

  takeDeferredErrors(): TypeInferenceError[] {
    const errors = this.deferredErrors
    this.deferredErrors = []
    return errors
  }

  /** Record an effect in the current effect set. */
  addEffect(name: string): void { this.currentEffects.effects.add(name) }

  /** Merge an inferred effect set into the current effect context. */
  addEffects(effects: EffectSet): void {
    for (const effectName of effects.effects) {
      this.currentEffects.effects.add(effectName)
    }
    this.currentEffects.open = this.currentEffects.open || effects.open
  }

  /** Remove handled effects from the current set. */
  handleEffects(handled: Set<string>): void {
    const current = this.currentEffects
    const remaining = subtractEffects(current, handled)
    current.effects.clear()
    for (const e of remaining.effects) current.effects.add(e)
  }

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

  /** Snapshot the constraint cache size (for overload rollback). */
  snapshotCacheSize(): number { return this.constraintCache.size }

  /** Roll back the constraint cache to a previous size by removing recent entries. */
  restoreCacheSize(size: number): void {
    if (this.constraintCache.size > size) {
      // Set maintains insertion order — remove entries added after the snapshot
      const entries = [...this.constraintCache]
      this.constraintCache.clear()
      for (let i = 0; i < size; i++) this.constraintCache.add(entries[i]!)
    }
  }

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
  if (t.tag === 'Var') return typeVarIdentity(t)
  if (t.tag === 'Primitive') return `P:${t.name}`
  if (t.tag === 'Atom') return `A:${t.name}`
  if (t.tag === 'Literal') return `L:${String(t.value)}`
  if (t.tag === 'Function') return `F:${t.params.length}:${t.params.map(varKey).join(',')}:${t.restParam !== undefined ? `...${varKey(t.restParam)}:` : ''}${varKey(t.ret)}:${t.handlerWrapper ? `HW:${t.handlerWrapper.paramIndex}:${[...t.handlerWrapper.handled.entries()].map(([name, sig]) => `${name}:${varKey(sig.argType)}:${varKey(sig.retType)}`).join(',')}` : ''}`
  if (t.tag === 'Handler') return `H:${varKey(t.body)}:${varKey(t.output)}:${[...t.handled.entries()].map(([name, sig]) => `${name}:${varKey(sig.argType)}:${varKey(sig.retType)}`).join(',')}`
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
  if (lhs.tag === 'Never' || lhs.tag === 'Unknown' || rhs.tag === 'Unknown') return

  // Cycle guard
  if (ctx.checkAndAddConstraint(lhs, rhs)) return

  // Aliases are transparent during constraint solving.
  if (lhs.tag === 'Alias') {
    constrain(ctx, lhs.expanded, rhs)
    return
  }
  if (rhs.tag === 'Alias') {
    constrain(ctx, lhs, rhs.expanded)
    return
  }

  // --- Variable on the left: add upper bound + propagate ---
  if (lhs.tag === 'Var') {
    if (rhs.tag === 'Var' && lhs === rhs) return
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
  //
  // To avoid side-effect leakage from failed overloads, we snapshot variable
  // bounds before each attempt and roll back on failure.
  if (lhs.tag === 'Inter') {
    const errors: TypeInferenceError[] = []
    const successfulDeltas: VarBoundDelta[][] = []
    let firstSuccessfulDelta: VarBoundDelta[] | undefined
    for (const m of lhs.members) {
      // Snapshot bounds + cache so a failed overload doesn't leak side effects
      const boundsSnapshot = snapshotVarBounds(rhs)
      const cacheSnapshot = ctx.snapshotCacheSize()
      try {
        constrain(ctx, m, rhs)
        const delta = captureVarBoundDelta(boundsSnapshot)
        successfulDeltas.push(delta)
        if (!firstSuccessfulDelta) {
          firstSuccessfulDelta = delta
        }
        restoreVarBounds(boundsSnapshot)
        ctx.restoreCacheSize(cacheSnapshot)
      } catch (e) {
        if (e instanceof TypeInferenceError) {
          errors.push(e)
          restoreVarBounds(boundsSnapshot)
          ctx.restoreCacheSize(cacheSnapshot)
        } else {
          throw e
        }
      }
    }
    if (firstSuccessfulDelta) {
      replayVarBoundDeltaExact(ctx, firstSuccessfulDelta)
      annotateDisplayVarBoundDeltas(successfulDeltas)
      return
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

  // AnyFunction: any function type <: AnyFunction (any arity)
  if (rhs.tag === 'AnyFunction') {
    if (lhs.tag === 'Function' || lhs.tag === 'AnyFunction') return
    throw new TypeInferenceError(`${typeToString(lhs)} is not a function`)
  }

  // AnyFunction called as a concrete function — accept the call, result is Unknown.
  // This arises when a macro (typed AnyFunction) is called: constrain(AnyFunction, fn(args, retVar)).
  if (lhs.tag === 'AnyFunction' && rhs.tag === 'Function') {
    constrain(ctx, Unknown, rhs.ret)
    return
  }

  // Function: contravariant params, covariant return
  if (lhs.tag === 'Function' && rhs.tag === 'Function') {
    if (!isConstrainedFunctionArityCompatible(lhs, rhs)) {
      throw new TypeInferenceError(
        `Function arity mismatch: expected ${functionArityLabel(rhs)} params, got ${functionArityLabel(lhs)}`,
      )
    }
    // Params: contravariant (FLIP direction)
    for (let i = 0; i < Math.max(lhs.params.length, rhs.params.length); i++) {
      const lhsParam = getFunctionParamType(lhs, i)
      const rhsParam = getFunctionParamType(rhs, i)
      if (!lhsParam || !rhsParam) {
        throw new TypeInferenceError(
          `Function arity mismatch: expected ${functionArityLabel(rhs)} params, got ${functionArityLabel(lhs)}`,
        )
      }
      constrain(ctx, rhsParam, lhsParam)
    }
    if (rhs.restParam !== undefined) {
      if (lhs.restParam === undefined) {
        throw new TypeInferenceError(
          `Function arity mismatch: expected ${functionArityLabel(rhs)} params, got ${functionArityLabel(lhs)}`,
        )
      }
      constrain(ctx, rhs.restParam, lhs.restParam)
    }
    // Return: covariant (KEEP direction)
    constrain(ctx, lhs.ret, rhs.ret)
    return
  }

  if (lhs.tag === 'Handler' && rhs.tag === 'Handler') {
    for (const [name, rhsSig] of rhs.handled) {
      const lhsSig = lhs.handled.get(name)
      if (!lhsSig) {
        throw new TypeInferenceError(`Handler is missing clause @${name}`)
      }
      constrain(ctx, rhsSig.argType, lhsSig.argType)
      constrain(ctx, lhsSig.retType, rhsSig.retType)
    }
    constrain(ctx, lhs.body, rhs.body)
    constrain(ctx, lhs.output, rhs.output)
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
  if (lhs.tag === 'Record' && rhs.tag === 'Function' && rhs.params.length === 1 && rhs.restParam === undefined) {
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
  if (lhs.tag === 'Array' && rhs.tag === 'Function' && rhs.params.length === 1 && rhs.restParam === undefined) {
    constrain(ctx, lhs.element, rhs.ret)
    return
  }

  // Tuple called with number → element access (conservative: union of elements)
  if (lhs.tag === 'Tuple' && rhs.tag === 'Function' && rhs.params.length === 1 && rhs.restParam === undefined) {
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

  try {
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
        // Freshen type variables from the annotation so each use gets fresh copies.
        // Without this, type vars from polymorphic signatures (A[], (A)->B) -> B[]
        // would accumulate bounds across all call sites.
        result = freshenAnnotationVars(ctx, info.type)
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
        // Infer the value's type at a higher level for generalization.
        // Wrap in try/catch so that a type error in the value still binds the
        // variable as Unknown — this prevents cascading "undefined variable"
        // errors downstream (especially important for file imports).
        let valueType: Type
        ctx.enterLevel()
        try {
          valueType = inferExpr(valueNode, ctx, env, typeMap)
        } catch (e) {
          if (e instanceof TypeInferenceError) {
            if (e.nodeId === undefined) {
              e.nodeId = valueNode[2]
            }
            ctx.deferError(e)
            valueType = Unknown
          } else {
            throw e
          }
        }
        ctx.leaveLevel()

        // Check type annotation constraint: let x: T = expr → constrain expr <: T
        const bindingNodeId = binding[2]
        const annotation = ctx.typeAnnotations?.get(bindingNodeId)
        if (annotation) {
          const declaredType = parseTypeAnnotation(annotation)
          try {
            constrain(ctx, valueType, declaredType)
          } catch (error) {
            if (error instanceof TypeInferenceError && error.nodeId === undefined) {
              error.nodeId = valueNode[2]
            }
            throw error
          }
          const expandedValueType = expandType(valueType)
          if (!isSubtype(expandedValueType, declaredType)) {
            throw new TypeInferenceError(
              `${typeToString(expandedValueType)} is not a subtype of ${typeToString(declaredType)}`,
              valueNode[2],
            )
          }
        }

        // Bind the variable in the environment
        bindPattern(binding, valueType, env, ctx, typeMap)
        recordConcretePatternTypes(binding, valueType, typeMap)
        result = valueType
        break
      }

      // --- Function definition ---
      case NodeTypes.Function: {
        result = inferFunctionNode(node, ctx, env, typeMap)
        break
      }

      // --- Function application (Call) ---
      case NodeTypes.Call: {
        const [calleeNode, argNodes] = payload as [AstNode, AstNode[]]
        const calleeType = inferExpr(calleeNode, ctx, env, typeMap)
        const handlerAlternatives = getHandlerAlternatives(calleeType)

        if (handlerAlternatives.length > 0
        && argNodes.length === 1
        && isZeroArgFunctionNode(argNodes[0]!)) {
          const guaranteedHandled = intersectHandledSignatures(handlerAlternatives)
          ctx.pushHandledSignatures(guaranteedHandled)
          let thunkType: Type
          try {
            thunkType = inferFunctionNode(argNodes[0]!, ctx, env, typeMap, { inheritHandledSignatures: true })
          } finally {
            ctx.popHandledSignatures()
          }

          const thunkAlternatives = getFunctionAlternatives(thunkType)
          if (thunkAlternatives.length > 0 && thunkAlternatives.every(thunk => thunk.params.length === 0 && thunk.restParam === undefined)) {
            const requiredBodyType = handlerAlternatives.length === 1
              ? handlerAlternatives[0]!.body
              : inter(...handlerAlternatives.map(handler => handler.body))

            constrain(ctx, thunkType, fn([], requiredBodyType))

            const residualEffects = subtractEffects(
              unionEffectSets(thunkAlternatives.map(thunk => thunk.effects)),
              new Set(guaranteedHandled.keys()),
            )
            ctx.addEffects(residualEffects)

            result = handlerAlternatives.length === 1
              ? handlerAlternatives[0]!.output
              : union(...handlerAlternatives.map(handler => handler.output))
            break
          }
        }

        const functionAlternatives = getFunctionAlternatives(calleeType)
        const wrapperInfo = intersectFunctionWrapperInfo(functionAlternatives)
        const argTypes = argNodes.map((arg, index) => {
          if (wrapperInfo && wrapperInfo.paramIndex === index && isZeroArgFunctionNode(arg)) {
            ctx.pushHandledSignatures(wrapperInfo.handled)
            try {
              return inferFunctionNode(arg, ctx, env, typeMap, { inheritHandledSignatures: true })
            } finally {
              ctx.popHandledSignatures()
            }
          }
          return inferExpr(arg, ctx, env, typeMap)
        })
        const thunkAlternatives = argTypes.length === 1
          ? getFunctionAlternatives(argTypes[0]!)
          : []

        if (handlerAlternatives.length > 0 && thunkAlternatives.length > 0
        && thunkAlternatives.every(thunk => thunk.params.length === 0 && thunk.restParam === undefined)) {
          const requiredBodyType = handlerAlternatives.length === 1
            ? handlerAlternatives[0]!.body
            : inter(...handlerAlternatives.map(handler => handler.body))

          constrain(ctx, argTypes[0]!, fn([], requiredBodyType))

          const guaranteedHandled = intersectHandledSignatures(handlerAlternatives)
          const residualEffects = subtractEffects(
            unionEffectSets(thunkAlternatives.map(thunk => thunk.effects)),
            new Set(guaranteedHandled.keys()),
          )
          ctx.addEffects(residualEffects)

          result = handlerAlternatives.length === 1
            ? handlerAlternatives[0]!.output
            : union(...handlerAlternatives.map(handler => handler.output))
          break
        }

        if (handlerAlternatives.length > 0 && argTypes.length === 1) {
          const requiredBodyType = handlerAlternatives.length === 1
            ? handlerAlternatives[0]!.body
            : inter(...handlerAlternatives.map(handler => handler.body))
          const guaranteedHandled = intersectHandledSignatures(handlerAlternatives)

          constrain(ctx, argTypes[0]!, fn([], requiredBodyType))
          if (argTypes[0]!.tag === 'Var') {
            ctx.noteWrappedThunkVar(argTypes[0].id, guaranteedHandled)
          }

          result = handlerAlternatives.length === 1
            ? handlerAlternatives[0]!.output
            : union(...handlerAlternatives.map(handler => handler.output))
          break
        }

        // Create a fresh variable for the return type
        const retVar = ctx.freshVar()

        const selectedAlternative = selectFirstSuccessfulFunctionAlternative(ctx, functionAlternatives, argTypes)

        // Constrain: callee <: (argTypes...) -> retVar
        // If the callee is a record and arg is a string, constrain() handles
        // this as property access (see Record <: Function case in constrain).
        constrain(ctx, calleeType, fn(argTypes, retVar))
        recordSpecializedCalleeType(calleeNode, selectedAlternative, typeMap)

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
      case NodeTypes.Perform: {
      // perform(@eff, arg) — adds the effect to the current effect set
      // and returns the declared return type. Undeclared effects are errors.
        const [effectExpr, argExpr] = payload as [AstNode, AstNode | undefined]
        if (effectExpr[0] === NodeTypes.Effect) {
          const effectName = effectExpr[1] as string
          ctx.addEffect(effectName)

          // Prefer signatures guaranteed by the active handler context.
          // Fall back to explicit effect declarations when no handler proves it.
          const decl = ctx.currentHandledSignatures?.get(effectName) ?? getEffectDeclaration(effectName)
          if (!decl) {
            throw new TypeInferenceError(`Undeclared effect @${effectName} — add 'effect @${effectName}(ArgType) -> RetType' before use`)
          }

          // If there's an arg, constrain it against the declared arg type
          if (argExpr) {
            const argType = inferExpr(argExpr, ctx, env, typeMap)
            if (decl.argType.tag !== 'Unknown') {
              constrain(ctx, argType, decl.argType)
            }
          }

          // Return the declared return type
          result = decl.retType
        } else {
          result = Unknown
        }
        break
      }

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
      // ?? can have 2+ operands: a ?? b or ??(a, b, c)
        const operands = payload as AstNode[]
        const types = operands.map(op => inferExpr(op, ctx, env, typeMap))
        result = union(...types)
        break
      }

      // --- Match ---
      case NodeTypes.Match: {
      // Payload: [matchExpr, [case1, case2, ...]]
      // Each case: [pattern, body, guard | null]
        const matchPayload = payload as [AstNode, [AstNode, AstNode, AstNode | null][]]
        const matchExpr = matchPayload[0]
        const cases = matchPayload[1]
        const matchType = inferExpr(matchExpr, ctx, env, typeMap)

        // Track remaining type for exhaustiveness
        let remainingType: Type = expandType(matchType)

        const branchTypes: Type[] = []
        for (const [pattern, body, guard] of cases) {
          const caseEnv = env.child()
          const patternType = pattern[0] as string

          // Determine what type this pattern narrows to
          let narrowedType: Type | null = null

          switch (patternType) {
            case 'literal': {
            // case 0, case "hello", case :ok — narrows to the literal/atom type
              const [litNode] = pattern[1] as [AstNode]
              if (litNode[0] === NodeTypes.Num) narrowedType = literal(litNode[1] as number)
              else if (litNode[0] === NodeTypes.Str) narrowedType = literal(litNode[1] as string)
              else if (litNode[0] === NodeTypes.Atom) narrowedType = atom(litNode[1] as string)
              else if (litNode[0] === NodeTypes.Reserved) {
                if (litNode[1] === 'true') narrowedType = literal(true)
                else if (litNode[1] === 'false') narrowedType = literal(false)
                else if (litNode[1] === 'null') narrowedType = NullType
              }
              break
            }
            case 'symbol': {
            // case n — binds a variable, optionally narrowed by guard
              const [nameNode] = pattern[1] as [AstNode, AstNode | undefined]
              const name = nameNode[1] as string

              // Check guard for type narrowing: when isNumber(n) → narrow to Number
              let bindType: Type = matchType
              if (guard) {
                const guardNarrow = extractGuardNarrowing(guard, name)
                if (guardNarrow) {
                  narrowedType = guardNarrow
                  bindType = guardNarrow
                }
              }

              caseEnv.bind(name, bindType)
              // Record the binding's type for hover
              const nameNodeId = nameNode[2]
              if (nameNodeId > 0) {
                typeMap.set(nameNodeId, bindType)
              }
              break
            }
            case 'wildcard':
            // _ — matches everything, no narrowing
              break
            case 'object': {
            // case {name, age} — destructure and bind
              const [fieldsObj] = pattern[1] as [Record<string, AstNode>, AstNode | undefined]
              for (const [fieldName, fieldPattern] of Object.entries(fieldsObj)) {
                const fieldVar = ctx.freshVar()
                constrain(ctx, matchType, { tag: 'Record', fields: new Map([[fieldName, fieldVar]]), open: true })
                bindPattern(fieldPattern, fieldVar, caseEnv, ctx, typeMap)
              }
              break
            }
            default:
              break
          }

          // Infer body type in the case scope
          const bodyType = inferExpr(body, ctx, caseEnv, typeMap)
          branchTypes.push(bodyType)

          // Subtract the narrowed type from remaining for exhaustiveness
          if (narrowedType) {
            remainingType = subtractType(remainingType, narrowedType)
          } else if (patternType === 'wildcard') {
            remainingType = Never // wildcard catches everything
          }
        }

        // Exhaustiveness check: if remainder is not Never after all literal/atom
        // patterns, the match may not cover all cases. Only fires when the match
        // value is a union of literals/atoms (where exhaustiveness is meaningful).
        if (remainingType.tag !== 'Never'
        && remainingType.tag !== 'Unknown'
        && remainingType.tag !== 'Var'
        && (remainingType.tag === 'Atom' || remainingType.tag === 'Literal'
          || (remainingType.tag === 'Union' && remainingType.members.every(
            m => m.tag === 'Atom' || m.tag === 'Literal')))) {
          throw new TypeInferenceError(
            `Non-exhaustive match — unhandled: ${typeToString(remainingType)}`,
          )
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
      case NodeTypes.Import: {
        const moduleName = payload as string
        // File import (relative path) — resolve and typecheck the imported file
        if (moduleName.startsWith('.') && ctx.resolveFileType) {
          result = ctx.resolveFileType(moduleName)
        } else {
        // Module import — record of module exports with their declared types
          result = freshenAnnotationVars(ctx, getModuleType(moduleName))
        }
        break
      }

      // --- Handler (handler...end creates a handler value) ---
      case NodeTypes.Handler: {
        const [clauses, transform] = payload as [{ effectName: string; params: AstNode[]; body: AstNode[] }[], [AstNode, AstNode[]] | null, boolean]
        const bodyType = ctx.freshVar()
        const answerType = ctx.freshVar()
        const handled = new Map<string, { argType: Type; retType: Type }>()

        for (const clause of clauses) {
        // When a handler clause lacks a source-level effect declaration, infer
        // its payload/resume signature from how the clause body uses the
        // parameter and resume value. This lets wrapper helpers propagate
        // concrete perform-site types such as resume(null) -> Null.
          const effectDecl = getEffectDeclaration(clause.effectName)

          const clauseEnv = env.child()
          const declaredArgType = effectDecl?.argType ?? ctx.freshVar()
          const declaredRetType = effectDecl?.retType ?? ctx.freshVar()
          handled.set(clause.effectName, { argType: declaredArgType, retType: declaredRetType })

          for (const param of clause.params) {
            bindPattern(param, declaredArgType, clauseEnv, ctx, typeMap)
            const paramAnnotation = ctx.typeAnnotations?.get(param[2])
            if (paramAnnotation) {
              const annotatedType = parseTypeAnnotation(paramAnnotation)
              constrain(ctx, declaredArgType, annotatedType)
              constrain(ctx, annotatedType, declaredArgType)
            }
          }

          ctx.pushResume(declaredRetType, answerType)
          let clauseBodyType: Type = NullType
          for (const bodyNode of clause.body) {
            clauseBodyType = inferExpr(bodyNode, ctx, clauseEnv, typeMap)
          }
          ctx.popResume()
          constrain(ctx, clauseBodyType, answerType)
        }

        if (transform) {
          const [transformParam, transformBody] = transform
          const transformEnv = env.child()
          bindPattern(transformParam, bodyType, transformEnv, ctx, typeMap)
          let transformResult: Type = NullType
          for (const bodyNode of transformBody) {
            transformResult = inferExpr(bodyNode, ctx, transformEnv, typeMap)
          }
          constrain(ctx, transformResult, answerType)
          constrain(ctx, answerType, transformResult)
        } else {
          constrain(ctx, bodyType, answerType)
          constrain(ctx, answerType, bodyType)
        }

        result = handlerType(bodyType, answerType, finalizeHandledSignatures(handled))
        break
      }

      // --- WithHandler (do with handler; body end) ---
      case NodeTypes.WithHandler: {
        const [handlerExpr, bodyExprs] = payload as [AstNode, AstNode[]]
        const inferredHandlerType = inferExpr(handlerExpr, ctx, env, typeMap)
        const handlerAlternatives = getHandlerAlternatives(inferredHandlerType)

        let bodyType: Type = NullType

        if (handlerAlternatives.length > 0) {
          const requiredBodyType = handlerAlternatives.length === 1
            ? handlerAlternatives[0]!.body
            : inter(...handlerAlternatives.map(handler => handler.body))
          const guaranteedHandled = intersectHandledSignatures(handlerAlternatives)

          ctx.pushHandledSignatures(guaranteedHandled)
          try {
            for (const bodyNode of bodyExprs) {
              bodyType = inferExpr(bodyNode, ctx, env, typeMap)
            }
          } finally {
            ctx.popHandledSignatures()
          }
          constrain(ctx, bodyType, requiredBodyType)
          ctx.handleEffects(new Set(guaranteedHandled.keys()))

          result = handlerAlternatives.length === 1
            ? handlerAlternatives[0]!.output
            : union(...handlerAlternatives.map(handler => handler.output))
        } else {
          for (const bodyNode of bodyExprs) {
            bodyType = inferExpr(bodyNode, ctx, env, typeMap)
          }
          result = bodyType
        }
        break
      }

      // --- Resume ---
      case NodeTypes.Resume: {
        const resumeContext = ctx.currentResume
        if (!resumeContext) {
          throw new TypeInferenceError('resume can only be used inside a handler clause')
        }

        if (payload === 'ref') {
          result = fn([resumeContext.argType], resumeContext.answerType)
          break
        }

        const resumeArg = payload as AstNode
        const resumeArgType = inferExpr(resumeArg, ctx, env, typeMap)
        constrain(ctx, resumeArgType, resumeContext.argType)
        result = resumeContext.answerType
        break
      }

      // --- Macro, MacroCall ---
      case NodeTypes.Macro:
        result = AnyFunction // Macros are callable — type as AnyFunction so callers can invoke them
        break
      case NodeTypes.MacroCall:
        result = Unknown // Macro calls expand at compile time — result type unknown
        break

        // --- Recur ---
      case NodeTypes.Recur:
        result = Never // recur never returns (it jumps back to loop)
        break

      default:
        result = Unknown
    }
  } catch (error) {
    if (error instanceof TypeInferenceError && error.nodeId === undefined) {
      error.nodeId = nodeId
    }
    throw error
  }

  // Record the inferred type in the side-table
  if (nodeId > 0) {
    typeMap.set(nodeId, result)
  }

  return result
}

// ---------------------------------------------------------------------------
// Freshen annotation type variables
// ---------------------------------------------------------------------------

/**
 * Create fresh copies of all type variables in a parsed annotation type.
 * Each call to a polymorphic builtin like filter(A[], (A)->Boolean) -> A[]
 * needs its own set of type variables so constraints from one call don't
 * leak into another.
 */
function freshenAnnotationVars(ctx: InferenceContext, t: Type): Type {
  if (!containsVars(t)) return t
  return freshenAllVars(ctx, t, new Map())
}

function containsVars(t: Type): boolean {
  switch (t.tag) {
    case 'Var': return true
    case 'Function': return t.params.some(containsVars) || (t.restParam !== undefined && containsVars(t.restParam)) || containsVars(t.ret)
    case 'Handler': {
      if (containsVars(t.body) || containsVars(t.output)) return true
      for (const sig of t.handled.values()) {
        if (containsVars(sig.argType) || containsVars(sig.retType)) return true
      }
      return false
    }
    case 'Record': return [...t.fields.values()].some(containsVars)
    case 'Array': return containsVars(t.element)
    case 'Tuple': return t.elements.some(containsVars)
    case 'Union':
    case 'Inter': return t.members.some(containsVars)
    case 'Neg': return containsVars(t.inner)
    default: return false
  }
}

function freshenAllVars(ctx: InferenceContext, t: Type, mapping: Map<string, TypeVar>): Type {
  switch (t.tag) {
    case 'Var': {
      const existing = mapping.get(typeVarIdentity(t))
      if (existing) return existing
      const fresh = ctx.freshVar()
      mapping.set(typeVarIdentity(t), fresh)
      return fresh
    }
    case 'Function':
      return fn(
        t.params.map(p => freshenAllVars(ctx, p, mapping)),
        freshenAllVars(ctx, t.ret, mapping),
        t.effects,
        t.handlerWrapper,
        t.restParam !== undefined ? freshenAllVars(ctx, t.restParam, mapping) : undefined,
      )
    case 'Handler': {
      const handled = new Map<string, { argType: Type; retType: Type }>()
      for (const [name, sig] of t.handled) {
        handled.set(name, {
          argType: freshenAllVars(ctx, sig.argType, mapping),
          retType: freshenAllVars(ctx, sig.retType, mapping),
        })
      }
      return handlerType(
        freshenAllVars(ctx, t.body, mapping),
        freshenAllVars(ctx, t.output, mapping),
        handled,
      )
    }
    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [k, v] of t.fields) fields.set(k, freshenAllVars(ctx, v, mapping))
      return { tag: 'Record', fields, open: t.open }
    }
    case 'Array': return array(freshenAllVars(ctx, t.element, mapping))
    case 'Tuple': return tuple(t.elements.map(e => freshenAllVars(ctx, e, mapping)))
    case 'Union': return union(...t.members.map(m => freshenAllVars(ctx, m, mapping)))
    case 'Inter': return { tag: 'Inter', members: t.members.map(m => freshenAllVars(ctx, m, mapping)) }
    case 'Neg': return { tag: 'Neg', inner: freshenAllVars(ctx, t.inner, mapping) }
    default: return t
  }
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

function freshenInner(ctx: InferenceContext, t: Type, mapping: Map<string, TypeVar>): Type {
  switch (t.tag) {
    case 'Var': {
      if (t.level <= ctx.level) return t
      // Variable is above the current level — copy it
      const existing = mapping.get(typeVarIdentity(t))
      if (existing) return existing
      const fresh = ctx.freshVar()
      mapping.set(typeVarIdentity(t), fresh)
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
        t.effects,
        t.handlerWrapper,
        t.restParam !== undefined ? freshenInner(ctx, t.restParam, mapping) : undefined,
      )
    case 'Handler': {
      const handled = new Map<string, { argType: Type; retType: Type }>()
      for (const [name, sig] of t.handled) {
        handled.set(name, {
          argType: freshenInner(ctx, sig.argType, mapping),
          retType: freshenInner(ctx, sig.retType, mapping),
        })
      }
      return handlerType(
        freshenInner(ctx, t.body, mapping),
        freshenInner(ctx, t.output, mapping),
        handled,
      )
    }
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
    case 'Neg':
      return { tag: 'Neg', inner: freshenInner(ctx, t.inner, mapping) }
    default:
      return t
  }
}

/** Check if a type contains any variables above the given level. */
function containsVarsAboveLevel(t: Type, level: number): boolean {
  switch (t.tag) {
    case 'Var': return t.level > level
    case 'Function': return t.params.some(p => containsVarsAboveLevel(p, level)) || (t.restParam !== undefined && containsVarsAboveLevel(t.restParam, level)) || containsVarsAboveLevel(t.ret, level)
    case 'Handler': {
      if (containsVarsAboveLevel(t.body, level) || containsVarsAboveLevel(t.output, level)) return true
      for (const sig of t.handled.values()) {
        if (containsVarsAboveLevel(sig.argType, level) || containsVarsAboveLevel(sig.retType, level)) {
          return true
        }
      }
      return false
    }
    case 'Record': return [...t.fields.values()].some(v => containsVarsAboveLevel(v, level))
    case 'Array': return containsVarsAboveLevel(t.element, level)
    case 'Tuple': return t.elements.some(e => containsVarsAboveLevel(e, level))
    case 'Union':
    case 'Inter': return t.members.some(m => containsVarsAboveLevel(m, level))
    case 'Neg': return containsVarsAboveLevel(t.inner, level)
    default: return false
  }
}

// ---------------------------------------------------------------------------
// Variable bound snapshots (for overload rollback)
// ---------------------------------------------------------------------------

interface VarBoundSnapshot {
  var: TypeVar
  lowerLen: number
  upperLen: number
}

interface VarBoundDelta {
  var: TypeVar
  lowerBounds: Type[]
  upperBounds: Type[]
}

/** Snapshot the bounds of all type variables reachable from a type. */
function snapshotVarBounds(t: Type): VarBoundSnapshot[] {
  const result: VarBoundSnapshot[] = []
  const visited = new Set<string>()
  collectVars(t, result, visited)
  return result
}

function collectVars(t: Type, result: VarBoundSnapshot[], visited: Set<string>): void {
  switch (t.tag) {
    case 'Var':
      if (visited.has(typeVarIdentity(t))) return
      visited.add(typeVarIdentity(t))
      result.push({ var: t, lowerLen: t.lowerBounds.length, upperLen: t.upperBounds.length })
      for (const lb of t.lowerBounds) collectVars(lb, result, visited)
      for (const ub of t.upperBounds) collectVars(ub, result, visited)
      break
    case 'Function':
      for (const p of t.params) collectVars(p, result, visited)
      if (t.restParam !== undefined) collectVars(t.restParam, result, visited)
      collectVars(t.ret, result, visited)
      break
    case 'Handler':
      collectVars(t.body, result, visited)
      collectVars(t.output, result, visited)
      for (const sig of t.handled.values()) {
        collectVars(sig.argType, result, visited)
        collectVars(sig.retType, result, visited)
      }
      break
    case 'Record':
      for (const v of t.fields.values()) collectVars(v, result, visited)
      break
    case 'Array':
      collectVars(t.element, result, visited)
      break
    case 'Tuple':
      for (const e of t.elements) collectVars(e, result, visited)
      break
    case 'Union':
    case 'Inter':
      for (const m of t.members) collectVars(m, result, visited)
      break
  }
}

/** Restore variable bounds from a snapshot (truncate back to saved lengths). */
function restoreVarBounds(snapshot: VarBoundSnapshot[]): void {
  for (const s of snapshot) {
    s.var.lowerBounds.length = s.lowerLen
    s.var.upperBounds.length = s.upperLen
  }
}

function captureVarBoundDelta(snapshot: VarBoundSnapshot[]): VarBoundDelta[] {
  const deltas: VarBoundDelta[] = []
  for (const s of snapshot) {
    const lowerBounds = s.var.lowerBounds.slice(s.lowerLen)
    const upperBounds = s.var.upperBounds.slice(s.upperLen)
    if (lowerBounds.length === 0 && upperBounds.length === 0) continue
    deltas.push({ var: s.var, lowerBounds, upperBounds })
  }
  return deltas
}

function replayVarBoundDeltaExact(ctx: InferenceContext, deltas: VarBoundDelta[]): void {
  for (const delta of deltas) {
    for (const lowerBound of delta.lowerBounds) {
      constrain(ctx, lowerBound, delta.var)
    }
    for (const upperBound of delta.upperBounds) {
      constrain(ctx, delta.var, upperBound)
    }
  }
}

function annotateDisplayVarBoundDeltas(successfulDeltas: VarBoundDelta[][]): void {
  const merged = new Map<number, { var: TypeVar; lowerBounds: Type[]; upperBounds: Type[] }>()

  for (const deltas of successfulDeltas) {
    for (const delta of deltas) {
      const entry = merged.get(delta.var.id) ?? { var: delta.var, lowerBounds: [], upperBounds: [] }
      entry.lowerBounds.push(...delta.lowerBounds)
      entry.upperBounds.push(...delta.upperBounds)
      merged.set(delta.var.id, entry)
    }
  }

  for (const entry of merged.values()) {
    if (entry.lowerBounds.length > 0) {
      entry.var.displayLowerBounds = dedupeDisplayBounds(entry.var.displayLowerBounds ?? [], entry.lowerBounds)
    }
    if (entry.upperBounds.length > 0) {
      entry.var.displayUpperBounds = dedupeDisplayBounds(entry.var.displayUpperBounds ?? [], entry.upperBounds)
    }
  }
}

function dedupeDisplayBounds(existing: Type[], additions: Type[]): Type[] {
  const merged = [...existing]
  for (const candidate of additions) {
    if (!merged.some(bound => typeEquals(bound, candidate))) {
      merged.push(candidate)
    }
  }
  return merged
}

// ---------------------------------------------------------------------------
// Effect helpers
// ---------------------------------------------------------------------------

function getHandlerAlternatives(type: Type): Extract<Type, { tag: 'Handler' }>[] {
  const resolved = resolveHandlerCarrier(type)
  if (resolved.tag === 'Handler') return [resolved]
  if (resolved.tag === 'Union' && resolved.members.every(member => member.tag === 'Handler')) {
    return resolved.members
  }
  return []
}

function getFunctionAlternatives(type: Type): Extract<Type, { tag: 'Function' }>[] {
  const resolved = resolveCallableCarrier(type)
  if (resolved.tag === 'Function') return [resolved]
  if (resolved.tag === 'Inter' && resolved.members.every(member => member.tag === 'Function')) {
    return resolved.members
  }
  if (resolved.tag === 'Union' && resolved.members.every(member => member.tag === 'Function')) {
    return resolved.members
  }
  return []
}

function resolveHandlerCarrier(type: Type, visited = new Set<string>()): Type {
  return resolveCallableCarrier(type, visited)
}

function resolveCallableCarrier(type: Type, visited = new Set<string>()): Type {
  if (type.tag === 'Var') {
    if (visited.has(typeVarIdentity(type))) return type
    visited.add(typeVarIdentity(type))
    if (type.lowerBounds.length === 0) return type
    const resolvedBounds = type.lowerBounds.map(bound => resolveCallableCarrier(bound, visited))
    return resolvedBounds.length === 1 ? resolvedBounds[0]! : union(...resolvedBounds)
  }
  if (type.tag === 'Alias') return resolveCallableCarrier(type.expanded, visited)
  return type
}

function intersectHandledSignatures(
  handlers: Extract<Type, { tag: 'Handler' }>[],
): Map<string, { argType: Type; retType: Type }> {
  if (handlers.length === 0) return new Map()

  const intersection = new Map<string, { argType: Type; retType: Type }>()
  const [first, ...rest] = handlers
  for (const [name, sig] of first!.handled) {
    const shared = rest.every(handler => {
      const other = handler.handled.get(name)
      return other
        && typeEquals(sig.argType, other.argType)
        && typeEquals(sig.retType, other.retType)
    })
    if (shared) {
      intersection.set(name, sig)
    }
  }
  return intersection
}

function intersectFunctionWrapperInfo(
  functions: Extract<Type, { tag: 'Function' }>[],
): { paramIndex: number; handled: HandledSignatureMap } | undefined {
  if (functions.length === 0) return undefined
  const first = functions[0]!.handlerWrapper
  if (!first) return undefined

  const compatible = functions.every(fnType => {
    const wrapper = fnType.handlerWrapper
    if (!wrapper || wrapper.paramIndex !== first.paramIndex) return false
    if (wrapper.handled.size !== first.handled.size) return false
    for (const [name, sig] of first.handled) {
      const other = wrapper.handled.get(name)
      if (!other) return false
      if (!typeEquals(sig.argType, other.argType) || !typeEquals(sig.retType, other.retType)) {
        return false
      }
    }
    return true
  })

  return compatible ? first : undefined
}

function finalizeHandledSignatures(handled: HandledSignatureMap): HandledSignatureMap {
  const finalized = new Map<string, { argType: Type; retType: Type }>()

  for (const [name, sig] of handled) {
    finalized.set(name, {
      argType: finalizeInferredHandledType(sig.argType, 'negative'),
      retType: finalizeInferredHandledType(sig.retType, 'positive'),
    })
  }

  return finalized
}

function finalizeInferredHandledType(type: Type, polarity: 'positive' | 'negative'): Type {
  if (type.tag !== 'Var') return type
  if (type.lowerBounds.length === 0 && type.upperBounds.length === 0) {
    return Unknown
  }
  return expandType(type, polarity)
}

function unionEffectSets(effectSets: EffectSet[]): EffectSet {
  if (effectSets.length === 0) return PureEffects

  const effects = new Set<string>()
  let open = false
  for (const effectSet of effectSets) {
    for (const effectName of effectSet.effects) effects.add(effectName)
    open = open || effectSet.open
  }

  return { effects, open }
}

function recordSpecializedCalleeType(
  calleeNode: AstNode,
  selectedAlternative: Extract<Type, { tag: 'Function' }> | undefined,
  typeMap: Map<number, Type>,
): void {
  const calleeNodeId = calleeNode[2]
  if (calleeNodeId <= 0 || !selectedAlternative) return
  typeMap.set(calleeNodeId, selectedAlternative)
}

function selectFirstSuccessfulFunctionAlternative(
  ctx: InferenceContext,
  functionAlternatives: Extract<Type, { tag: 'Function' }>[],
  argTypes: Type[],
): Extract<Type, { tag: 'Function' }> | undefined {
  if (functionAlternatives.length <= 1) return undefined

  for (const alternative of functionAlternatives) {
    const probeRetVar = ctx.freshVar()
    const target = fn(argTypes, probeRetVar)
    const boundsSnapshot = snapshotVarBounds(target)
    const cacheSnapshot = ctx.snapshotCacheSize()

    try {
      constrain(ctx, alternative, target)
      restoreVarBounds(boundsSnapshot)
      ctx.restoreCacheSize(cacheSnapshot)
      return alternative
    } catch (error) {
      if (!(error instanceof TypeInferenceError)) {
        throw error
      }
      restoreVarBounds(boundsSnapshot)
      ctx.restoreCacheSize(cacheSnapshot)
    }
  }

  return undefined
}

function isZeroArgFunctionNode(node: AstNode): boolean {
  return node[0] === NodeTypes.Function && ((node[1] as [AstNode[], AstNode[]])[0]).length === 0
}

function inferFunctionNode(
  node: AstNode,
  ctx: InferenceContext,
  env: TypeEnv,
  typeMap: Map<number, Type>,
  options?: { inheritHandledSignatures?: boolean },
): Type {
  const payload = node[1] as [AstNode[], AstNode[]]
  const [params, bodyNodes] = payload
  const funcEnv = env.child()
  const paramTypes: Type[] = []
  const inheritedHandled = options?.inheritHandledSignatures ? ctx.currentHandledSignatures : undefined
  const suspendedHandled = inheritedHandled ? undefined : ctx.currentHandledSignatures

  if (suspendedHandled) {
    ctx.popHandledSignatures()
  }

  try {
    for (const param of params) {
      const paramVar = ctx.freshVar()
      paramTypes.push(paramVar)
      bindPattern(param, paramVar, funcEnv, ctx, typeMap)
      const paramAnnotation = ctx.typeAnnotations?.get(param[2])
      if (paramAnnotation) {
        const declaredType = parseTypeAnnotation(paramAnnotation)
        try {
          constrain(ctx, paramVar, declaredType)
        } catch (error) {
          if (error instanceof TypeInferenceError && error.nodeId === undefined) {
            error.nodeId = param[2]
          }
          throw error
        }
      }
    }

    ctx.pushEffects()

    let retType: Type = NullType
    for (const bodyNode of bodyNodes) {
      retType = inferExpr(bodyNode, ctx, funcEnv, typeMap)
    }

    const bodyEffects = ctx.popEffects()
    const handlerWrapper = inferFunctionWrapperInfo(paramTypes, ctx)
    const overloads = synthesizeFunctionOverloads(paramTypes, retType, bodyEffects, handlerWrapper)
    if (overloads) {
      return inter(...overloads)
    }
    return fn(paramTypes, retType, bodyEffects, handlerWrapper)
  } finally {
    if (suspendedHandled) {
      ctx.pushHandledSignatures(suspendedHandled)
    }
  }
}

function synthesizeFunctionOverloads(
  params: Type[],
  ret: Type,
  effects: EffectSet,
  handlerWrapper?: { paramIndex: number; handled: HandledSignatureMap },
): Extract<Type, { tag: 'Function' }>[] | undefined {
  const paramAlternatives = params.map(getDisplayUpperAlternatives)
  const retAlternatives = getDisplayLowerAlternatives(ret)

  if (!retAlternatives || retAlternatives.length < 2) return undefined
  if (paramAlternatives.some(alternatives => !alternatives || alternatives.length !== retAlternatives.length)) {
    return undefined
  }

  const overloads = retAlternatives.map((retAlternative, index) => fn(
    paramAlternatives.map(alternatives => alternatives![index]!),
    retAlternative,
    effects,
    handlerWrapper,
  ))

  return dedupeDisplayBounds([], overloads) as Extract<Type, { tag: 'Function' }>[]
}

function getDisplayUpperAlternatives(type: Type): Type[] | undefined {
  return type.tag === 'Var' && type.displayUpperBounds && type.displayUpperBounds.length > 0
    ? type.displayUpperBounds
    : undefined
}

function getDisplayLowerAlternatives(type: Type): Type[] | undefined {
  return type.tag === 'Var' && type.displayLowerBounds && type.displayLowerBounds.length > 0
    ? type.displayLowerBounds
    : undefined
}

function inferFunctionWrapperInfo(
  params: Type[],
  ctx: InferenceContext,
): { paramIndex: number; handled: HandledSignatureMap } | undefined {
  for (let index = 0; index < params.length; index++) {
    const param = params[index]!
    if (param.tag !== 'Var') continue
    const handled = ctx.getWrappedThunkVar(param.id)
    if (handled) return { paramIndex: index, handled }
  }
  return undefined
}

function isConstrainedFunctionArityCompatible(
  lhs: Extract<Type, { tag: 'Function' }>,
  rhs: Extract<Type, { tag: 'Function' }>,
): boolean {
  if (rhs.restParam !== undefined) {
    return lhs.restParam !== undefined && lhs.params.length <= rhs.params.length
  }
  return functionAcceptsArity(lhs, rhs.params.length)
}

// ---------------------------------------------------------------------------
// Match narrowing helpers
// ---------------------------------------------------------------------------

/**
 * Extract type narrowing from a guard expression.
 * Recognizes patterns like `isNumber(n)` → returns NumberType.
 * Uses the builtin type guard info from the type registry.
 */
function extractGuardNarrowing(guard: AstNode, boundName: string): Type | null {
  // Guard must be a Call to a builtin: ["Call", [["Builtin", name, id], [["Sym", boundName, id]]], id]
  if (guard[0] !== NodeTypes.Call) return null
  const [calleeNode, argNodes] = guard[1] as [AstNode, AstNode[]]
  if (calleeNode[0] !== NodeTypes.Builtin) return null
  if (argNodes.length !== 1) return null

  const argNode = argNodes[0]!
  if (argNode[0] !== NodeTypes.Sym) return null
  if (argNode[1] !== boundName) return null

  // Look up type guard info for the builtin
  const builtinName = calleeNode[1] as string
  const info = getBuiltinType(builtinName)
  if (info.guardType) {
    return info.guardType
  }

  return null
}

/**
 * Subtract one type from another: remainingType \ narrowedType.
 * Used for exhaustiveness checking — each match clause subtracts
 * its pattern type from the remaining unmatched type.
 */
function subtractType(from: Type, subtract: Type): Type {
  // If subtracting from a union, remove matching members
  if (from.tag === 'Union') {
    const remaining = from.members.filter(m => !typeEquals(m, subtract))
    if (remaining.length === 0) return Never
    if (remaining.length === 1) return remaining[0]!
    return { tag: 'Union', members: remaining }
  }

  // If subtracting the exact same type, result is Never
  if (typeEquals(from, subtract)) return Never

  // If subtracting a literal from a primitive, can't simplify further
  // (would need full set-theoretic complement which is deferred)
  return from
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
function bindPattern(pattern: AstNode, type: Type, env: TypeEnv, ctx?: InferenceContext, typeMap?: Map<number, Type>): void {
  const patternType = pattern[0] as string
  switch (patternType) {
    case 'symbol': {
      // ["symbol", [["Sym", name, id], defaultNode | null], id]
      const [nameNode] = pattern[1] as [AstNode, AstNode | undefined]
      const name = nameNode[1] as string
      env.bind(name, type)
      // Record the individual binding's type so hover shows it (not the parent)
      const nameNodeId = nameNode[2]
      if (typeMap && nameNodeId > 0) {
        typeMap.set(nameNodeId, type)
      }
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
          bindPattern(fieldPattern, fieldVar, env, ctx, typeMap)
        } else {
          // Without context, bind as Unknown
          bindPattern(fieldPattern, Unknown, env, undefined, typeMap)
        }
      }
      break
    }
    case 'array': {
      // ["array", [[bindingTarget, ...], default], id]
      const [elements] = pattern[1] as [AstNode[], AstNode | undefined]
      for (let i = 0; i < elements.length; i++) {
        const elem = elements[i]
        if (!elem) continue // null = skipped position (e.g., let [, , third] = arr)
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
          bindPattern(elem, elemVar, env, ctx, typeMap)
        } else {
          bindPattern(elem, Unknown, env, undefined, typeMap)
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

/**
 * For hover, prefer concrete destructured field/element types when they can be
 * recovered from the bound value's expanded shape.
 */
function recordConcretePatternTypes(pattern: AstNode, type: Type, typeMap: Map<number, Type>): void {
  const concreteType = expandType(type)
  const patternType = pattern[0] as string

  switch (patternType) {
    case 'symbol': {
      const [nameNode] = pattern[1] as [AstNode, AstNode | undefined]
      const nameNodeId = nameNode[2]
      if (nameNodeId > 0 && concreteType.tag !== 'Never' && concreteType.tag !== 'Unknown') {
        typeMap.set(nameNodeId, concreteType)
      }
      break
    }

    case 'object': {
      if (concreteType.tag !== 'Record') return
      const [fieldsObj] = pattern[1] as [Record<string, AstNode>, AstNode | undefined]
      for (const [fieldName, fieldPattern] of Object.entries(fieldsObj)) {
        const fieldType = concreteType.fields.get(fieldName)
        if (fieldType) {
          recordConcretePatternTypes(fieldPattern, fieldType, typeMap)
        }
      }
      break
    }

    case 'array': {
      const [elements] = pattern[1] as [AstNode[], AstNode | undefined]
      for (let i = 0; i < elements.length; i++) {
        const elem = elements[i]
        if (!elem || (elem[0] as string) === 'rest') continue
        if (concreteType.tag === 'Tuple' && i < concreteType.elements.length) {
          recordConcretePatternTypes(elem, concreteType.elements[i]!, typeMap)
        } else if (concreteType.tag === 'Array') {
          recordConcretePatternTypes(elem, concreteType.element, typeMap)
        }
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
export function expandType(t: Type, polarity: 'positive' | 'negative' = 'positive', visited = new Set<string>()): Type {
  switch (t.tag) {
    case 'Var': {
      if (visited.has(typeVarIdentity(t))) return polarity === 'positive' ? Never : Unknown
      visited.add(typeVarIdentity(t))
      if (polarity === 'positive') {
        // Positive: expand to union of lower bounds
        const expanded = t.lowerBounds.map(lb => expandType(lb, 'positive', visited))
        return expanded.length === 0 ? Never : expanded.length === 1 ? expanded[0]! : union(...expanded)
      } else {
        // Negative: expand to intersection of upper bounds
        const expanded = t.upperBounds.map(ub => expandType(ub, 'negative', visited))
        return expanded.length === 0 ? Unknown : expanded.length === 1 ? expanded[0]! : inter(...expanded)
      }
    }
    case 'Function':
      return fn(
        t.params.map(p => expandType(p, polarity === 'positive' ? 'negative' : 'positive', new Set(visited))),
        expandType(t.ret, polarity, new Set(visited)),
        t.effects,
        t.handlerWrapper,
        t.restParam !== undefined
          ? expandType(t.restParam, polarity === 'positive' ? 'negative' : 'positive', new Set(visited))
          : undefined,
      )
    case 'Handler': {
      const handled = new Map<string, { argType: Type; retType: Type }>()
      for (const [name, sig] of t.handled) {
        handled.set(name, {
          argType: expandType(sig.argType, 'negative', new Set(visited)),
          retType: expandType(sig.retType, 'positive', new Set(visited)),
        })
      }
      return handlerType(
        expandType(t.body, 'positive', new Set(visited)),
        expandType(t.output, 'positive', new Set(visited)),
        handled,
      )
    }
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

/**
 * Expand a type for IDE display. Unlike semantic expansion, this prefers
 * readable upper-bound information over `Never` when a variable has no lower
 * bounds yet, and reconstructs record shapes from property-access constraints.
 */
export function expandTypeForDisplay(t: Type, polarity: 'positive' | 'negative' = 'positive', visited = new Set<string>()): Type {
  switch (t.tag) {
    case 'Var': {
      if (visited.has(typeVarIdentity(t))) return polarity === 'positive' ? Never : Unknown
      visited.add(typeVarIdentity(t))

      const recordDisplay = synthesizeRecordDisplayType(t, visited)
      if (recordDisplay) return recordDisplay

      if ((t.displayLowerBounds?.length ?? 0) > 0) {
        const candidates = t.displayLowerBounds!.map(lb => expandTypeForDisplay(lb, 'positive', new Set(visited)))
        return normalizeDisplayCandidates(candidates)
      }

      if ((t.displayUpperBounds?.length ?? 0) > 0) {
        const candidates = t.displayUpperBounds!.map(ub => expandTypeForDisplay(ub, 'positive', new Set(visited)))
        return normalizeDisplayCandidates(candidates)
      }

      if (t.lowerBounds.length === 0 && t.upperBounds.length > 0) {
        const candidates = t.upperBounds.map(ub => expandTypeForDisplay(ub, 'positive', new Set(visited)))
        return normalizeDisplayCandidates(candidates)
      }

      if (polarity === 'positive') {
        if (t.lowerBounds.length > 0) {
          const expanded = t.lowerBounds.map(lb => expandTypeForDisplay(lb, 'positive', new Set(visited)))
          return expanded.length === 1 ? expanded[0]! : union(...expanded)
        }
        if (t.upperBounds.length > 0) {
          const expanded = t.upperBounds.map(ub => expandTypeForDisplay(ub, 'negative', new Set(visited)))
          return expanded.length === 1 ? expanded[0]! : inter(...expanded)
        }
        return Never
      }

      const expanded = t.upperBounds.map(ub => expandTypeForDisplay(ub, 'negative', new Set(visited)))
      return expanded.length === 0 ? Unknown : expanded.length === 1 ? expanded[0]! : inter(...expanded)
    }
    case 'Function':
      return fn(
        t.params.map(p => expandTypeForDisplay(p, polarity === 'positive' ? 'negative' : 'positive', new Set(visited))),
        expandTypeForDisplay(t.ret, polarity, new Set(visited)),
        t.effects,
        t.handlerWrapper,
        t.restParam !== undefined
          ? expandTypeForDisplay(t.restParam, polarity === 'positive' ? 'negative' : 'positive', new Set(visited))
          : undefined,
      )
    case 'Handler': {
      const handled = new Map<string, { argType: Type; retType: Type }>()
      for (const [name, sig] of t.handled) {
        handled.set(name, {
          argType: expandTypeForDisplay(sig.argType, 'negative', new Set(visited)),
          retType: expandTypeForDisplay(sig.retType, 'positive', new Set(visited)),
        })
      }
      return handlerType(
        expandTypeForDisplay(t.body, 'positive', new Set(visited)),
        expandTypeForDisplay(t.output, 'positive', new Set(visited)),
        handled,
      )
    }
    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [name, fieldType] of t.fields) {
        fields.set(name, expandTypeForDisplay(fieldType, 'positive', new Set(visited)))
      }
      return { tag: 'Record', fields, open: t.open }
    }
    case 'Array':
      return array(expandTypeForDisplay(t.element, 'positive', new Set(visited)))
    case 'Tuple':
      return tuple(t.elements.map(element => expandTypeForDisplay(element, 'positive', new Set(visited))))
    case 'Union':
      return normalizeDisplayUnion(t.members.map(member => expandTypeForDisplay(member, polarity, new Set(visited))))
    case 'Inter':
      return inter(...t.members.map(member => expandTypeForDisplay(member, polarity, new Set(visited))))
    case 'Neg':
      return neg(expandTypeForDisplay(t.inner, polarity === 'positive' ? 'negative' : 'positive', new Set(visited)))
    case 'Alias':
      return { tag: 'Alias', name: t.name, args: t.args.map(arg => expandTypeForDisplay(arg, 'positive', new Set(visited))), expanded: expandTypeForDisplay(t.expanded, polarity, new Set(visited)) }
    case 'Recursive':
      return { tag: 'Recursive', id: t.id, body: expandTypeForDisplay(t.body, polarity, new Set(visited)) }
    default:
      return t
  }
}

export function sanitizeDisplayType(t: Type, nested = false): Type {
  if (nested && t.tag === 'Never') return Unknown

  switch (t.tag) {
    case 'Function':
      return fn(
        t.params.map(param => sanitizeDisplayType(param, true)),
        sanitizeDisplayType(t.ret, true),
        t.effects,
        t.handlerWrapper,
        t.restParam !== undefined ? sanitizeDisplayType(t.restParam, true) : undefined,
      )
    case 'Handler': {
      const handled = new Map<string, { argType: Type; retType: Type }>()
      for (const [name, sig] of t.handled) {
        handled.set(name, {
          argType: sanitizeDisplayType(sig.argType, true),
          retType: sanitizeDisplayType(sig.retType, true),
        })
      }
      return handlerType(
        sanitizeDisplayType(t.body, true),
        sanitizeDisplayType(t.output, true),
        handled,
      )
    }
    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [name, fieldType] of t.fields) {
        fields.set(name, sanitizeDisplayType(fieldType, true))
      }
      return { tag: 'Record', fields, open: t.open }
    }
    case 'Array':
      return array(sanitizeDisplayType(t.element, true))
    case 'Tuple':
      return tuple(t.elements.map(element => sanitizeDisplayType(element, true)))
    case 'Union':
      return union(...t.members.map(member => sanitizeDisplayType(member, true)))
    case 'Inter':
      return inter(...t.members.map(member => sanitizeDisplayType(member, true)))
    case 'Neg':
      return neg(sanitizeDisplayType(t.inner, true))
    case 'Alias':
      return { tag: 'Alias', name: t.name, args: t.args.map(arg => sanitizeDisplayType(arg, true)), expanded: sanitizeDisplayType(t.expanded, true) }
    case 'Recursive':
      return { tag: 'Recursive', id: t.id, body: sanitizeDisplayType(t.body, true) }
    default:
      return t
  }
}

function normalizeDisplayUnion(members: Type[]): Type {
  if (members.length === 0) return Never
  if (members.every(member => member.tag === 'Record')) {
    const open = members.some(member => member.open)
    const fieldNames = new Set<string>()
    for (const member of members) {
      for (const fieldName of member.fields.keys()) fieldNames.add(fieldName)
    }

    const mergedFields = new Map<string, Type>()
    for (const fieldName of fieldNames) {
      const candidates: Type[] = []
      for (const member of members) {
        const fieldType = member.fields.get(fieldName)
        if (fieldType) candidates.push(fieldType)
      }
      if (candidates.length > 0) {
        mergedFields.set(fieldName, normalizeDisplayCandidates(candidates))
      }
    }

    return { tag: 'Record', fields: mergedFields, open }
  }

  if (members.every(member => member.tag === 'Array')) {
    return array(union(...members.map(member => member.element)))
  }

  return union(...members)
}

function synthesizeRecordDisplayType(t: TypeVar, visited: Set<string>): Type | undefined {
  const fieldTypes = new Map<string, Type[]>()
  let sawRecordLikeInfo = false
  let open = false

  for (const lowerBound of t.lowerBounds) {
    const expanded = expandTypeForDisplay(lowerBound, 'positive', new Set(visited))
    if (expanded.tag !== 'Record') continue
    sawRecordLikeInfo = true
    open = open || expanded.open
    for (const [fieldName, fieldType] of expanded.fields) {
      const existing = fieldTypes.get(fieldName) ?? []
      existing.push(fieldType)
      fieldTypes.set(fieldName, existing)
    }
  }

  for (const upperBound of t.upperBounds) {
    if (upperBound.tag !== 'Function' || upperBound.params.length !== 1 || upperBound.restParam !== undefined) continue
    const fieldParam = upperBound.params[0]
    if (!fieldParam || fieldParam.tag !== 'Literal' || typeof fieldParam.value !== 'string') continue
    sawRecordLikeInfo = true
    const existing = fieldTypes.get(fieldParam.value) ?? []
    existing.push(expandTypeForDisplay(upperBound.ret, 'positive', new Set(visited)))
    fieldTypes.set(fieldParam.value, existing)
  }

  if (!sawRecordLikeInfo) return undefined

  const mergedFields = new Map<string, Type>()
  for (const [fieldName, candidates] of fieldTypes) {
    mergedFields.set(fieldName, normalizeDisplayCandidates(candidates))
  }

  return { tag: 'Record', fields: mergedFields, open }
}

function normalizeDisplayCandidates(candidates: Type[]): Type {
  if (candidates.length === 0) return Never
  if (candidates.length === 1) return candidates[0]!
  return normalizeDisplayUnion(candidates)
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class TypeInferenceError extends Error {
  nodeId?: number

  constructor(message: string, nodeId?: number) {
    super(message)
    this.name = 'TypeInferenceError'
    this.nodeId = nodeId
  }
}
