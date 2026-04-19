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

import type { Type, EffectSet, HandlerWrapperInfo, SequenceType } from './types'
import {
  StringType, BooleanType, NullType,
  Unknown, Never, PureEffects, AnyFunction,
  atom, literal, fn, array, tuple, union, inter, neg, handlerType, sequence, sequenceElementAt, sequenceMayHaveIndex, toSequenceType,
  functionAcceptsArity, functionArityLabel, getFunctionParamType,
  typeToString, typeEquals,
  subtractEffects,
} from './types'
import type { AstNode } from '../parser/types'
import { NodeTypes } from '../constants/constants'
import { getBuiltinType, getModuleType } from './builtinTypes'
import { collectSymRefs, literalTypeToAstNode, tryFoldBuiltinCall, tryFoldUserFunctionCall } from './constantFold'
import { FOLD_ENABLED } from './foldToggle'
import { parseTypeAnnotation } from './parseType'
import { getEffectDeclaration } from './effectTypes'
import { simplify } from './simplify'
import { isSubtype } from './subtype'

interface ResumeContext {
  argType: Type
  answerType: Type
}

type HandledSignatureMap = Map<string, { argType: Type; retType: Type }>

const typeVarObjectIds = new WeakMap<TypeVar, number>()
let nextTypeVarObjectId = 0
const GENERALIZED_LEVEL = Number.MAX_SAFE_INTEGER

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

function isGeneralizedTypeVar(typeVar: TypeVar): boolean {
  return typeVar.level === GENERALIZED_LEVEL
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
  /**
   * Whether constant folding runs during this inference pass. Defaults to
   * the `FOLD_ENABLED` env-var value; callers (typecheck entry points)
   * may override via the `fold` option on TypecheckOptions.
   */
  foldEnabled: boolean = FOLD_ENABLED
  /** Stack of effect sets — each function body pushes a new set. */
  private effectStack: EffectSet[] = [{ effects: new Set(), open: false }]
  /** Stack of active handler clause resume contexts. */
  private resumeStack: ResumeContext[] = []
  /** Active handled signatures available to direct perform() sites. */
  private handledSignatureStack: HandledSignatureMap[] = []
  /** Parameter vars proven to feed directly into a handler thunk call.
   * Stores both the handled signatures (for subtraction) and the introduced
   * effect set (for the application law's union). */
  private wrappedThunkVarHandled = new Map<number, { handled: HandledSignatureMap; introduced: EffectSet }>()
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

  noteWrappedThunkVar(varId: number, signatures: HandledSignatureMap, introduced: EffectSet): void {
    this.wrappedThunkVarHandled.set(varId, { handled: signatures, introduced })
  }

  getWrappedThunkVar(varId: number): { handled: HandledSignatureMap; introduced: EffectSet } | undefined {
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
  // The constraint cache uses these keys to skip redundant subtype checks,
  // so any field that affects subtyping must appear here. `introduced` is
  // included even though `constrain` for Handler does not yet compare it
  // (Phase 2.5 deferred) — once it does, two handler types differing only
  // in `introduced` must produce different cache keys.
  if (t.tag === 'Handler') return `H:${varKey(t.body)}:${varKey(t.output)}:${[...t.handled.entries()].map(([name, sig]) => `${name}:${varKey(sig.argType)}:${varKey(sig.retType)}`).join(',')}:I:${[...t.introduced.effects].sort().join(',')}${t.introduced.open ? ':open' : ''}`
  if (t.tag === 'Record') return `R:${[...t.fields.entries()].map(([k, v]) => `${k}=${varKey(v)}`).join(',')}`
  if (t.tag === 'Array') return `Ar:${varKey(t.element)}`
  if (t.tag === 'Tuple') return `Tu:${t.elements.map(varKey).join(',')}`
  if (t.tag === 'Sequence') return `Sq:${t.prefix.map(varKey).join(',')}:${varKey(t.rest)}:${t.minLength}:${t.maxLength ?? '*'}`
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
    // Note: `introduced` is not yet compared here (Phase 2.5 deferred),
    // even though `typeEquals` does compare it. The asymmetry is
    // intentional for now — Phase 4-B will add covariant subtyping on
    // `introduced` (a handler that introduces fewer effects is a
    // subtype of one that introduces more).
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

    if (!rhs.open) {
      if (lhs.open) {
        throw new TypeInferenceError(`Open record ${typeToString(lhs)} is not a subtype of closed record ${typeToString(rhs)}`)
      }

      for (const name of lhs.fields.keys()) {
        if (!rhs.fields.has(name)) {
          throw new TypeInferenceError(`Extra field '${name}' in ${typeToString(lhs)}`)
        }
      }
    }

    return
  }

  // Array: covariant element type
  if (lhs.tag === 'Array' && rhs.tag === 'Array') {
    constrain(ctx, lhs.element, rhs.element)
    return
  }

  const lhsSequence = toSequenceType(lhs)
  const rhsSequence = toSequenceType(rhs)
  if (lhsSequence && rhsSequence) {
    constrainSequenceSubtype(ctx, lhsSequence, rhsSequence)
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

  if (lhs.tag === 'Sequence' && rhs.tag === 'Function' && rhs.params.length === 1 && rhs.restParam === undefined) {
    constrain(ctx, sequenceElementType(lhs), rhs.ret)
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
  /**
   * Side map: function-value ASTs associated with `let` bindings whose RHS
   * is a `Function` node. Used by C6 (user-function fold) to reconstruct a
   * Call AST whose callee is the function body directly. Captured via
   * `bindFunctionAst` alongside the normal type binding.
   */
  private functionAsts: Map<string, AstNode>

  constructor(parent: TypeEnv | null = null) {
    this.bindings = new Map()
    this.functionAsts = new Map()
    this.parent = parent
  }

  /** Look up a variable's type in this scope or any parent. */
  lookup(name: string): Type | undefined {
    return this.bindings.get(name) ?? this.parent?.lookup(name)
  }

  /**
   * Look up a function AST associated with a binding. Returns the
   * Function-node AST that was bound via `let name = (...) -> ...` or
   * undefined if the binding isn't a direct function-literal.
   */
  lookupFunctionAst(name: string): AstNode | undefined {
    return this.functionAsts.get(name) ?? this.parent?.lookupFunctionAst(name)
  }

  /** Bind a variable in the current scope. */
  bind(name: string, type: Type): void {
    this.bindings.set(name, type)
  }

  /** Record that `name` was bound to a Function-node AST (C6). */
  bindFunctionAst(name: string, ast: AstNode): void {
    this.functionAsts.set(name, ast)
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
        const shadowed = lookupShadowedBuiltin(env, builtinName)
        if (shadowed) {
          result = freshen(ctx, shadowed)
          break
        }
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
        // Always infer both branches so type errors in dead code still
        // surface (design doc §If narrowing). With fold enabled and the
        // condition reducing to a literal boolean, narrow the result to
        // the live branch only — decision #8 / C8 of the folding design.
        const thenType = inferExpr(thenNode, ctx, env, typeMap)
        const elseType = elseNode ? inferExpr(elseNode, ctx, env, typeMap) : NullType
        if (ctx.foldEnabled) {
          const expandedCond = expandType(condType)
          if (expandedCond.tag === 'Literal' && expandedCond.value === true) {
            result = thenType
            break
          }
          if (expandedCond.tag === 'Literal' && expandedCond.value === false) {
            result = elseType
            break
          }
        }
        result = union(thenType, elseType)
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

        valueType = generalizeTypeVars(valueType, ctx.level)

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
        recordLiteralPatternTypes(binding, valueNode, typeMap)
        // C6: when `let name = (…) -> …`, stash the function AST so a later
        // Call to `name` can fold through the body. Only fires for direct
        // `symbol`-pattern bindings of `Function` nodes; destructuring and
        // non-function RHSs are ignored.
        if (valueNode[0] === NodeTypes.Function && (binding[0] as string) === 'symbol') {
          const [nameNode] = binding[1] as [AstNode, AstNode | undefined]
          env.bindFunctionAst(nameNode[1] as string, valueNode)
        }
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
            // Phase 4-B: union the handler's introduced effects back in,
            // mirroring the do-with-h application law. Union across
            // alternatives — any could be the active runtime handler.
            ctx.addEffects(unionEffectSets(handlerAlternatives.map(h => h.introduced)))

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

        // Phase 4-B application law for handler-wrapper functions: when the
        // callee carries HandlerWrapperInfo and the wrapper-arg is a thunk,
        // apply (thunk_effects \ wrapper.handled) ∪ wrapper.introduced to
        // the surrounding effect context. The thunk's own effects are
        // captured on its FunctionType.effects but otherwise wouldn't
        // propagate through the generic constrain path below — the thunk
        // is passed by value, not invoked here.
        if (wrapperInfo) {
          const wrapperThunkType = argTypes[wrapperInfo.paramIndex]
          if (wrapperThunkType) {
            const innerAlts = getFunctionAlternatives(wrapperThunkType)
            if (innerAlts.length > 0) {
              const thunkEffects = unionEffectSets(innerAlts.map(t => t.effects))
              const residual = subtractEffects(thunkEffects, new Set(wrapperInfo.handled.keys()))
              ctx.addEffects(residual)
              ctx.addEffects(wrapperInfo.introduced)
            }
          }
        }

        const runtimeAlignedCollectionResult = inferCollectionCall(
          calleeNode,
          argTypes,
          ctx,
          env,
          typeMap,
        )
        if (runtimeAlignedCollectionResult) {
          result = runtimeAlignedCollectionResult
          break
        }

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
          // Phase 4-B: union the handler's introduced effects, same as the
          // zero-arg branch above.
          ctx.addEffects(unionEffectSets(handlerAlternatives.map(h => h.introduced)))

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
            // Capture both subtraction (handled) and union (introduced)
            // sides of the application law. Conservative across alternatives:
            // any alternative might be active, so introduced is unioned.
            const introduced = unionEffectSets(handlerAlternatives.map(h => h.introduced))
            ctx.noteWrappedThunkVar(argTypes[0].id, guaranteedHandled, introduced)
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

        // Function-call effect propagation: a callee that declares effects
        // (e.g. `() -> @{io} Number`) performs those effects when called, so
        // they must flow into the surrounding effect context. Without this,
        // effects silently disappear across function-call boundaries —
        // `outer = () -> f()` where f performs @{io} would infer as pure.
        // Selects the matching alternative's effects when overload-resolved,
        // otherwise unions across alternatives as a conservative upper bound.
        const calledEffects = selectedAlternative
          ? selectedAlternative.effects
          : unionEffectSets(functionAlternatives.map(alt => alt.effects))
        ctx.addEffects(calledEffects)

        result = retVar

        // Constant folding: when the callee's effect set is empty and the
        // args are all reconstructible literals, run the call through the
        // fold sandbox and use the result as the inferred type. The gate
        // is the single effect-set check — no whitelist (decision #13).
        //
        // Two entry points:
        //  - `tryFoldBuiltinCall` for direct NodeTypes.Builtin callees.
        //  - `tryFoldUserFunctionCall` for NodeTypes.Sym callees that
        //    resolve to a user-defined function bound via
        //    `let name = (…) -> …`. The function AST is stashed on the
        //    TypeEnv at bind time (C6). Closure capture reconstruction is
        //    out of scope for v1 — functions that reference outer lets
        //    bail inside the sandbox and surface `@dvala.error`.
        //
        // Effects surfaced during fold (e.g. `@dvala.error` from a
        // division-by-zero the compiler can prove) become severity:'warning'
        // diagnostics — decision #2 of the folding design. See
        // design/archive/2026-04-16_constant-folding-in-types.md.
        if (ctx.foldEnabled
          && functionAlternatives.length > 0
          && functionAlternatives.every(alt => alt.effects.effects.size === 0 && !alt.effects.open)) {
          let foldOutcome = tryFoldBuiltinCall(calleeNode, argTypes)
          if (!foldOutcome && calleeNode[0] === NodeTypes.Sym) {
            const functionAst = env.lookupFunctionAst(calleeNode[1] as string)
            if (functionAst) {
              // C6a: reconstruct literal-typed closure captures so the
              // fold sandbox can resolve free vars. For each symbol
              // reference in the function body that resolves through the
              // outer TypeEnv, expand the type and convert to a literal
              // AST. If any capture's type isn't reconstructible, bail
              // silently — the function may still be called at runtime.
              // References that don't resolve in the TypeEnv are assumed
              // to be builtins (resolved globally by the sandbox) or
              // locally bound inside the function body.
              const captures = new Map<string, AstNode>()
              let capturesReconstructible = true
              for (const name of collectSymRefs(functionAst)) {
                const captureType = env.lookup(name)
                if (!captureType) continue
                const expanded = expandType(captureType)
                const valueAst = literalTypeToAstNode(expanded)
                if (!valueAst) {
                  capturesReconstructible = false
                  break
                }
                captures.set(name, valueAst)
              }
              if (capturesReconstructible) {
                foldOutcome = tryFoldUserFunctionCall(functionAst, argTypes, captures)
              }
            }
          }
          if (foldOutcome?.type) {
            result = foldOutcome.type
          } else if (foldOutcome?.effectName !== undefined) {
            ctx.deferError(new TypeInferenceError(
              `This expression will perform \`@${foldOutcome.effectName}\` at runtime`,
              nodeId,
              'warning',
            ))
          }
        }
        break
      }

      // --- Array literal ---
      case NodeTypes.Array: {
        const elements = payload as AstNode[]
        if (elements.length === 0) {
          result = array(ctx.freshVar())
        } else {
          // Check if any element is a spread — if so, fall back to homogeneous Array
          const hasSpread = elements.some(e => e[0] === NodeTypes.Spread)
          const elemTypes = elements.map(e => inferExpr(e, ctx, env, typeMap))
          if (hasSpread) {
            const elemVar = ctx.freshVar()
            for (const et of elemTypes) {
              constrain(ctx, et, elemVar)
            }
            result = array(elemVar)
          } else {
            // Fixed-length literal: infer as Tuple to preserve positional types
            result = tuple(elemTypes)
          }
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
            // Record value type on the key node so hovering on the key shows the field type
            const keyNodeId = keyNode[2]
            if (keyNodeId > 0) {
              typeMap.set(keyNodeId, valueType)
            }
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
        const types = operands.map(op => inferExpr(op, ctx, env, typeMap))
        // C7 / decision #9: narrow on literal-boolean operands. For &&,
        // a literal(false) short-circuits to literal(false); for ||, a
        // literal(true) short-circuits to literal(true). If every operand
        // is a literal boolean without a short-circuit, the result is the
        // last operand's type. A non-literal-boolean operand bails to the
        // union behaviour below. Restricted to literal booleans in v1;
        // truthiness narrowing on other literal values (0, "", null) is
        // a follow-up.
        if (ctx.foldEnabled && types.length > 0) {
          const shortCircuitValue = nodeType === NodeTypes.And ? false : true
          let narrowed: Type | undefined
          let allLiteralBool = true
          for (let i = 0; i < types.length; i++) {
            const expanded = expandType(types[i]!)
            if (expanded.tag === 'Literal' && expanded.value === shortCircuitValue) {
              narrowed = literal(shortCircuitValue)
              break
            }
            if (expanded.tag === 'Literal' && typeof expanded.value === 'boolean') {
              // Non-short-circuiting literal boolean — keep scanning.
              if (i === types.length - 1) narrowed = types[i]
              continue
            }
            allLiteralBool = false
            break
          }
          if (narrowed && allLiteralBool) {
            result = narrowed
            break
          }
        }
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
        const matchType = simplify(expandTypeForMatchAnalysis(inferExpr(matchExpr, ctx, env, typeMap)))
        const matchSpace = normalizeTrackableMatchSpace(matchType)

        // Track remaining type for exhaustiveness
        let remainingType: Type = matchSpace
        const checkExhaustiveness = isTrackableMatchRemainder(remainingType)

        const branchTypes: Type[] = []
        for (const [pattern, body, guard] of cases) {
          const caseEnv = env.child()
          const { matchedType, consumedType } = analyzeMatchCase(pattern, remainingType, guard, env)

          if (matchedType.tag === 'Never') {
            if (shouldWarnRedundantMatchCase(pattern, remainingType, matchSpace)) {
              ctx.deferError(new TypeInferenceError('Redundant match case — pattern is unreachable', pattern[2], 'warning'))
            }
            continue
          }

          switch (pattern[0] as string) {
            case 'symbol': {
              const [nameNode] = pattern[1] as [AstNode, AstNode | undefined]
              const name = nameNode[1] as string
              caseEnv.bind(name, matchedType)
              const nameNodeId = nameNode[2]
              if (nameNodeId > 0) {
                typeMap.set(nameNodeId, matchedType)
              }
              break
            }
            case 'array':
            case 'object':
              if (!bindMatchCasePattern(pattern, matchedType, caseEnv, ctx, typeMap)) {
                continue
              }
              break
            default:
              break
          }

          if (guard) {
            const guardType = inferExpr(guard, ctx, caseEnv, typeMap)
            constrain(ctx, guardType, BooleanType)
            // C9: a guard that folds to literal(false) makes this case
            // unreachable. Skip the body so its type doesn't contribute to
            // the result, and do NOT subtract consumedType from remaining —
            // the pattern shape is still unhandled, so exhaustiveness
            // correctly fires if no other case covers it. Symmetric to the
            // existing redundant-pattern warning (decision #6).
            if (ctx.foldEnabled) {
              const expandedGuard = expandType(guardType)
              if (expandedGuard.tag === 'Literal' && expandedGuard.value === false) {
                ctx.deferError(new TypeInferenceError(
                  'Redundant match case — guard is always false',
                  pattern[2],
                  'warning',
                ))
                continue
              }
            }
          }

          // Infer body type in the case scope
          const bodyType = inferExpr(body, ctx, caseEnv, typeMap)
          branchTypes.push(bodyType)

          // Subtract only what the clause definitely consumes.
          remainingType = simplify(subtractType(remainingType, consumedType))
        }

        // Exhaustiveness only fires for match spaces we can track precisely.
        if (checkExhaustiveness && remainingType.tag !== 'Never') {
          throw new TypeInferenceError(
            `Non-exhaustive match — unhandled: ${typeToString(remainingType)}`,
            nodeId,
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
        // Collect effects performed by clause bodies + the transform clause.
        // These are the effects that the handler will surface when applied —
        // not the effects it *catches*. Per Decision 2 of the handler-typing
        // design, a clause does not re-catch its own perform: the perform
        // escapes past this handler to the next outer one. So we DO NOT
        // subtract `handled` from `introduced`. Constructing a handler value
        // is itself pure; per-clause pushEffects/popEffects keeps the
        // recorded clause effects out of the surrounding context.
        const introducedSets: EffectSet[] = []

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
          ctx.pushEffects()
          let clauseBodyType: Type = NullType
          for (const bodyNode of clause.body) {
            clauseBodyType = inferExpr(bodyNode, ctx, clauseEnv, typeMap)
          }
          introducedSets.push(ctx.popEffects())
          ctx.popResume()
          constrain(ctx, clauseBodyType, answerType)
        }

        if (transform) {
          const [transformParam, transformBody] = transform
          const transformEnv = env.child()
          bindPattern(transformParam, bodyType, transformEnv, ctx, typeMap)
          ctx.pushEffects()
          let transformResult: Type = NullType
          for (const bodyNode of transformBody) {
            transformResult = inferExpr(bodyNode, ctx, transformEnv, typeMap)
          }
          introducedSets.push(ctx.popEffects())
          constrain(ctx, transformResult, answerType)
          constrain(ctx, answerType, transformResult)
        } else {
          constrain(ctx, bodyType, answerType)
          constrain(ctx, answerType, bodyType)
        }

        result = handlerType(
          bodyType,
          answerType,
          finalizeHandledSignatures(handled),
          unionEffectSets(introducedSets),
        )
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

          // Phase 3 of handler typing: after subtracting caught effects,
          // union back in the effects that the handler's own clauses
          // perform. Across multiple alternatives we conservatively take
          // the union — any of them could be the active one at runtime.
          // See design/active/2026-04-19_handler-typing.md.
          ctx.addEffects(unionEffectSets(handlerAlternatives.map(handler => handler.introduced)))

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
      // TODO Phase 4-A: when EffectSet gains row-variable identity, also
      // traverse `t.introduced`. Today EffectSet carries only string names
      // (no type vars), so this is a no-op.
      return false
    }
    case 'Record': return [...t.fields.values()].some(containsVars)
    case 'Array': return containsVars(t.element)
    case 'Tuple': return t.elements.some(containsVars)
    case 'Sequence': return t.prefix.some(containsVars) || containsVars(t.rest)
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
        t.introduced,
      )
    }
    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [k, v] of t.fields) fields.set(k, freshenAllVars(ctx, v, mapping))
      return { tag: 'Record', fields, open: t.open }
    }
    case 'Array': return array(freshenAllVars(ctx, t.element, mapping))
    case 'Tuple': return tuple(t.elements.map(e => freshenAllVars(ctx, e, mapping)))
    case 'Sequence':
      return sequence(
        t.prefix.map(member => freshenAllVars(ctx, member, mapping)),
        freshenAllVars(ctx, t.rest, mapping),
        t.minLength,
        t.maxLength,
      )
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
      if (!isGeneralizedTypeVar(t) && t.level <= ctx.level) return t
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
        t.introduced,
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
    case 'Sequence':
      return sequence(
        t.prefix.map(member => freshenInner(ctx, member, mapping)),
        freshenInner(ctx, t.rest, mapping),
        t.minLength,
        t.maxLength,
      )
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
    case 'Var': return isGeneralizedTypeVar(t) || t.level > level
    case 'Function': return t.params.some(p => containsVarsAboveLevel(p, level)) || (t.restParam !== undefined && containsVarsAboveLevel(t.restParam, level)) || containsVarsAboveLevel(t.ret, level)
    case 'Handler': {
      if (containsVarsAboveLevel(t.body, level) || containsVarsAboveLevel(t.output, level)) return true
      for (const sig of t.handled.values()) {
        if (containsVarsAboveLevel(sig.argType, level) || containsVarsAboveLevel(sig.retType, level)) {
          return true
        }
      }
      // TODO Phase 4-A: same as containsVars — traverse `t.introduced`
      // once EffectSet carries row-variable identity. No-op today.
      return false
    }
    case 'Record': return [...t.fields.values()].some(v => containsVarsAboveLevel(v, level))
    case 'Array': return containsVarsAboveLevel(t.element, level)
    case 'Tuple': return t.elements.some(e => containsVarsAboveLevel(e, level))
    case 'Sequence': return t.prefix.some(member => containsVarsAboveLevel(member, level)) || containsVarsAboveLevel(t.rest, level)
    case 'Union':
    case 'Inter': return t.members.some(m => containsVarsAboveLevel(m, level))
    case 'Neg': return containsVarsAboveLevel(t.inner, level)
    default: return false
  }
}

/**
 * Create a copy of the type where all type variables above `level` are replaced
 * with fresh copies at GENERALIZED_LEVEL. Original type variables and their
 * bounds are never mutated — the returned type is a new tree that shares
 * structure with the original wherever no generalization was needed.
 */
function generalizeTypeVars(t: Type, level: number): Type {
  const mapping = new Map<string, TypeVar>()
  return generalizeInner(t, level, mapping)
}

function generalizeInner(t: Type, level: number, mapping: Map<string, TypeVar>): Type {
  switch (t.tag) {
    case 'Var': {
      if (t.level <= level) return t

      const identity = typeVarIdentity(t)
      const existing = mapping.get(identity)
      if (existing) return existing

      // Create a generalized copy — same id for display, new object identity
      const copy: TypeVar = {
        tag: 'Var',
        id: t.id,
        level: GENERALIZED_LEVEL,
        lowerBounds: [],
        upperBounds: [],
      }
      // Register before recursing into bounds to handle cycles
      mapping.set(identity, copy)

      copy.lowerBounds = t.lowerBounds.map(lb => generalizeInner(lb, level, mapping))
      copy.upperBounds = t.upperBounds.map(ub => generalizeInner(ub, level, mapping))
      if (t.displayLowerBounds) {
        copy.displayLowerBounds = t.displayLowerBounds.map(lb => generalizeInner(lb, level, mapping))
      }
      if (t.displayUpperBounds) {
        copy.displayUpperBounds = t.displayUpperBounds.map(ub => generalizeInner(ub, level, mapping))
      }
      return copy
    }
    case 'Function': {
      const params = t.params.map(p => generalizeInner(p, level, mapping))
      const restParam = t.restParam !== undefined ? generalizeInner(t.restParam, level, mapping) : undefined
      const ret = generalizeInner(t.ret, level, mapping)
      if (params.every((p, i) => p === t.params[i]) && restParam === t.restParam && ret === t.ret) return t
      return fn(params, ret, t.effects, t.handlerWrapper, restParam)
    }
    case 'Handler': {
      const body = generalizeInner(t.body, level, mapping)
      const output = generalizeInner(t.output, level, mapping)
      let handledChanged = false
      const handled = new Map<string, { argType: Type; retType: Type }>()
      for (const [name, sig] of t.handled) {
        const argType = generalizeInner(sig.argType, level, mapping)
        const retType = generalizeInner(sig.retType, level, mapping)
        if (argType !== sig.argType || retType !== sig.retType) handledChanged = true
        handled.set(name, { argType, retType })
      }
      if (body === t.body && output === t.output && !handledChanged) return t
      return handlerType(body, output, handled, t.introduced)
    }
    case 'Record': {
      let changed = false
      const fields = new Map<string, Type>()
      for (const [k, v] of t.fields) {
        const gv = generalizeInner(v, level, mapping)
        if (gv !== v) changed = true
        fields.set(k, gv)
      }
      if (!changed) return t
      return { tag: 'Record', fields, open: t.open }
    }
    case 'Array': {
      const element = generalizeInner(t.element, level, mapping)
      return element === t.element ? t : array(element)
    }
    case 'Tuple': {
      const elements = t.elements.map(e => generalizeInner(e, level, mapping))
      return elements.every((e, i) => e === t.elements[i]) ? t : tuple(elements)
    }
    case 'Sequence': {
      const prefix = t.prefix.map(m => generalizeInner(m, level, mapping))
      const rest = generalizeInner(t.rest, level, mapping)
      if (prefix.every((m, i) => m === t.prefix[i]) && rest === t.rest) return t
      return sequence(prefix, rest, t.minLength, t.maxLength)
    }
    case 'Union': {
      const members = t.members.map(m => generalizeInner(m, level, mapping))
      return members.every((m, i) => m === t.members[i]) ? t : union(...members)
    }
    case 'Inter': {
      const members = t.members.map(m => generalizeInner(m, level, mapping))
      return members.every((m, i) => m === t.members[i]) ? t : inter(...members)
    }
    case 'Neg': {
      const inner = generalizeInner(t.inner, level, mapping)
      return inner === t.inner ? t : neg(inner)
    }
    case 'Alias': {
      const args = t.args.map(a => generalizeInner(a, level, mapping))
      const expanded = generalizeInner(t.expanded, level, mapping)
      if (args.every((a, i) => a === t.args[i]) && expanded === t.expanded) return t
      return { tag: 'Alias', name: t.name, args, expanded }
    }
    case 'Recursive': {
      const body = generalizeInner(t.body, level, mapping)
      return body === t.body ? t : { tag: 'Recursive', id: t.id, body }
    }
    default:
      return t
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
    case 'Sequence':
      for (const member of t.prefix) collectVars(member, result, visited)
      collectVars(t.rest, result, visited)
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

function lookupShadowedBuiltin(env: TypeEnv, name: string): Type | undefined {
  return env.lookup(name)
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
): HandlerWrapperInfo | undefined {
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

  if (!compatible) return undefined
  // Conservative across alternatives: take the union of introduced sets.
  // Any alternative could be the actual function called at runtime.
  return {
    paramIndex: first.paramIndex,
    handled: first.handled,
    introduced: unionEffectSets(functions.map(f => f.handlerWrapper?.introduced ?? PureEffects)),
  }
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
  handlerWrapper?: HandlerWrapperInfo,
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
): HandlerWrapperInfo | undefined {
  for (let index = 0; index < params.length; index++) {
    const param = params[index]!
    if (param.tag !== 'Var') continue
    const captured = ctx.getWrappedThunkVar(param.id)
    if (captured) return { paramIndex: index, handled: captured.handled, introduced: captured.introduced }
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
function extractGuardNarrowing(guard: AstNode, boundName: string, env: TypeEnv): Type | null {
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
  if (lookupShadowedBuiltin(env, builtinName)) return null
  const info = getBuiltinType(builtinName)
  if (info.guardType) {
    return info.guardType
  }

  return null
}

interface MatchCaseAnalysis {
  matchedType: Type
  consumedType: Type
}

function analyzeMatchCase(pattern: AstNode, candidateType: Type, guard: AstNode | null, env: TypeEnv): MatchCaseAnalysis {
  const matchedByPattern = matchedTypeForPattern(pattern, candidateType)
  if (matchedByPattern.tag === 'Never') {
    return { matchedType: Never, consumedType: Never }
  }

  if (!guard) {
    return { matchedType: matchedByPattern, consumedType: matchedByPattern }
  }

  // Try to narrow the consumed type using guard information.
  // For bare symbol patterns, the guard narrows the entire matched type.
  // For destructuring patterns, the guard may narrow individual bound names
  // at specific positions (e.g., `case [x, y] when isNumber(x)` narrows
  // position 0 to Number).
  const narrowed = narrowMatchedTypeByGuard(pattern, matchedByPattern, guard, env)
  if (narrowed) {
    return { matchedType: narrowed, consumedType: narrowed }
  }

  return { matchedType: matchedByPattern, consumedType: Never }
}

/**
 * Attempt to narrow a matched type using guard information.
 * Returns the narrowed type if any guard narrowing applies, or null if
 * the guard is opaque (can't extract narrowing information).
 */
function narrowMatchedTypeByGuard(pattern: AstNode, matchedType: Type, guard: AstNode, env: TypeEnv): Type | null {
  const patternType = pattern[0] as string

  switch (patternType) {
    case 'symbol': {
      const [nameNode] = pattern[1] as [AstNode, AstNode | undefined]
      const guardNarrow = extractGuardNarrowing(guard, nameNode[1] as string, env)
      return guardNarrow ? intersectMatchTypes(matchedType, guardNarrow) : null
    }

    case 'array': {
      const [elements] = pattern[1] as [AstNode[], AstNode | undefined]
      return narrowArrayMatchTypeByGuard(elements, matchedType, guard, env)
    }

    case 'object': {
      const [fieldsObj] = pattern[1] as [Record<string, AstNode>, AstNode | undefined]
      return narrowObjectMatchTypeByGuard(fieldsObj, matchedType, guard, env)
    }

    default:
      return null
  }
}

/**
 * For array destructuring patterns, check if the guard narrows any element
 * binding. If so, refine the matched type at that position.
 *
 * Example: `case [x, y] when isNumber(x)` with matched type `[Unknown, Unknown]`
 * narrows to `[Number, Unknown]`.
 */
function narrowArrayMatchTypeByGuard(
  elements: AstNode[],
  matchedType: Type,
  guard: AstNode,
  env: TypeEnv,
): Type | null {
  // Collect guard narrowings for bound element names
  const elementNarrowings = new Map<number, Type>()
  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i]
    if (!elem || (elem[0] as string) === 'rest') continue
    if ((elem[0] as string) !== 'symbol') continue

    const [nameNode] = elem[1] as [AstNode, AstNode | undefined]
    const boundName = nameNode[1] as string
    const guardNarrow = extractGuardNarrowing(guard, boundName, env)
    if (guardNarrow) {
      elementNarrowings.set(i, guardNarrow)
    }
  }

  if (elementNarrowings.size === 0) return null

  return narrowSequenceElementTypes(matchedType, elementNarrowings)
}

// Apply element-level narrowings to an array-like type (or union of them).
function narrowSequenceElementTypes(type: Type, elementNarrowings: Map<number, Type>): Type {
  if (type.tag === 'Union') {
    const narrowed = type.members
      .map(m => narrowSequenceElementTypes(m, elementNarrowings))
      .filter(m => m.tag !== 'Never')
    return narrowed.length === 0 ? Never : simplify(union(...narrowed))
  }

  const seq = toSequenceType(type)
  if (!seq) return type

  const narrowedPrefix = [...seq.prefix]
  for (const [index, guardType] of elementNarrowings) {
    while (narrowedPrefix.length <= index) {
      narrowedPrefix.push(seq.rest)
    }
    const narrowed = intersectMatchTypes(narrowedPrefix[index]!, guardType)
    if (narrowed.tag === 'Never') return Never
    narrowedPrefix[index] = narrowed
  }

  return simplify(sequence(narrowedPrefix, seq.rest, seq.minLength, seq.maxLength))
}

/**
 * For object destructuring patterns, check if the guard narrows any field
 * binding. If so, refine the matched type at that field.
 *
 * Example: `case { x, y } when isNumber(x)` with matched type `{x: Unknown, y: Unknown}`
 * narrows to `{x: Number, y: Unknown}`.
 */
function narrowObjectMatchTypeByGuard(
  fieldsObj: Record<string, AstNode>,
  matchedType: Type,
  guard: AstNode,
  env: TypeEnv,
): Type | null {
  // Collect guard narrowings for bound field names
  const fieldNarrowings = new Map<string, Type>()
  for (const [fieldName, fieldPattern] of Object.entries(fieldsObj)) {
    if ((fieldPattern[0] as string) !== 'symbol') continue

    const [nameNode] = fieldPattern[1] as [AstNode, AstNode | undefined]
    const boundName = nameNode[1] as string
    const guardNarrow = extractGuardNarrowing(guard, boundName, env)
    if (guardNarrow) {
      fieldNarrowings.set(fieldName, guardNarrow)
    }
  }

  if (fieldNarrowings.size === 0) return null

  return narrowRecordFieldTypes(matchedType, fieldNarrowings)
}

// Apply field-level narrowings to a record type (or union of records).
function narrowRecordFieldTypes(type: Type, fieldNarrowings: Map<string, Type>): Type {
  if (type.tag === 'Union') {
    const narrowed = type.members
      .map(m => narrowRecordFieldTypes(m, fieldNarrowings))
      .filter(m => m.tag !== 'Never')
    return narrowed.length === 0 ? Never : simplify(union(...narrowed))
  }

  if (type.tag !== 'Record') return type

  const narrowedFields = new Map(type.fields)
  for (const [fieldName, guardType] of fieldNarrowings) {
    const existingFieldType = narrowedFields.get(fieldName) ?? Unknown
    const narrowed = intersectMatchTypes(existingFieldType, guardType)
    if (narrowed.tag === 'Never') return Never
    narrowedFields.set(fieldName, narrowed)
  }
  return { tag: 'Record', fields: narrowedFields, open: type.open }
}

function matchedTypeForPattern(pattern: AstNode, candidateType: Type): Type {
  const expandedCandidate = simplify(expandTypeForMatchAnalysis(candidateType))
  if (expandedCandidate.tag === 'Never') return Never

  switch (pattern[0] as string) {
    case 'wildcard':
    case 'symbol':
      return expandedCandidate
    case 'literal': {
      const literalType = getLiteralMatchPatternType(pattern)
      return literalType ? intersectMatchTypes(expandedCandidate, literalType) : Never
    }
    case 'object':
      return matchedObjectPatternType(pattern, expandedCandidate)
    case 'array':
      return matchedArrayPatternType(pattern, expandedCandidate)
    default:
      return expandedCandidate
  }
}

function getLiteralMatchPatternType(pattern: AstNode): Type | null {
  const [litNode] = pattern[1] as [AstNode]
  if (litNode[0] === NodeTypes.Num) return literal(litNode[1] as number)
  if (litNode[0] === NodeTypes.Str) return literal(litNode[1] as string)
  if (litNode[0] === NodeTypes.Atom) return atom(litNode[1] as string)
  if (litNode[0] === NodeTypes.Reserved) {
    if (litNode[1] === 'true') return literal(true)
    if (litNode[1] === 'false') return literal(false)
    if (litNode[1] === 'null') return NullType
  }
  return null
}

function matchedObjectPatternType(pattern: AstNode, candidateType: Type): Type {
  const [fieldsObj] = pattern[1] as [Record<string, AstNode>, AstNode | undefined]

  if (candidateType.tag === 'Unknown' || candidateType.tag === 'Var') {
    return candidateType
  }

  if (candidateType.tag === 'Union') {
    const compatibleMembers = candidateType.members.filter(
      (member): member is Extract<Type, { tag: 'Record' }> => (
        member.tag === 'Record' && recordTypeSupportsMatchPattern(fieldsObj, member)
      ),
    )
    const narrowedMembers = compatibleMembers
      .map(member => narrowRecordTypeForMatchPattern(fieldsObj, member))
      .filter(member => member.tag !== 'Never')
    return narrowedMembers.length === 0 ? Never : simplify(union(...narrowedMembers))
  }

  return candidateType.tag === 'Record' && recordTypeSupportsMatchPattern(fieldsObj, candidateType)
    ? narrowRecordTypeForMatchPattern(fieldsObj, candidateType)
    : Never
}

function matchedArrayPatternType(pattern: AstNode, candidateType: Type): Type {
  const [elements] = pattern[1] as [AstNode[], AstNode | undefined]

  const explicitVariants = explicitArrayPatternVariants(elements)
  if (explicitVariants.length > 1) {
    const matchedVariants = explicitVariants
      .map(variant => matchedExplicitArrayPatternType(variant, candidateType))
      .filter(member => member.tag !== 'Never')
    return matchedVariants.length === 0 ? Never : simplify(union(...matchedVariants))
  }

  return matchedExplicitArrayPatternType(elements, candidateType)
}

function matchedExplicitArrayPatternType(
  elements: AstNode[],
  candidateType: Type,
): Type {

  if (candidateType.tag === 'Unknown' || candidateType.tag === 'Var') {
    return candidateType
  }

  if (candidateType.tag === 'Union') {
    const compatibleMembers = candidateType.members.filter(
      (member): member is Extract<Type, { tag: 'Array' | 'Tuple' | 'Sequence' }> => arrayTypeSupportsMatchPattern(elements, member),
    )
    const narrowedMembers = compatibleMembers
      .map(member => narrowArrayLikeTypeForMatchPattern(elements, member))
      .filter(member => member.tag !== 'Never')
    return narrowedMembers.length === 0 ? Never : simplify(union(...narrowedMembers))
  }

  if ((candidateType.tag === 'Array' || candidateType.tag === 'Tuple' || candidateType.tag === 'Sequence')
    && arrayTypeSupportsMatchPattern(elements, candidateType)) {
    return narrowArrayLikeTypeForMatchPattern(elements, candidateType)
  }

  return Never
}

function explicitArrayPatternVariants(elements: AstNode[]): AstNode[][] {
  if (arrayPatternRestIndex(elements) !== -1) {
    return [elements]
  }

  const variantLengths: number[] = []
  const minLength = arrayPatternLengthInterval(elements).minLength
  for (let length = minLength; length <= elements.length; length++) {
    const omitted = elements.slice(length)
    if (omitted.some(element => element && !patternHasDefault(element))) {
      continue
    }
    variantLengths.push(length)
  }

  if (variantLengths.length <= 1) {
    return [elements]
  }

  return variantLengths.map(length => elements
    .slice(0, length)
    .map(element => element ? stripPatternDefault(element) : element))
}

function stripPatternDefault(pattern: AstNode): AstNode {
  const payload = pattern[1]
  if (!Array.isArray(payload) || payload.length < 2 || payload[1] === undefined) {
    return pattern
  }
  return [pattern[0], [payload[0], undefined], pattern[2]] as AstNode
}

function narrowRecordTypeForMatchPattern(
  fieldsObj: Record<string, AstNode>,
  type: Extract<Type, { tag: 'Record' }>,
): Type {
  const narrowedFields = new Map(type.fields)

  for (const [fieldName, fieldPattern] of Object.entries(fieldsObj)) {
    const fieldType = type.fields.get(fieldName)
    if (fieldType === undefined) {
      if (!type.open && !patternHasDefault(fieldPattern)) {
        return Never
      }
      continue
    }

    const narrowedFieldType = matchedTypeForPattern(fieldPattern, fieldType)
    if (narrowedFieldType.tag === 'Never') {
      return Never
    }
    narrowedFields.set(fieldName, narrowedFieldType)
  }

  return { tag: 'Record', fields: narrowedFields, open: type.open }
}

function narrowArrayLikeTypeForMatchPattern(
  elements: AstNode[],
  type: Extract<Type, { tag: 'Array' | 'Tuple' | 'Sequence' }>,
): Type {
  const seq = toSequenceType(type)
  if (!seq) return Never

  const patternInterval = arrayPatternLengthInterval(elements)
  const minLength = Math.max(seq.minLength, patternInterval.minLength)
  const maxLength = minOptionalLength(seq.maxLength, patternInterval.maxLength)
  if (maxLength !== undefined && minLength > maxLength) {
    return Never
  }

  const restIndex = arrayPatternRestIndex(elements)
  const requiredPrefixLength = restIndex === -1 ? elements.length : restIndex
  const prefixLength = Math.max(seq.prefix.length, requiredPrefixLength)
  const narrowedPrefix = Array.from({ length: prefixLength }, (_, index) => sequenceElementAt(seq, index))

  for (let i = 0; i < elements.length; i++) {
    const elementPattern = elements[i]
    if (!elementPattern || (elementPattern[0] as string) === 'rest') continue
    if (minLength <= i && patternHasDefault(elementPattern)) continue

    const narrowedElementType = matchedTypeForPattern(elementPattern, sequenceElementAt(seq, i))
    if (narrowedElementType.tag === 'Never') {
      return Never
    }
    if (i < narrowedPrefix.length) {
      narrowedPrefix[i] = narrowedElementType
    }
  }

  return simplify(sequence(narrowedPrefix, restIndex === -1 ? Never : seq.rest, minLength, maxLength))
}

function intersectMatchTypes(left: Type, right: Type): Type {
  const expandedLeft = simplify(expandType(left))
  const expandedRight = simplify(expandType(right))

  if (expandedLeft.tag === 'Never' || expandedRight.tag === 'Never') return Never
  if (expandedLeft.tag === 'Unknown') return expandedRight
  if (expandedRight.tag === 'Unknown') return expandedLeft
  if (areMatchTypesDisjoint(expandedLeft, expandedRight)) return Never
  if (isSubtype(expandedLeft, expandedRight)) return expandedLeft
  if (isSubtype(expandedRight, expandedLeft)) return expandedRight

  if (expandedLeft.tag === 'Union') {
    return simplify(union(...expandedLeft.members.map(member => intersectMatchTypes(member, expandedRight)).filter(member => member.tag !== 'Never')))
  }

  if (expandedRight.tag === 'Union') {
    return simplify(union(...expandedRight.members.map(member => intersectMatchTypes(expandedLeft, member)).filter(member => member.tag !== 'Never')))
  }

  return simplify(inter(expandedLeft, expandedRight))
}

function areMatchTypesDisjoint(left: Type, right: Type): boolean {
  if (left.tag === 'Never' || right.tag === 'Never') return true

  if (left.tag === 'Literal' && right.tag === 'Literal') {
    return left.value !== right.value
  }

  if (left.tag === 'Atom' && right.tag === 'Atom') {
    return left.name !== right.name
  }

  if (left.tag === 'Literal' && right.tag === 'Primitive') {
    return !isSubtype(left, right)
  }

  if (left.tag === 'Primitive' && right.tag === 'Literal') {
    return !isSubtype(right, left)
  }

  if (left.tag === 'Union') {
    return left.members.every(member => areMatchTypesDisjoint(member, right))
  }

  if (right.tag === 'Union') {
    return right.members.every(member => areMatchTypesDisjoint(left, member))
  }

  if (left.tag === 'Tuple' && right.tag === 'Tuple') {
    if (left.elements.length !== right.elements.length) return true
    return left.elements.some((element, index) => areMatchTypesDisjoint(element, right.elements[index]!))
  }

  const leftSequence = toSequenceType(left)
  const rightSequence = toSequenceType(right)
  if (leftSequence && rightSequence) {
    return areSequenceMatchTypesDisjoint(leftSequence, rightSequence)
  }

  if (left.tag === 'Record' && right.tag === 'Record') {
    for (const [key, leftField] of left.fields) {
      const rightField = right.fields.get(key)
      if (rightField && areMatchTypesDisjoint(leftField, rightField)) {
        return true
      }
    }
    for (const key of left.fields.keys()) {
      if (!right.fields.has(key) && !right.open) {
        return true
      }
    }
    for (const key of right.fields.keys()) {
      if (!left.fields.has(key) && !left.open) {
        return true
      }
    }
  }

  return false
}

function normalizeTrackableMatchSpace(type: Type): Type {
  const expanded = simplify(expandTypeForMatchAnalysis(type))

  if (expanded.tag === 'Primitive' && expanded.name === 'Boolean') {
    return union(literal(true), literal(false))
  }

  if (expanded.tag === 'Union') {
    return simplify(union(...expanded.members.map(normalizeTrackableMatchSpace)))
  }

  return expanded
}

function isTrackableMatchRemainder(type: Type): boolean {
  const expanded = simplify(expandTypeForMatchAnalysis(type))
  if (expanded.tag === 'Literal' || expanded.tag === 'Atom' || (expanded.tag === 'Primitive' && expanded.name === 'Null')) {
    return true
  }
  if (expanded.tag === 'Tuple') {
    return expanded.elements.every(member => isTrackableMatchRemainder(member))
  }
  if (expanded.tag === 'Sequence') {
    return expanded.rest.tag === 'Never' && expanded.prefix.every(member => isTrackableMatchRemainder(member))
  }
  if (expanded.tag === 'Record') {
    return [...expanded.fields.values()].every(member => isTrackableMatchRemainder(member))
  }
  return expanded.tag === 'Union' && expanded.members.every(member => isTrackableMatchRemainder(member))
}

function shouldWarnRedundantMatchCase(pattern: AstNode, remainingType: Type, overallMatchType: Type): boolean {
  if (simplify(expandTypeForMatchAnalysis(remainingType)).tag === 'Never') return true

  const patternType = pattern[0] as string
  if (patternType === 'literal' || patternType === 'symbol' || patternType === 'wildcard') {
    return true
  }

  if (patternType === 'array' || patternType === 'object') {
    return matchedTypeForPattern(pattern, overallMatchType).tag !== 'Never'
  }

  return false
}

/**
 * Subtract one type from another: remainingType \ narrowedType.
 * Used for exhaustiveness checking — each match clause subtracts
 * its pattern type from the remaining unmatched type.
 */
function subtractType(from: Type, subtract: Type): Type {
  const expandedFrom = simplify(expandTypeForMatchAnalysis(from))
  const expandedSubtract = simplify(expandTypeForMatchAnalysis(subtract))

  if (expandedSubtract.tag === 'Never') return expandedFrom
  if (expandedFrom.tag === 'Never') return Never
  if (isSubtype(expandedFrom, expandedSubtract)) return Never

  if (expandedSubtract.tag === 'Union') {
    return simplify(expandedSubtract.members.reduce((remaining, member) => subtractType(remaining, member), expandedFrom))
  }

  if (expandedFrom.tag === 'Union') {
    const remaining = expandedFrom.members
      .map(member => subtractType(member, expandedSubtract))
      .filter(member => member.tag !== 'Never')
    return remaining.length === 0 ? Never : simplify(union(...remaining))
  }

  if (expandedFrom.tag === 'Record' && expandedSubtract.tag === 'Record') {
    return subtractRecordProductType(expandedFrom, expandedSubtract)
  }

  const fromSequence = toSequenceType(expandedFrom)
  const subtractSequence = toSequenceType(expandedSubtract)
  if (fromSequence && subtractSequence) {
    return subtractSequenceProductType(fromSequence, subtractSequence)
  }

  // If subtracting the exact same type, result is Never
  if (typeEquals(expandedFrom, expandedSubtract)) return Never

  // If subtracting a literal from a primitive, can't simplify further
  // (would need full set-theoretic complement which is deferred)
  return expandedFrom
}

function subtractRecordProductType(
  from: Extract<Type, { tag: 'Record' }>,
  subtract: Extract<Type, { tag: 'Record' }>,
): Type {
  if (!isSubtype(subtract, from)) {
    return from
  }

  const constrainedKeys = [...subtract.fields.keys()].filter(key => from.fields.has(key))
  if (constrainedKeys.length === 0) {
    return from
  }

  const branches: Type[] = []
  const exactPrefix = new Map<string, Type>()

  for (const key of constrainedKeys) {
    const fromField = from.fields.get(key)!
    const subtractField = subtract.fields.get(key)!
    const exactField = intersectMatchTypes(fromField, subtractField)
    const remainderField = subtractType(fromField, subtractField)

    if (remainderField.tag !== 'Never') {
      const branchFields = new Map(from.fields)
      for (const [prefixKey, prefixType] of exactPrefix) {
        branchFields.set(prefixKey, prefixType)
      }
      branchFields.set(key, remainderField)
      branches.push({ tag: 'Record', fields: branchFields, open: from.open })
    }

    if (exactField.tag === 'Never') {
      return branches.length === 0 ? Never : simplify(union(...branches))
    }
    exactPrefix.set(key, exactField)
  }

  return branches.length === 0 ? Never : simplify(union(...branches))
}

function subtractSequenceProductType(from: SequenceType, subtract: SequenceType): Type {
  if (!isSubtype(subtract, from)) {
    return from
  }

  const overlapMin = Math.max(from.minLength, subtract.minLength)
  const overlapMax = minOptionalLength(from.maxLength, subtract.maxLength)
  if (overlapMax !== undefined && overlapMin > overlapMax) {
    return from
  }

  const branches: Type[] = []

  if (from.minLength < overlapMin) {
    branches.push(simplify(sequence([...from.prefix], from.rest, from.minLength, overlapMin - 1)))
  }

  if (overlapMax !== undefined && (from.maxLength === undefined || overlapMax < from.maxLength)) {
    branches.push(simplify(sequence([...from.prefix], from.rest, overlapMax + 1, from.maxLength)))
  }

  const prefixLimit = Math.max(from.prefix.length, subtract.prefix.length)
  const exactPrefix: Type[] = []

  for (let index = 0; index < prefixLimit; index++) {
    if (overlapMax !== undefined && overlapMax <= index) break

    const fromElement = sequenceElementAt(from, index)
    const subtractElement = sequenceElementAt(subtract, index)
    const exactElement = intersectMatchTypes(fromElement, subtractElement)
    const remainderElement = subtractType(fromElement, subtractElement)

    if (remainderElement.tag !== 'Never') {
      const branchPrefix = Array.from({ length: Math.max(prefixLimit, index + 1) }, (_, prefixIndex) => {
        if (prefixIndex < exactPrefix.length) return exactPrefix[prefixIndex]!
        if (prefixIndex === index) return remainderElement
        return sequenceElementAt(from, prefixIndex)
      })
      branches.push(simplify(sequence(branchPrefix, from.rest, Math.max(overlapMin, index + 1), overlapMax)))
    }

    if (exactElement.tag === 'Never') {
      return branches.length === 0 ? Never : simplify(union(...branches.filter(branch => branch.tag !== 'Never')))
    }
    exactPrefix.push(exactElement)
  }

  return branches.length === 0 ? Never : simplify(union(...branches.filter(branch => branch.tag !== 'Never')))
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
  const expandedType = expandType(type)
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
            if (expandedType.tag === 'Array' || expandedType.tag === 'Tuple' || expandedType.tag === 'Sequence') {
              env.bind(restName, getArrayPatternRestType(expandedType, i))
            } else {
              env.bind(restName, type)
            }
          }
        } else if (ctx) {
          // Each element gets a fresh variable constrained by the array element type
          const elemVar = ctx.freshVar()
          if (expandedType.tag === 'Array' || expandedType.tag === 'Tuple' || expandedType.tag === 'Sequence') {
            constrain(ctx, getArrayElementPatternType(expandedType, i, elem), elemVar)
          }
          bindPattern(elem, elemVar, env, ctx, typeMap)
        } else {
          if (expandedType.tag === 'Array' || expandedType.tag === 'Tuple' || expandedType.tag === 'Sequence') {
            bindPattern(elem, getArrayElementPatternType(expandedType, i, elem), env, undefined, typeMap)
          } else {
            bindPattern(elem, Unknown, env, undefined, typeMap)
          }
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

function inferCollectionCall(
  calleeNode: AstNode,
  argTypes: Type[],
  ctx: InferenceContext,
  env: TypeEnv,
  typeMap: Map<number, Type>,
): Type | null {
  if (calleeNode[0] !== NodeTypes.Builtin) return null

  const builtinName = calleeNode[1] as string
  if (lookupShadowedBuiltin(env, builtinName)) return null
  switch (builtinName) {
    case 'map':
      return inferCollectionMapCall(calleeNode, argTypes, ctx, typeMap)
    case 'reduce':
      return inferCollectionReduceCall(calleeNode, argTypes, ctx, typeMap)
    default:
      return null
  }
}

function inferCollectionMapCall(calleeNode: AstNode, argTypes: Type[], ctx: InferenceContext, typeMap: Map<number, Type>): Type | null {
  if (argTypes.length < 2) return null

  const functionType = argTypes[argTypes.length - 1]!
  const collectionTypes = argTypes.slice(0, -1).map(type => expandType(type))
  if (collectionTypes.length === 0) {
    return null
  }

  if (collectionTypes.every(isStringCollectionType)) {
    constrain(ctx, functionType, fn(new Array(collectionTypes.length).fill(StringType), StringType))
    if (calleeNode[2] > 0) {
      typeMap.set(calleeNode[2], fn([...collectionTypes, fn(new Array(collectionTypes.length).fill(StringType), StringType)], StringType))
    }
    return StringType
  }

  if (collectionTypes.every(isArrayCollectionType)) {
    const callbackParamTypes = collectionTypes.map(collectionElementType)
    const callbackRet = ctx.freshVar()
    constrain(ctx, functionType, fn(callbackParamTypes, callbackRet))
    const result = array(callbackRet)
    if (calleeNode[2] > 0) {
      typeMap.set(calleeNode[2], fn([...collectionTypes, fn(callbackParamTypes, callbackRet)], result))
    }
    return result
  }

  if (collectionTypes.some(type => type.tag !== 'Record')) {
    return null
  }

  const records = collectionTypes as Extract<Type, { tag: 'Record' }>[]
  assertCompatibleClosedRecordKeys(records)

  const callbackParamTypes = records.map(collectionValueType)
  const callbackRet = ctx.freshVar()
  constrain(ctx, functionType, fn(callbackParamTypes, callbackRet))

  const result = buildMappedRecordResult(records, callbackRet)
  const calleeNodeId = calleeNode[2]
  if (calleeNodeId > 0) {
    typeMap.set(calleeNodeId, fn([...records, fn(callbackParamTypes, callbackRet)], result))
  }
  return result
}

function inferCollectionReduceCall(calleeNode: AstNode, argTypes: Type[], ctx: InferenceContext, typeMap: Map<number, Type>): Type | null {
  if (argTypes.length !== 3) return null

  const collectionType = expandType(argTypes[0]!)
  const reducerType = argTypes[1]!
  const initialType = argTypes[2]!
  let valueType: Type

  if (isStringCollectionType(collectionType)) {
    valueType = StringType
  } else if (isArrayCollectionType(collectionType)) {
    valueType = collectionElementType(collectionType)
  } else if (collectionType.tag === 'Record') {
    valueType = collectionValueType(collectionType)
  } else {
    return null
  }

  const accType = ctx.freshVar()
  constrain(ctx, initialType, accType)
  constrain(ctx, reducerType, fn([accType, valueType], accType))

  const calleeNodeId = calleeNode[2]
  if (calleeNodeId > 0) {
    typeMap.set(calleeNodeId, fn([collectionType, fn([accType, valueType], accType), initialType], accType))
  }
  return accType
}

function collectionValueType(recordType: Extract<Type, { tag: 'Record' }>): Type {
  const fieldTypes = [...recordType.fields.values()]
  return fieldTypes.length === 0 ? Unknown : union(...fieldTypes)
}

function collectionElementType(type: Extract<Type, { tag: 'Array' | 'Tuple' | 'Sequence' }>): Type {
  if (type.tag === 'Array') return type.element
  if (type.tag === 'Tuple') return type.elements.length === 0 ? Unknown : union(...type.elements)
  return sequenceElementType(type)
}

function isStringCollectionType(type: Type): boolean {
  return (type.tag === 'Primitive' && type.name === 'String')
    || (type.tag === 'Literal' && typeof type.value === 'string')
}

function isArrayCollectionType(type: Type): type is Extract<Type, { tag: 'Array' | 'Tuple' | 'Sequence' }> {
  return type.tag === 'Array' || type.tag === 'Tuple' || type.tag === 'Sequence'
}

function assertCompatibleClosedRecordKeys(records: Extract<Type, { tag: 'Record' }>[]): void {
  const closedRecords = records.filter(record => !record.open)
  if (closedRecords.length < 2) return

  const expectedKeys = [...closedRecords[0]!.fields.keys()].sort()
  for (const record of closedRecords.slice(1)) {
    const keys = [...record.fields.keys()].sort()
    if (expectedKeys.length !== keys.length || expectedKeys.some((key, index) => key !== keys[index])) {
      throw new TypeInferenceError(
        `All objects must have the same keys. Expected: ${expectedKeys.join(', ')}. Found: ${keys.join(', ')}`,
      )
    }
  }
}

function buildMappedRecordResult(records: Extract<Type, { tag: 'Record' }>[], valueType: Type): Type {
  const allClosed = records.every(record => !record.open)
  if (!allClosed) {
    return { tag: 'Record', fields: new Map(), open: true }
  }

  const keys = [...records[0]!.fields.keys()]
  return {
    tag: 'Record',
    fields: new Map(keys.map(key => [key, valueType])),
    open: false,
  }
}

function bindMatchCasePattern(
  pattern: AstNode,
  type: Type,
  env: TypeEnv,
  ctx: InferenceContext,
  typeMap: Map<number, Type>,
): boolean {
  const patternType = pattern[0] as string
  const expandedType = expandType(type)

  if (type.tag === 'Var' && expandedType.tag === 'Never') {
    bindUnknownPattern(pattern, env, typeMap)
    return true
  }

  if (expandedType.tag === 'Unknown') {
    bindUnknownPattern(pattern, env, typeMap)
    return true
  }

  switch (patternType) {
    case 'symbol': {
      const [nameNode, defaultNode] = pattern[1] as [AstNode, AstNode | undefined]
      const name = nameNode[1] as string
      const bindType = getPatternBindingType(type, defaultNode, env, ctx, typeMap)
      env.bind(name, bindType)
      const nameNodeId = nameNode[2]
      if (nameNodeId > 0) {
        typeMap.set(nameNodeId, bindType)
      }
      return true
    }

    case 'wildcard':
    case 'literal':
      return true

    case 'rest': {
      const [restName] = pattern[1] as [string, AstNode | undefined]
      if (restName) {
        env.bind(restName, type)
      }
      return true
    }

    case 'object': {
      const [fieldsObj] = pattern[1] as [Record<string, AstNode>, AstNode | undefined]

      if (expandedType.tag === 'Union') {
        const compatibleMembers = expandedType.members.filter(
          (member): member is Extract<Type, { tag: 'Record' }> => (
            member.tag === 'Record' && recordTypeSupportsMatchPattern(fieldsObj, member)
          ),
        )
        if (compatibleMembers.length === 0) return false

        for (const [fieldName, fieldPattern] of Object.entries(fieldsObj)) {
          const fieldTypes = compatibleMembers.map(member => getRecordFieldPatternType(member, fieldName, fieldPattern))
          if (!bindMatchCasePattern(fieldPattern, mergePatternTypes(fieldTypes), env, ctx, typeMap)) {
            return false
          }
        }
        return true
      }

      if (expandedType.tag !== 'Record' || !recordTypeSupportsMatchPattern(fieldsObj, expandedType)) {
        return false
      }

      for (const [fieldName, fieldPattern] of Object.entries(fieldsObj)) {
        const fieldType = getRecordFieldPatternType(expandedType, fieldName, fieldPattern)
        if (!bindMatchCasePattern(fieldPattern, fieldType, env, ctx, typeMap)) {
          return false
        }
      }
      return true
    }

    case 'array': {
      const [elements] = pattern[1] as [AstNode[], AstNode | undefined]

      if (expandedType.tag === 'Union') {
        const compatibleMembers = expandedType.members.filter(
          (member): member is Extract<Type, { tag: 'Array' | 'Tuple' | 'Sequence' }> => arrayTypeSupportsMatchPattern(elements, member),
        )
        if (compatibleMembers.length === 0) return false

        for (let i = 0; i < elements.length; i++) {
          const elementPattern = elements[i]
          if (!elementPattern) continue
          if ((elementPattern[0] as string) === 'rest') {
            const restTypes = compatibleMembers.map(member => getArrayPatternRestType(member, i))
            if (!bindMatchCasePattern(elementPattern, mergePatternTypes(restTypes), env, ctx, typeMap)) {
              return false
            }
            continue
          }

          const elementTypes = compatibleMembers.map(member => getArrayElementPatternType(member, i, elementPattern))

          if (!bindMatchCasePattern(elementPattern, mergePatternTypes(elementTypes), env, ctx, typeMap)) {
            return false
          }
        }
        return true
      }

      if (!arrayTypeSupportsMatchPattern(elements, expandedType)) {
        return false
      }

      if (expandedType.tag !== 'Array' && expandedType.tag !== 'Tuple' && expandedType.tag !== 'Sequence') {
        return false
      }

      for (let i = 0; i < elements.length; i++) {
        const elementPattern = elements[i]
        if (!elementPattern) continue
        if ((elementPattern[0] as string) === 'rest') {
          if (!bindMatchCasePattern(elementPattern, getArrayPatternRestType(expandedType, i), env, ctx, typeMap)) {
            return false
          }
          continue
        }

        const elementType = getArrayElementPatternType(expandedType, i, elementPattern)

        if (!bindMatchCasePattern(elementPattern, elementType, env, ctx, typeMap)) {
          return false
        }
      }
      return true
    }

    default:
      return true
  }
}

function bindUnknownPattern(pattern: AstNode, env: TypeEnv, typeMap: Map<number, Type>): void {
  const patternType = pattern[0] as string

  switch (patternType) {
    case 'symbol': {
      const [nameNode] = pattern[1] as [AstNode, AstNode | undefined]
      const name = nameNode[1] as string
      env.bind(name, Unknown)
      const nameNodeId = nameNode[2]
      if (nameNodeId > 0) {
        typeMap.set(nameNodeId, Unknown)
      }
      break
    }

    case 'object': {
      const [fieldsObj] = pattern[1] as [Record<string, AstNode>, AstNode | undefined]
      for (const fieldPattern of Object.values(fieldsObj)) {
        bindUnknownPattern(fieldPattern, env, typeMap)
      }
      break
    }

    case 'array': {
      const [elements] = pattern[1] as [AstNode[], AstNode | undefined]
      for (const elementPattern of elements) {
        if (elementPattern) {
          bindUnknownPattern(elementPattern, env, typeMap)
        }
      }
      break
    }

    case 'rest': {
      const [restName] = pattern[1] as [string, AstNode | undefined]
      if (restName) {
        env.bind(restName, Unknown)
      }
      break
    }

    default:
      break
  }
}

function mergePatternTypes(types: Type[]): Type {
  if (types.length === 0) return Unknown
  return types.length === 1 ? types[0]! : union(...types)
}

function getPatternBindingType(
  type: Type,
  defaultNode: AstNode | undefined,
  env: TypeEnv,
  ctx: InferenceContext,
  typeMap: Map<number, Type>,
): Type {
  if (!defaultNode) return type

  const defaultType = inferExpr(defaultNode, ctx, env, typeMap)
  if (type.tag === 'Never') return defaultType
  return union(type, defaultType)
}

function patternHasDefault(pattern: AstNode): boolean {
  const payload = pattern[1]
  return Array.isArray(payload) && payload[1] !== undefined
}

function getRecordFieldPatternType(
  type: Extract<Type, { tag: 'Record' }>,
  fieldName: string,
  pattern: AstNode,
): Type {
  const fieldType = type.fields.get(fieldName)
  if (fieldType !== undefined) {
    return fieldType
  }

  if (!type.open && patternHasDefault(pattern)) {
    return Never
  }

  return Unknown
}

function getArrayElementPatternType(
  type: Extract<Type, { tag: 'Array' | 'Tuple' | 'Sequence' }>,
  index: number,
  pattern: AstNode,
): Type {
  if (type.tag === 'Array') {
    return type.element
  }

  if (type.tag === 'Tuple') {
    const elementType = type.elements[index]
    if (elementType !== undefined) {
      return elementType
    }

    if (patternHasDefault(pattern)) {
      return Never
    }

    return Unknown
  }

  if (sequenceMayHaveIndex(type, index)) {
    return sequenceElementAt(type, index)
  }

  return patternHasDefault(pattern) ? Never : Unknown
}

function getArrayPatternRestType(
  type: Extract<Type, { tag: 'Array' | 'Tuple' | 'Sequence' }>,
  index: number,
): Type {
  if (type.tag === 'Array') {
    return type
  }

  if (type.tag === 'Tuple') {
    return tuple(type.elements.slice(index))
  }

  return simplify(sequence(
    type.prefix.slice(index),
    type.rest,
    Math.max(0, type.minLength - index),
    type.maxLength !== undefined ? Math.max(0, type.maxLength - index) : undefined,
  ))
}

function arrayPatternRestIndex(elements: AstNode[]): number {
  return elements.findIndex(element => element && (element[0] as string) === 'rest')
}

function arrayPatternLengthInterval(elements: AstNode[]): { minLength: number; maxLength?: number } {
  const restIndex = arrayPatternRestIndex(elements)
  const minLength = elements.reduce((count, elementPattern, index) => {
    if (!elementPattern || (elementPattern[0] as string) === 'rest' || patternHasDefault(elementPattern)) {
      return count
    }
    return index + 1
  }, 0)

  if (restIndex !== -1) {
    return { minLength }
  }

  return { minLength, maxLength: elements.length }
}

function minOptionalLength(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.min(left, right)
}

function recordTypeSupportsMatchPattern(
  fieldsObj: Record<string, AstNode>,
  type: Extract<Type, { tag: 'Record' }>,
): boolean {
  for (const [fieldName, fieldPattern] of Object.entries(fieldsObj)) {
    if (!type.fields.has(fieldName) && !type.open && !patternHasDefault(fieldPattern)) {
      return false
    }
  }
  return true
}

function arrayTypeSupportsMatchPattern(elements: AstNode[], type: Type): boolean {
  const seq = toSequenceType(type)
  if (!seq) return false

  const patternInterval = arrayPatternLengthInterval(elements)
  const overlapMin = Math.max(seq.minLength, patternInterval.minLength)
  const overlapMax = minOptionalLength(seq.maxLength, patternInterval.maxLength)
  return overlapMax === undefined || overlapMin <= overlapMax
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
        } else if (concreteType.tag === 'Sequence' && sequenceMayHaveIndex(concreteType, i)) {
          recordConcretePatternTypes(elem, sequenceElementAt(concreteType, i), typeMap)
        }
      }
      break
    }

    default:
      break
  }
}

/**
 * Walk a destructuring pattern alongside its literal value AST to propagate
 * positional types from the value's inferred types into the pattern bindings.
 *
 * Supported AST forms:
 * - symbol: ["symbol", [nameNode, defaultNode | null], id]
 * - object: ["object", [fieldsObj, restNode | undefined], id]  (value must be NodeTypes.Object)
 * - array:  ["array",  [elements[], restNode | undefined], id] (value must be NodeTypes.Array)
 *
 * Spread elements and computed keys in the value AST are silently skipped.
 */
function recordLiteralPatternTypes(pattern: AstNode, valueNode: AstNode, typeMap: Map<number, Type>): void {
  const patternType = pattern[0] as string

  switch (patternType) {
    case 'symbol': {
      const [nameNode] = pattern[1] as [AstNode, AstNode | undefined]
      const bindingType = typeMap.get(valueNode[2])
      if (bindingType && nameNode[2] > 0) {
        typeMap.set(nameNode[2], bindingType)
      }
      break
    }

    case 'object': {
      if (valueNode[0] !== NodeTypes.Object) return

      const [fieldsObj] = pattern[1] as [Record<string, AstNode>, AstNode | undefined]
      const entries = valueNode[1] as ([AstNode, AstNode] | AstNode)[]
      const fieldNodes = new Map<string, AstNode>()

      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2) continue
        const [keyNode, fieldValueNode] = entry
        const keyName = keyNode[0] === NodeTypes.Str
          ? keyNode[1] as string
          : keyNode[0] === NodeTypes.Sym
            ? keyNode[1] as string
            : String(keyNode[1])
        fieldNodes.set(keyName, fieldValueNode)
      }

      for (const [fieldName, fieldPattern] of Object.entries(fieldsObj)) {
        const fieldValueNode = fieldNodes.get(fieldName)
        if (fieldValueNode) {
          recordLiteralPatternTypes(fieldPattern, fieldValueNode, typeMap)
        }
      }
      break
    }

    case 'array': {
      if (valueNode[0] !== NodeTypes.Array) return

      const [elements] = pattern[1] as [AstNode[], AstNode | undefined]
      const valueElements = valueNode[1] as AstNode[]

      for (let i = 0; i < elements.length; i++) {
        const elementPattern = elements[i]
        if (!elementPattern) continue

        if ((elementPattern[0] as string) === 'rest') {
          const restTypes = valueElements.slice(i)
            .map(elementNode => typeMap.get(elementNode[2]) ?? Unknown)
          if (elementPattern[2] > 0) {
            typeMap.set(elementPattern[2], tuple(restTypes))
          }
          continue
        }

        const elementValueNode = valueElements[i]
        if (elementValueNode) {
          recordLiteralPatternTypes(elementPattern, elementValueNode, typeMap)
        }
      }
      break
    }

    default:
      break
  }
}

function expandTypeForMatchAnalysis(t: Type, visited = new Set<string>()): Type {
  switch (t.tag) {
    case 'Var': {
      if (visited.has(typeVarIdentity(t))) return Never
      visited.add(typeVarIdentity(t))

      if (t.lowerBounds.length > 0) {
        return simplify(union(...t.lowerBounds.map(bound => expandTypeForMatchAnalysis(bound, new Set(visited)))))
      }

      if (t.upperBounds.length > 0) {
        return simplify(inter(...t.upperBounds.map(bound => expandTypeForMatchAnalysis(bound, new Set(visited)))))
      }

      return Never
    }

    case 'Function':
      return fn(
        t.params.map(param => expandTypeForMatchAnalysis(param, new Set(visited))),
        expandTypeForMatchAnalysis(t.ret, new Set(visited)),
        t.effects,
        t.handlerWrapper,
        t.restParam !== undefined ? expandTypeForMatchAnalysis(t.restParam, new Set(visited)) : undefined,
      )

    case 'Handler': {
      const handled = new Map<string, { argType: Type; retType: Type }>()
      for (const [name, sig] of t.handled) {
        handled.set(name, {
          argType: expandTypeForMatchAnalysis(sig.argType, new Set(visited)),
          retType: expandTypeForMatchAnalysis(sig.retType, new Set(visited)),
        })
      }
      return handlerType(
        expandTypeForMatchAnalysis(t.body, new Set(visited)),
        expandTypeForMatchAnalysis(t.output, new Set(visited)),
        handled,
        t.introduced,
      )
    }

    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [key, value] of t.fields) {
        fields.set(key, expandTypeForMatchAnalysis(value, new Set(visited)))
      }
      return { tag: 'Record', fields, open: t.open }
    }

    case 'Array':
      return array(expandTypeForMatchAnalysis(t.element, new Set(visited)))

    case 'Tuple':
      return tuple(t.elements.map(element => expandTypeForMatchAnalysis(element, new Set(visited))))

    case 'Sequence':
      return sequence(
        t.prefix.map(element => expandTypeForMatchAnalysis(element, new Set(visited))),
        expandTypeForMatchAnalysis(t.rest, new Set(visited)),
        t.minLength,
        t.maxLength,
      )

    case 'Union':
      return simplify(union(...t.members.map(member => expandTypeForMatchAnalysis(member, new Set(visited)))))

    case 'Inter':
      return simplify(inter(...t.members.map(member => expandTypeForMatchAnalysis(member, new Set(visited)))))

    case 'Neg':
      return neg(expandTypeForMatchAnalysis(t.inner, new Set(visited)))

    case 'Alias':
      return expandTypeForMatchAnalysis(t.expanded, visited)

    default:
      return t
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
        t.introduced,
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
    case 'Sequence':
      return sequence(
        t.prefix.map(member => expandType(member, polarity, new Set(visited))),
        expandType(t.rest, polarity, new Set(visited)),
        t.minLength,
        t.maxLength,
      )
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
        return Unknown
      }

      // Negative-polarity vars with no upper bounds return Unknown (not Never) for display.
      // Never is technically more precise, but Unknown is more useful in hover tooltips
      // for unconstrained generic parameters (e.g. destructured fields of an open parameter).
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
        t.introduced,
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
    case 'Sequence':
      return sequence(
        t.prefix.map(member => expandTypeForDisplay(member, 'positive', new Set(visited))),
        expandTypeForDisplay(t.rest, 'positive', new Set(visited)),
        t.minLength,
        t.maxLength,
      )
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
        t.introduced,
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
    case 'Sequence':
      return sequence(
        t.prefix.map(member => sanitizeDisplayType(member, true)),
        sanitizeDisplayType(t.rest, true),
        t.minLength,
        t.maxLength,
      )
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
    // Merging records in a union is only sound when at most one field varies
    // across branches. Otherwise the merge loses per-branch field correlation,
    // widening e.g. `{a:1,b:1} | {a:2,b:2}` to allow `{a:1,b:2}` — a discriminated
    // union like `{type:"click", x, y} | {type:"keydown", key}` must stay a union.
    const first = members[0]!
    const firstKeys = [...first.fields.keys()]
    const sameKeys = members.every(m =>
      m.fields.size === firstKeys.length
      && firstKeys.every(k => m.fields.has(k)),
    )

    if (sameKeys) {
      let varyingFields = 0
      for (const key of firstKeys) {
        const firstType = first.fields.get(key)!
        if (members.some(m => !typeEquals(m.fields.get(key)!, firstType))) {
          varyingFields++
        }
      }

      if (varyingFields <= 1) {
        const open = members.some(member => member.open)
        const mergedFields = new Map<string, Type>()
        for (const fieldName of firstKeys) {
          const candidates = members.map(m => m.fields.get(fieldName)!)
          mergedFields.set(fieldName, normalizeDisplayCandidates(candidates))
        }
        return { tag: 'Record', fields: mergedFields, open }
      }
    }
  }

  if (members.every(member => member.tag === 'Array')) {
    return array(union(...members.map(member => member.element)))
  }

  return union(...members)
}

function constrainSequenceSubtype(ctx: InferenceContext, lhs: SequenceType, rhs: SequenceType): void {
  if (lhs.minLength < rhs.minLength) {
    throw new TypeInferenceError(`Sequence length mismatch: expected minimum ${rhs.minLength}, got ${lhs.minLength}`)
  }
  if (rhs.maxLength !== undefined && lhs.maxLength === undefined) {
    throw new TypeInferenceError(`Sequence length mismatch: expected maximum ${rhs.maxLength}, got unbounded`)
  }
  if (rhs.maxLength !== undefined && lhs.maxLength !== undefined && lhs.maxLength > rhs.maxLength) {
    throw new TypeInferenceError(`Sequence length mismatch: expected maximum ${rhs.maxLength}, got ${lhs.maxLength}`)
  }

  const relevantPrefixLength = Math.max(lhs.prefix.length, rhs.prefix.length)
  for (let index = 0; index < relevantPrefixLength; index++) {
    if (!sequenceMayHaveIndex(lhs, index)) continue
    constrain(ctx, sequenceElementAt(lhs, index), sequenceElementAt(rhs, index))
  }

  if (sequenceMayHaveIndex(lhs, relevantPrefixLength)) {
    constrain(ctx, lhs.rest, rhs.rest)
  }
}

function areSequenceMatchTypesDisjoint(left: SequenceType, right: SequenceType): boolean {
  const overlapMin = Math.max(left.minLength, right.minLength)
  const overlapMax = minOptionalLength(left.maxLength, right.maxLength)
  if (overlapMax !== undefined && overlapMin > overlapMax) {
    return true
  }

  const prefixLimit = Math.max(left.prefix.length, right.prefix.length)
  for (let index = 0; index < prefixLimit; index++) {
    if (!sequenceMayHaveIndex(left, index) || !sequenceMayHaveIndex(right, index)) continue
    if (areMatchTypesDisjoint(sequenceElementAt(left, index), sequenceElementAt(right, index))) {
      return true
    }
  }

  return false
}

function sequenceElementType(type: SequenceType): Type {
  if (type.prefix.length === 0) return type.rest
  const members = [...type.prefix]
  if (type.rest.tag !== 'Never') {
    members.push(type.rest)
  }
  return members.length === 1 ? members[0]! : union(...members)
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
    if (upperBound.tag === 'Record') {
      sawRecordLikeInfo = true
      open = open || upperBound.open
      for (const [fieldName, fieldType] of upperBound.fields) {
        const existing = fieldTypes.get(fieldName) ?? []
        existing.push(expandTypeForDisplay(fieldType, 'positive', new Set(visited)))
        fieldTypes.set(fieldName, existing)
      }
      continue
    }

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
  severity: 'error' | 'warning'

  constructor(message: string, nodeId?: number, severity: 'error' | 'warning' = 'error') {
    super(message)
    this.name = 'TypeInferenceError'
    this.nodeId = nodeId
    this.severity = severity
  }
}
