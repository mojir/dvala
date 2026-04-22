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

import type { Type, EffectSet, RowVarTail, HandlerWrapperInfo, SequenceType } from './types'
import {
  StringType, BooleanType, NullType,
  Unknown, Never, PureEffects, AnyFunction,
  ClosedTail, OpenTail,
  atom, literal, fn, array, tuple, union, inter, neg, handlerType, sequence, sequenceElementAt, sequenceMayHaveIndex, toSequenceType,
  functionAcceptsArity, functionArityLabel, getFunctionParamType,
  typeToString, typeEquals,
  effectSetToString, isEffectSubset, subtractEffects,
} from './types'
import type { AstNode, ObjectBindingEntry } from '../parser/types'
import { NodeTypes } from '../constants/constants'
import { getBuiltinType, getModuleType } from './builtinTypes'
import { collectSymRefs, literalTypeToAstNode, tryFoldBuiltinCall, tryFoldUserFunctionCall } from './constantFold'
import { FOLD_ENABLED } from './foldToggle'
import { parseTypeAnnotation } from './parseType'
import { getEffectDeclaration } from './effectTypes'
import { simplify } from './simplify'
import { isSubtype } from './subtype'

// Adapt an object-binding-target's new `ObjectBindingEntry[]` payload into
// the legacy `Record<string, AstNode>` shape the typechecker was originally
// written against. The typechecker only cares about (key, pattern) pairs,
// never about the key's source position — `keyNodeId` belongs to the
// rename/language-service layer. This adapter avoids rewriting every
// `Object.entries(fieldsObj)` site.
function objectBindingFieldsAsRecord(entries: ObjectBindingEntry[]): Record<string, AstNode> {
  const record: Record<string, AstNode> = {}
  for (const { key, target } of entries) {
    record[key] = target as unknown as AstNode
  }
  return record
}

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
  private effectStack: EffectSet[] = [{ effects: new Set(), tail: ClosedTail }]
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
  pushEffects(): void { this.effectStack.push({ effects: new Set(), tail: ClosedTail }) }

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
    // Promote currentEffects's tail to the "most open" of the two:
    // - Open wins over Closed.
    // - RowVar flowing in: if currentEffects is still Closed, promote to the
    //   row var; if it's already a (different) RowVar, edge them together.
    //   Real biunification across function boundaries happens at constrain
    //   sites — addEffects just accumulates leaked effects for the current
    //   body's inferred effect set.
    const cur = this.currentEffects.tail
    const incoming = effects.tail
    if (incoming.tag === 'Open' && cur.tag === 'Closed') {
      this.currentEffects.tail = OpenTail
    } else if (incoming.tag === 'RowVar' && cur.tag === 'Closed') {
      this.currentEffects.tail = incoming
    } else if (incoming.tag === 'RowVar' && cur.tag === 'RowVar' && incoming.id !== cur.id) {
      // Two distinct row vars meet via union (neither is a subtype of the
      // other). Link them symmetrically so bounds propagate both ways.
      addRowVarEdge(incoming, cur)
      addRowVarEdge(cur, incoming)
    }
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

  /**
   * Allocate a fresh effect-row variable at the current level. Id namespace
   * is separate from `freshVar()` so row-var ids and value-type-var ids don't
   * collide during display or debugging.
   */
  freshRowVar(): RowVarTail {
    return {
      tag: 'RowVar',
      id: this.nextRowVarId++,
      level: this._level,
      lowerBounds: [],
      upperBounds: [],
      lowerVarBounds: [],
      upperVarBounds: [],
    }
  }
  private nextRowVarId = 0

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
  // so any field that affects subtyping must appear here. `introduced` must
  // be part of the key — `constrain`/`isSubtype` now compare it covariantly
  // (Phase 4-B), so two handler types that differ only in `introduced` are
  // distinct.
  if (t.tag === 'Handler') {
    const tailKey = t.introduced.tail.tag === 'Closed'
      ? ''
      : t.introduced.tail.tag === 'Open'
        ? ':open'
        : `:rv${t.introduced.tail.id}`
    return `H:${varKey(t.body)}:${varKey(t.output)}:${[...t.handled.entries()].map(([name, sig]) => `${name}:${varKey(sig.argType)}:${varKey(sig.retType)}`).join(',')}:I:${[...t.introduced.effects].sort().join(',')}${tailKey}`
  }
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
 * Biunification over effect rows — **propagation only**. Runs at `constrain`
 * sites to accumulate bounds on row-var tails. Does not gate or throw on
 * concrete effect-set mismatches; the boolean subtype decision lives in
 * `subtype.ts:isSubtype` / `types.ts:isEffectSubset` and is invoked for
 * error reporting, not constraint propagation.
 *
 * Why split the two: `constrain` is run throughout inference to wire up
 * variables, including speculatively during overload resolution and type
 * guards. Throwing on every concrete mismatch would break those flows.
 * The historical Phase A behaviour did not touch effect sets here at all;
 * this function preserves that for non-row-var cases and adds row-var
 * propagation on top.
 *
 * The effect lattice is flat: `union = join`, `∅ = bottom`, `subset = order`.
 * MLsub rules specialize cleanly to the flat lattice.
 *
 * @internal Exported for tests that exercise effect-row biunification in
 * isolation. Not part of the public typechecker API — callers in source
 * should go through `constrain`.
 */
export function constrainEffectSet(sub: EffectSet, sup: EffectSet): void {
  if (sub === sup) return

  const subTail = sub.tail
  const supTail = sup.tail

  // Fast path: no row vars anywhere — no constraint to record.
  if (subTail.tag !== 'RowVar' && supTail.tag !== 'RowVar') return

  // sup is RowVar(ρ): accumulate on ρ's lower bounds.
  if (supTail.tag === 'RowVar') {
    const ρ = supTail
    // Push sub.effects \ sup.effects into ρ's lower bounds. Effects already
    // in sup.effects are intentionally excluded: they're on the concrete
    // side of the sup annotation, not inside ρ. Pushing them into ρ would
    // over-constrain — ρ represents the *remainder* beyond sup.effects.
    const extras = new Set<string>()
    for (const e of sub.effects) {
      if (!sup.effects.has(e)) extras.add(e)
    }
    if (extras.size > 0) addRowVarLowerBound(ρ, extras)
    if (subTail.tag === 'RowVar' && subTail.id !== ρ.id) {
      addRowVarEdge(subTail, ρ)
    }
    return
  }

  // sub is RowVar(σ), sup is concrete (Closed or Open).
  if (subTail.tag === 'RowVar') {
    if (supTail.tag === 'Closed') {
      // σ's value is constrained to ⊆ sup.effects.
      addRowVarUpperBound(subTail, sup.effects)
    }
    // Open sup: no tightening — Open accepts any extras.
  }
}

/**
 * Push a concrete lower-bound set into a row var, propagating:
 * - Each concrete upperBound of ρ must contain all new effects (fail otherwise).
 * - Each ρ' in upperVarBounds receives the new set as a lower bound.
 *
 * `visited` guards against cycles in the var graph (bidirectional edges
 * from `addEffects` union merging, or transitive var-to-var constraints).
 */
function addRowVarLowerBound(ρ: RowVarTail, effects: Set<string>, visited = new Set<number>()): void {
  if (visited.has(ρ.id)) return
  visited.add(ρ.id)
  // Dedup: don't add the exact same bound twice.
  let duplicate = false
  for (const existing of ρ.lowerBounds) {
    if (setsEqual(existing, effects)) {
      duplicate = true
      break
    }
  }
  if (!duplicate) ρ.lowerBounds.push(effects)
  // Propagate upward against each concrete upperBound: effects ⊆ upperBound.
  for (const ub of ρ.upperBounds) {
    for (const e of effects) {
      if (!ub.has(e)) {
        throw new TypeInferenceError(`Row-var ρ${ρ.id} lower bound '${e}' violates upper bound @{${[...ub].sort().join(', ')}}`)
      }
    }
  }
  // Propagate along upperVarBounds: ρ ⊆ ρ' means effects ⊆ ρ' too.
  for (const uv of ρ.upperVarBounds) {
    addRowVarLowerBound(uv, effects, visited)
  }
}

/**
 * Push a concrete upper-bound set into a row var, propagating symmetrically.
 * `visited` guards against cycles.
 */
function addRowVarUpperBound(ρ: RowVarTail, effects: Set<string>, visited = new Set<number>()): void {
  if (visited.has(ρ.id)) return
  visited.add(ρ.id)
  let duplicate = false
  for (const existing of ρ.upperBounds) {
    if (setsEqual(existing, effects)) {
      duplicate = true
      break
    }
  }
  if (!duplicate) ρ.upperBounds.push(effects)
  // Propagate: each existing concrete lowerBound must be ⊆ effects.
  for (const lb of ρ.lowerBounds) {
    for (const e of lb) {
      if (!effects.has(e)) {
        throw new TypeInferenceError(`Row-var ρ${ρ.id} upper bound rejects existing lower-bound effect '${e}'`)
      }
    }
  }
  // Propagate along lowerVarBounds: ρ' ⊆ ρ means ρ' ⊆ effects too.
  for (const lv of ρ.lowerVarBounds) {
    addRowVarUpperBound(lv, effects, visited)
  }
}

/**
 * Add a var-to-var edge σ <: ρ, propagating bounds across it.
 * Idempotent — repeated calls are no-ops.
 */
function addRowVarEdge(σ: RowVarTail, ρ: RowVarTail): void {
  if (σ.upperVarBounds.some(v => v.id === ρ.id)) return
  σ.upperVarBounds.push(ρ)
  ρ.lowerVarBounds.push(σ)
  // Propagate: σ's existing concrete lower bounds flow into ρ's lower bounds.
  for (const lb of σ.lowerBounds) addRowVarLowerBound(ρ, lb)
  // Propagate: ρ's existing concrete upper bounds flow into σ's upper bounds.
  for (const ub of ρ.upperBounds) addRowVarUpperBound(σ, ub)
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

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
  // `Unknown <: rhs` is a trivial no-op in most places (it's top, so the
  // subtype claim is as weak as possible). The one case that cannot be a
  // no-op is when `rhs` is a type variable: we need Unknown to reach the
  // Var's lowerBounds so that positive expansion produces `Unknown` rather
  // than `Never`. Without this, a declared-Unknown return type leaves the
  // call-site retVar empty and the caller sees `Never`. See the
  // chooseRandom Phase 5 return-type case for the motivating example.
  if (lhs.tag === 'Unknown') {
    if (rhs.tag === 'Var') rhs.lowerBounds.push(lhs)
    return
  }

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

  // Primitives: same name is ok, or Integer <: Number (the only proper
  // primitive-subtyping relation today). Anything else is an error.
  if (lhs.tag === 'Primitive' && rhs.tag === 'Primitive') {
    if (lhs.name === rhs.name) return
    if (lhs.name === 'Integer' && rhs.name === 'Number') return
    throw new TypeInferenceError(`${lhs.name} is not a subtype of ${rhs.name}`)
  }

  // Literal <: Primitive: check the match.
  // Number literals are also Integer when their value is integer-valued
  // (mirrors subtype.ts:literalMatchesPrimitive).
  if (lhs.tag === 'Literal' && rhs.tag === 'Primitive') {
    const ok = (typeof lhs.value === 'number' && rhs.name === 'Number')
      || (typeof lhs.value === 'number' && rhs.name === 'Integer' && Number.isInteger(lhs.value))
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
    // Effect sets: contravariance-of-covariance direction is covariant here
    // (caller's effects ⊆ callee's declared effects), matching the existing
    // subtype check in subtype.ts.
    constrainEffectSet(lhs.effects, rhs.effects)
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
    // Biunify `introduced` row-var tails (covariant: fewer introduced
    // effects is a subtype). The row-var tail participates in constraint
    // propagation so the ρ bound shared between `handler e end` and a
    // `Handler<>` annotation wires up correctly.
    constrainEffectSet(lhs.introduced, rhs.introduced)
    // Phase 4-B: enforce the concrete-side subset structurally, but ONLY
    // when both tails are Closed. `constrainEffectSet` is a no-op in that
    // case (no row vars to propagate into), so without this check two
    // handlers differing only in `introduced` silently unified. When
    // either tail is Open or a RowVar, `constrainEffectSet` has already
    // recorded the necessary edge — adding a structural throw here would
    // falsely reject legitimate row-var subtyping where the concrete
    // sides need the tail to close the gap.
    if (lhs.introduced.tail.tag === 'Closed' && rhs.introduced.tail.tag === 'Closed'
        && !isEffectSubset(lhs.introduced, rhs.introduced)) {
      throw new TypeInferenceError(
        `Handler introduces effects ${effectSetToString(lhs.introduced) || '@{}'} not allowed by ${effectSetToString(rhs.introduced) || '@{}'}`,
      )
    }
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
        // Optional field on the RHS may be absent in LHS — that's fine.
        if (rhs.optionalFields?.has(name)) continue
        throw new TypeInferenceError(`Missing field '${name}' in ${typeToString(lhs)}`)
      }
      // Reject "optional in LHS, required in RHS" — LHS only sometimes has the
      // field, but RHS promises it's always present. Subtype.ts enforces this
      // for covariant checks; the biunification path (`let u: T = …`) needs
      // the same guard or typed annotations silently accept missing fields.
      if (lhs.optionalFields?.has(name) && !rhs.optionalFields?.has(name)) {
        throw new TypeInferenceError(
          `Field '${name}' is optional in ${typeToString(lhs)} but required in ${typeToString(rhs)}`,
        )
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
        // Strict `.` access rejects optional fields — the field may be
        // absent at runtime, which `.` treats as KeyError. Callers must
        // use `?.` (safe access, returns `T | Null`) for optional fields.
        if (lhs.optionalFields?.has(fieldName)) {
          throw new TypeInferenceError(
            `Field '${fieldName}' is optional in ${typeToString(lhs)} and may be absent; use '?.${fieldName}' for safe access`,
          )
        }
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
        // Flow-sensitive narrowing: if the condition is a type guard
        // (`isX(sym)`), equality test (`sym == literal/atom`), `not(...)`
        // wrapper, or `&&`/`||` composition of any of these, narrow the
        // referenced symbols in each branch. Fall back to the outer env
        // if no narrowing shape is recognised. Still unsupported:
        // narrowing on non-Sym arguments like `isX(obj.field)` (would
        // propagate the refinement into the record's field type).
        // See `extractIfNarrowings` for the full list.
        const narrowings = extractIfNarrowings(cond, env)
        const thenEnv = narrowings ? narrowEnv(env, narrowings.whenTrue) : env
        const elseEnv = narrowings ? narrowEnv(env, narrowings.whenFalse) : env
        // Always infer both branches so type errors in dead code still
        // surface (design doc §If narrowing). With fold enabled and the
        // condition reducing to a literal boolean, narrow the result to
        // the live branch only — decision #8 / C8 of the folding design.
        const thenType = inferExpr(thenNode, ctx, thenEnv, typeMap)
        const elseType = elseNode ? inferExpr(elseNode, ctx, elseEnv, typeMap) : NullType
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
              unionEffectSets(thunkAlternatives.map(thunk => thunk.effects), ctx),
              new Set(guaranteedHandled.keys()),
            )
            ctx.addEffects(residualEffects)
            // Phase 4-B: union the handler's introduced effects back in,
            // mirroring the do-with-h application law. Union across
            // alternatives — any could be the active runtime handler.
            ctx.addEffects(unionEffectSets(handlerAlternatives.map(h => h.introduced), ctx))

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
        let wrapperBranchFired = false
        if (wrapperInfo) {
          const wrapperThunkType = argTypes[wrapperInfo.paramIndex]
          if (wrapperThunkType) {
            const innerAlts = getFunctionAlternatives(wrapperThunkType)
            if (innerAlts.length > 0) {
              const thunkEffects = unionEffectSets(innerAlts.map(t => t.effects), ctx)
              const residual = subtractEffects(thunkEffects, new Set(wrapperInfo.handled.keys()))
              ctx.addEffects(residual)
              ctx.addEffects(wrapperInfo.introduced)
              wrapperBranchFired = true
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
            unionEffectSets(thunkAlternatives.map(thunk => thunk.effects), ctx),
            new Set(guaranteedHandled.keys()),
          )
          ctx.addEffects(residualEffects)
          // Phase 4-B: union the handler's introduced effects, same as the
          // zero-arg branch above.
          ctx.addEffects(unionEffectSets(handlerAlternatives.map(h => h.introduced), ctx))

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
            const introduced = unionEffectSets(handlerAlternatives.map(h => h.introduced), ctx)
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
        //
        // Effects: the expected type uses an Open tail so the call-site
        // constraint is permissive about the callee's effects. The callee's
        // actual effects are propagated separately via `ctx.addEffects`
        // below. Using `PureEffects` (Closed empty) here would over-constrain
        // row-polymorphic callees — `constrainEffectSet(calleeEffects, {})`
        // would pin any RowVar sub tail to an upper bound of @{}, rejecting
        // any thunk extras.
        constrain(ctx, calleeType, fn(argTypes, retVar, { effects: new Set(), tail: OpenTail }))
        recordSpecializedCalleeType(calleeNode, selectedAlternative, typeMap)

        // Function-call effect propagation: a callee that declares effects
        // (e.g. `() -> @{io} Number`) performs those effects when called, so
        // they must flow into the surrounding effect context. Without this,
        // effects silently disappear across function-call boundaries —
        // `outer = () -> f()` where f performs @{io} would infer as pure.
        //
        // For a wrapper-typed callee, the wrapper branch above already
        // performed the application-law arithmetic and `FunctionType.effects`
        // of that callee equals its `introduced` by construction — so
        // skipping here avoids double-adding (addEffects into a Set is
        // idempotent today, but the overlap is conceptually redundant).
        //
        // The `selectedAlternative` path fires only for overload-resolved
        // callees with >1 alternative; single-alternative and unresolved
        // (Var) callees fall through to the union, which reduces to the
        // single element or the empty set respectively — a no-op for
        // recursion and polymorphic identity calls.
        if (!wrapperBranchFired) {
          const calledEffects = selectedAlternative
            ? selectedAlternative.effects
            : unionEffectSets(functionAlternatives.map(alt => alt.effects), ctx)
          ctx.addEffects(calledEffects)
        }

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
          && functionAlternatives.every(alt => alt.effects.effects.size === 0 && alt.effects.tail.tag === 'Closed')) {
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
        // C7 / decision #9: narrow on literal operands using JS-style
        // truthiness. For &&, the first falsy operand short-circuits to
        // its own value; for ||, the first truthy operand does. If every
        // operand has a known truthiness without a short-circuit, the
        // result is the last operand's type. Recognised falsy literals:
        // `false`, `0`, `""`, `null`. All other literals are truthy.
        // Bails to the union behaviour below on the first non-literal.
        if (ctx.foldEnabled && types.length > 0) {
          const wantFalsy = nodeType === NodeTypes.And
          let narrowed: Type | undefined
          let allLiteral = true
          for (let i = 0; i < types.length; i++) {
            const expanded = expandType(types[i]!)
            const truthy = literalTruthiness(expanded)
            if (truthy === undefined) {
              allLiteral = false
              break
            }
            const isShortCircuit = wantFalsy ? !truthy : truthy
            if (isShortCircuit) {
              narrowed = expanded
              break
            }
            // Operand has the opposite truthiness — keep scanning. The
            // last operand's type wins if no one short-circuits.
            if (i === types.length - 1) narrowed = expanded
          }
          if (narrowed && allLiteral) {
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
          unionEffectSets(introducedSets, ctx),
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
          // See design/archive/2026-04-19_handler-typing.md.
          ctx.addEffects(unionEffectSets(handlerAlternatives.map(handler => handler.introduced), ctx))

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
 *
 * @internal Exported for tests that build annotation types via
 * `parseTypeAnnotation` and need fresh instances. Not a public API.
 */
export function freshenAnnotationVars(ctx: InferenceContext, t: Type): Type {
  if (!containsVars(t)) return t
  // Two separate mapping tables — value-type vars and row vars have different
  // bound shapes (`Type[]` vs `Set<string>[]`), so keeping them apart avoids
  // a discriminated-union lookup and makes the asymmetry explicit.
  return freshenAllVars(ctx, t, new Map(), new Map())
}

function effectSetContainsVars(e: EffectSet): boolean {
  return e.tail.tag === 'RowVar'
}

function containsVars(t: Type): boolean {
  switch (t.tag) {
    case 'Var': return true
    case 'Function': {
      if (t.params.some(containsVars)) return true
      if (t.restParam !== undefined && containsVars(t.restParam)) return true
      if (containsVars(t.ret)) return true
      if (effectSetContainsVars(t.effects)) return true
      return false
    }
    case 'Handler': {
      if (containsVars(t.body) || containsVars(t.output)) return true
      for (const sig of t.handled.values()) {
        if (containsVars(sig.argType) || containsVars(sig.retType)) return true
      }
      if (effectSetContainsVars(t.introduced)) return true
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

/**
 * Freshen an effect set: if its tail is a RowVar, allocate a fresh RowVar
 * keyed through `rowMapping` so that multiple occurrences of the same row
 * var within one annotation map to the same fresh var. Identity-preserving
 * only — bounds are NOT copied. Annotation-parsed row vars always have
 * empty bounds at parse time (bounds accumulate via biunification at call
 * sites), so there's nothing to copy.
 */
/**
 * Reconstruct a Record type, preserving the `optionalFields` sidecar from
 * the source. Used by freshening, generalization, narrowing, expansion —
 * every path that produces a new Record from an existing one.
 */
function rebuildRecord(
  src: Extract<Type, { tag: 'Record' }>,
  fields: Map<string, Type>,
): Type {
  const rec: Extract<Type, { tag: 'Record' }> = { tag: 'Record', fields, open: src.open }
  if (src.optionalFields && src.optionalFields.size > 0) {
    rec.optionalFields = new Set(src.optionalFields)
  }
  return rec
}

function freshenEffectSet(ctx: InferenceContext, e: EffectSet, rowMapping: Map<number, RowVarTail>): EffectSet {
  if (e.tail.tag !== 'RowVar') return e
  const existing = rowMapping.get(e.tail.id)
  if (existing) return { effects: new Set(e.effects), tail: existing }
  const fresh = ctx.freshRowVar()
  rowMapping.set(e.tail.id, fresh)
  return { effects: new Set(e.effects), tail: fresh }
}

function freshenAllVars(
  ctx: InferenceContext,
  t: Type,
  mapping: Map<string, TypeVar>,
  rowMapping: Map<number, RowVarTail>,
): Type {
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
        t.params.map(p => freshenAllVars(ctx, p, mapping, rowMapping)),
        freshenAllVars(ctx, t.ret, mapping, rowMapping),
        freshenEffectSet(ctx, t.effects, rowMapping),
        // handlerWrapper is passed through unchanged — its HandlerEffectSignature
        // argType/retType fields use the effect registry's types which are
        // globally shared (not per-instance). If a future wrapper declares
        // generic types inside its handled clauses, freshening those fields
        // would need to thread `mapping`/`rowMapping` through the map.
        // All current `effectHandler/` wrappers use concrete arg/ret types
        // (Unknown or specific primitives), so this is latent — not broken.
        t.handlerWrapper,
        t.restParam !== undefined ? freshenAllVars(ctx, t.restParam, mapping, rowMapping) : undefined,
      )
    case 'Handler': {
      const handled = new Map<string, { argType: Type; retType: Type }>()
      for (const [name, sig] of t.handled) {
        handled.set(name, {
          argType: freshenAllVars(ctx, sig.argType, mapping, rowMapping),
          retType: freshenAllVars(ctx, sig.retType, mapping, rowMapping),
        })
      }
      return handlerType(
        freshenAllVars(ctx, t.body, mapping, rowMapping),
        freshenAllVars(ctx, t.output, mapping, rowMapping),
        handled,
        freshenEffectSet(ctx, t.introduced, rowMapping),
      )
    }
    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [k, v] of t.fields) fields.set(k, freshenAllVars(ctx, v, mapping, rowMapping))
      return rebuildRecord(t, fields)
    }
    case 'Array': return array(freshenAllVars(ctx, t.element, mapping, rowMapping))
    case 'Tuple': return tuple(t.elements.map(e => freshenAllVars(ctx, e, mapping, rowMapping)))
    case 'Sequence':
      return sequence(
        t.prefix.map(member => freshenAllVars(ctx, member, mapping, rowMapping)),
        freshenAllVars(ctx, t.rest, mapping, rowMapping),
        t.minLength,
        t.maxLength,
      )
    case 'Union': return union(...t.members.map(m => freshenAllVars(ctx, m, mapping, rowMapping)))
    case 'Inter': return { tag: 'Inter', members: t.members.map(m => freshenAllVars(ctx, m, mapping, rowMapping)) }
    case 'Neg': return { tag: 'Neg', inner: freshenAllVars(ctx, t.inner, mapping, rowMapping) }
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
  // Two mapping tables, same rationale as `freshenAnnotationVars`: row vars
  // carry `Set<string>[]` bounds and value-type vars carry `Type[]` bounds.
  return freshenInner(ctx, t, new Map(), new Map())
}

function freshenInner(
  ctx: InferenceContext,
  t: Type,
  mapping: Map<string, TypeVar>,
  rowMapping: Map<number, RowVarTail>,
): Type {
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
        fresh.lowerBounds.push(freshenInner(ctx, lb, mapping, rowMapping))
      }
      for (const ub of t.upperBounds) {
        fresh.upperBounds.push(freshenInner(ctx, ub, mapping, rowMapping))
      }
      return fresh
    }
    case 'Function':
      return fn(
        t.params.map(p => freshenInner(ctx, p, mapping, rowMapping)),
        freshenInner(ctx, t.ret, mapping, rowMapping),
        freshenEffectSet(ctx, t.effects, rowMapping),
        t.handlerWrapper,
        t.restParam !== undefined ? freshenInner(ctx, t.restParam, mapping, rowMapping) : undefined,
      )
    case 'Handler': {
      const handled = new Map<string, { argType: Type; retType: Type }>()
      for (const [name, sig] of t.handled) {
        handled.set(name, {
          argType: freshenInner(ctx, sig.argType, mapping, rowMapping),
          retType: freshenInner(ctx, sig.retType, mapping, rowMapping),
        })
      }
      return handlerType(
        freshenInner(ctx, t.body, mapping, rowMapping),
        freshenInner(ctx, t.output, mapping, rowMapping),
        handled,
        freshenEffectSet(ctx, t.introduced, rowMapping),
      )
    }
    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [k, v] of t.fields) {
        fields.set(k, freshenInner(ctx, v, mapping, rowMapping))
      }
      return rebuildRecord(t, fields)
    }
    case 'Array':
      return array(freshenInner(ctx, t.element, mapping, rowMapping))
    case 'Tuple':
      return tuple(t.elements.map(e => freshenInner(ctx, e, mapping, rowMapping)))
    case 'Sequence':
      return sequence(
        t.prefix.map(member => freshenInner(ctx, member, mapping, rowMapping)),
        freshenInner(ctx, t.rest, mapping, rowMapping),
        t.minLength,
        t.maxLength,
      )
    case 'Union':
      return union(...t.members.map(m => freshenInner(ctx, m, mapping, rowMapping)))
    case 'Inter':
      return { tag: 'Inter', members: t.members.map(m => freshenInner(ctx, m, mapping, rowMapping)) }
    case 'Neg':
      return { tag: 'Neg', inner: freshenInner(ctx, t.inner, mapping, rowMapping) }
    default:
      return t
  }
}

function effectSetContainsVarsAboveLevel(e: EffectSet, level: number): boolean {
  return e.tail.tag === 'RowVar' && e.tail.level > level
}

/** Check if a type contains any variables above the given level. */
function containsVarsAboveLevel(t: Type, level: number): boolean {
  switch (t.tag) {
    case 'Var': return isGeneralizedTypeVar(t) || t.level > level
    case 'Function': {
      if (t.params.some(p => containsVarsAboveLevel(p, level))) return true
      if (t.restParam !== undefined && containsVarsAboveLevel(t.restParam, level)) return true
      if (containsVarsAboveLevel(t.ret, level)) return true
      if (effectSetContainsVarsAboveLevel(t.effects, level)) return true
      return false
    }
    case 'Handler': {
      if (containsVarsAboveLevel(t.body, level) || containsVarsAboveLevel(t.output, level)) return true
      for (const sig of t.handled.values()) {
        if (containsVarsAboveLevel(sig.argType, level) || containsVarsAboveLevel(sig.retType, level)) {
          return true
        }
      }
      if (effectSetContainsVarsAboveLevel(t.introduced, level)) return true
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
      return rebuildRecord(t, fields)
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

// `env` only holds user bindings — builtins live in a separate registry
// looked up by name. So any hit here means the user has `let`-bound `name`,
// shadowing the builtin. Call sites use this to skip the builtin branch.
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

/**
 * Aggregate multiple effect sets into their least upper bound.
 *
 * - All Closed/Open inputs: union the effect names, pick Open if any input
 *   is Open, else Closed.
 * - Any RowVar inputs (with a `ctx` available): allocate a fresh row var
 *   `ρ_new` and constrain each input as its lower bound — MLsub-style union
 *   over the flat effect lattice. The concrete side is also unioned.
 *   Result: `{ effects: union-of-all-concrete, tail: RowVar(ρ_new) }`.
 * - RowVar inputs without a `ctx`: conservatively fall back to Open tail.
 *   Callers pass `ctx` whenever they care about row-var propagation.
 */
function unionEffectSets(effectSets: EffectSet[], ctx?: InferenceContext): EffectSet {
  if (effectSets.length === 0) return PureEffects

  const effects = new Set<string>()
  let openResult = false
  const rowVars: RowVarTail[] = []
  const rowVarConcreteContributions: Set<string>[] = []
  for (const effectSet of effectSets) {
    for (const effectName of effectSet.effects) effects.add(effectName)
    if (effectSet.tail.tag === 'Open') openResult = true
    if (effectSet.tail.tag === 'RowVar') {
      // Track both the row var itself AND the concrete effects that were
      // alongside it — those need to flow into the fresh var's lower bounds
      // alongside the var edge, since `ρ_new ⊇ {concrete_i} ∪ ρ_i` for each
      // input i, not `ρ_new ⊇ ρ_i` alone.
      rowVars.push(effectSet.tail)
      if (effectSet.effects.size > 0) {
        rowVarConcreteContributions.push(new Set(effectSet.effects))
      }
    }
  }

  if (rowVars.length === 0) {
    return { effects, tail: openResult ? OpenTail : ClosedTail }
  }

  // Row-var case.
  if (openResult) {
    // Open subsumes anything — no point allocating a fresh var.
    return { effects, tail: OpenTail }
  }
  if (!ctx) {
    // No biunification context available; caller didn't opt in. Conservative.
    return { effects, tail: OpenTail }
  }

  // If every input points at the same row var, don't allocate — reuse it.
  // Common case: aggregating multiple alternatives of the same signature.
  // Still push concrete contributions as lower bounds on that row var so
  // callers who later expand the row var directly (not via this returned
  // struct) see them.
  const sharedId = rowVars[0]!.id
  if (rowVars.every(ρ => ρ.id === sharedId)) {
    const shared = rowVars[0]!
    for (const concrete of rowVarConcreteContributions) {
      addRowVarLowerBound(shared, concrete)
    }
    return { effects, tail: shared }
  }

  // Allocate fresh ρ_new and union all inputs as its lower bound.
  const ρNew = ctx.freshRowVar()
  for (const ρ of rowVars) addRowVarEdge(ρ, ρNew)
  for (const concrete of rowVarConcreteContributions) {
    addRowVarLowerBound(ρNew, concrete)
  }
  return { effects, tail: ρNew }
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
/**
 * Flow-sensitive narrowing for `if` conditions. Analyzes the condition AST
 * and returns the refinements that should apply in the then and else branches.
 *
 * Recognised shapes:
 * - `isX(sym)` — builtin type guard. Then: sym & X. Else: sym & !X.
 * - `sym == atomOrLiteral` — equality test. Then: sym & atomOrLiteral.
 *   Else: sym & !atomOrLiteral.
 * - `not(cond)` — swaps then/else from the inner narrowing.
 * - `a && b` — then branch sees the conjunction of operand narrowings;
 *   else branch can't be narrowed (`!(a && b)` = `!a || !b`).
 * - `a || b` — dual: else branch sees the conjunction of operand-false
 *   narrowings; then branch can't be narrowed.
 *
 * Returns undefined if the condition isn't a recognised narrowing shape,
 * in which case the If case falls back to normal inference of both branches.
 *
 * Still unsupported: narrowing on non-Sym arguments like `isX(obj.field)`.
 */
function extractIfNarrowings(cond: AstNode, env: TypeEnv): {
  whenTrue: Map<string, Type>
  whenFalse: Map<string, Type>
} | undefined {
  // `&&`: then-branch narrowing is the conjunction of operand whenTrue
  // maps (intersect on key collision); else-branch narrowing isn't
  // expressible as a single env (would need a union of refinement worlds).
  if (cond[0] === NodeTypes.And) {
    const operands = cond[1] as AstNode[]
    const whenTrue = composeNarrowings(operands.map(op => extractIfNarrowings(op, env)?.whenTrue))
    if (whenTrue.size === 0) return undefined
    return { whenTrue, whenFalse: new Map() }
  }
  // `||`: dual of `&&`.
  if (cond[0] === NodeTypes.Or) {
    const operands = cond[1] as AstNode[]
    const whenFalse = composeNarrowings(operands.map(op => extractIfNarrowings(op, env)?.whenFalse))
    if (whenFalse.size === 0) return undefined
    return { whenTrue: new Map(), whenFalse }
  }

  if (cond[0] !== NodeTypes.Call) return undefined
  const [calleeNode, argNodes] = cond[1] as [AstNode, AstNode[]]
  if (calleeNode[0] !== NodeTypes.Builtin) return undefined
  const builtinName = calleeNode[1] as string
  if (lookupShadowedBuiltin(env, builtinName)) return undefined

  // `not(cond)` — invert the inner narrowing.
  if (builtinName === 'not' && argNodes.length === 1) {
    const inner = extractIfNarrowings(argNodes[0]!, env)
    if (!inner) return undefined
    return { whenTrue: inner.whenFalse, whenFalse: inner.whenTrue }
  }

  // Type-guard builtin: isX(sym) — single Sym arg, callee has a guardType.
  if (argNodes.length === 1) {
    const argNode = argNodes[0]!
    if (argNode[0] !== NodeTypes.Sym) return undefined
    const symName = argNode[1] as string
    const info = getBuiltinType(builtinName)
    if (info.guardType) {
      return {
        whenTrue: new Map([[symName, info.guardType]]),
        whenFalse: new Map([[symName, neg(info.guardType)]]),
      }
    }
    return undefined
  }

  // Equality narrowing: sym == literalOrAtom (or reversed).
  if (argNodes.length === 2 && (builtinName === '==' || builtinName === '!=')) {
    const [leftNode, rightNode] = argNodes as [AstNode, AstNode]
    const narrow = extractEqualityNarrowing(leftNode, rightNode)
      ?? extractEqualityNarrowing(rightNode, leftNode)
    if (!narrow) return undefined
    // For `!=`, positive-branch narrowing is the complement.
    const negated = builtinName === '!='
    return {
      whenTrue: new Map([[narrow.symName, negated ? neg(narrow.value) : narrow.value]]),
      whenFalse: new Map([[narrow.symName, negated ? narrow.value : neg(narrow.value)]]),
    }
  }

  return undefined
}

/**
 * JS-style truthiness for a fully-expanded type. Returns `undefined`
 * when the truthiness cannot be statically determined (e.g. a non-literal
 * primitive, a union, or a record). Falsy literals: `false`, `0`, `""`,
 * `null`. Everything else with a single concrete value is truthy.
 */
function literalTruthiness(t: Type): boolean | undefined {
  if (t.tag === 'Primitive' && t.name === 'Null') return false
  if (t.tag === 'Literal') {
    if (typeof t.value === 'boolean') return t.value
    if (typeof t.value === 'number') return t.value !== 0
    if (typeof t.value === 'string') return t.value !== ''
  }
  return undefined
}

/**
 * Combine multiple per-symbol narrowing maps. Each operand may contribute
 * a refinement for some subset of symbols; on collision, intersect — both
 * refinements must hold simultaneously. Operands that contributed no
 * narrowing show up as `undefined` and are skipped.
 */
function composeNarrowings(maps: (Map<string, Type> | undefined)[]): Map<string, Type> {
  const out = new Map<string, Type>()
  for (const m of maps) {
    if (!m) continue
    for (const [sym, narrow] of m) {
      const existing = out.get(sym)
      out.set(sym, existing ? inter(existing, narrow) : narrow)
    }
  }
  return out
}

/**
 * If `symNode` is a `Sym` reference and `valueNode` is a literal/atom, return
 * the narrowing. Used by equality-based flow narrowing.
 */
function extractEqualityNarrowing(symNode: AstNode, valueNode: AstNode): { symName: string; value: Type } | null {
  if (symNode[0] !== NodeTypes.Sym) return null
  const symName = symNode[1] as string
  const kind = valueNode[0]
  if (kind === NodeTypes.Atom) {
    return { symName, value: atom(valueNode[1] as string) }
  }
  if (kind === NodeTypes.Num || kind === NodeTypes.Str) {
    return { symName, value: literal(valueNode[1] as string | number) }
  }
  if (kind === NodeTypes.Reserved) {
    const lit = valueNode[1] as string
    if (lit === 'true') return { symName, value: literal(true) }
    if (lit === 'false') return { symName, value: literal(false) }
    // 'null' has no Literal type — leave unnarrowed.
  }
  return null
}

/**
 * Create a child env where each entry in `narrowings` intersects the
 * outer type with the narrowing type. Used to thread flow-narrowed types
 * into branch inference.
 */
function narrowEnv(env: TypeEnv, narrowings: Map<string, Type>): TypeEnv {
  if (narrowings.size === 0) return env
  const narrowed = env.child()
  for (const [name, narrow] of narrowings) {
    const outer = env.lookup(name)
    if (!outer) continue
    const intersected = intersectMatchTypes(outer, narrow)
    // Avoid re-binding to the outer type if narrowing yielded nothing
    // tighter — keeps hover/debug output cleaner.
    if (!typeEquals(intersected, outer)) {
      narrowed.bind(name, intersected)
    }
  }
  return narrowed
}

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
      const [rawEntries] = pattern[1] as [ObjectBindingEntry[], AstNode | undefined]
      const fieldsObj = objectBindingFieldsAsRecord(rawEntries)
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
  return rebuildRecord(type, narrowedFields)
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
  const [rawEntries] = pattern[1] as [ObjectBindingEntry[], AstNode | undefined]
  const fieldsObj = objectBindingFieldsAsRecord(rawEntries)

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

  return rebuildRecord(type, narrowedFields)
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
      branches.push(rebuildRecord(from, branchFields))
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
      const [rawEntries] = pattern[1] as [ObjectBindingEntry[], AstNode | undefined]
      const fieldsObj = objectBindingFieldsAsRecord(rawEntries)
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
      const [rawEntries] = pattern[1] as [ObjectBindingEntry[], AstNode | undefined]
      const fieldsObj = objectBindingFieldsAsRecord(rawEntries)

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
      const [rawEntries] = pattern[1] as [ObjectBindingEntry[], AstNode | undefined]
      const fieldsObj = objectBindingFieldsAsRecord(rawEntries)
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
      const [rawEntries] = pattern[1] as [ObjectBindingEntry[], AstNode | undefined]
      const fieldsObj = objectBindingFieldsAsRecord(rawEntries)
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

      const [rawEntries] = pattern[1] as [ObjectBindingEntry[], AstNode | undefined]
      const fieldsObj = objectBindingFieldsAsRecord(rawEntries)
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
      return rebuildRecord(t, fields)
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

// `expandType` (below) resolves a type by expanding all type variables to
// their bounds. Positive polarity: vars expand to their lower bounds (union);
// negative polarity: upper bounds (intersection). The effect-set helpers
// above handle row-var tails analogously at the effect-lattice level.

/**
 * Expand an effect set at a given polarity: fold any row-var tail's
 * concrete bounds into the effect name set.
 *
 * - Positive polarity: union all transitive lowerBounds (the minimum that
 *   the row var must contain). If nothing is known, the tail stays as the
 *   row var — preserving polymorphism for display of generalized types.
 * - Negative polarity: intersect transitive upperBounds (the maximum). If
 *   no upper bound is known, tail becomes Open (any extras allowed).
 *
 * `visited` tracks row-var ids to prevent infinite recursion through
 * var-to-var edges.
 *
 * @internal Exported for tests that verify row-var expansion behaviour
 * directly. Callers in source should use `expandType` which handles the
 * effect sets on Function and Handler nodes automatically.
 */
export function expandEffectSet(e: EffectSet, polarity: 'positive' | 'negative'): EffectSet {
  if (e.tail.tag !== 'RowVar') return e
  const ρ = e.tail
  const visited = new Set<number>()
  const accumulated = new Set<string>(e.effects)

  if (polarity === 'positive') {
    collectRowVarLowerBounds(ρ, accumulated, visited)
    // If ρ has no concrete contribution but participates in var edges that
    // eventually surface concrete bounds, we've collected them. If nothing
    // was added beyond e.effects, preserve the row-var tail for display
    // so generalized polymorphic sigs still show `ρN`.
    if (accumulated.size === e.effects.size && ρ.lowerBounds.length === 0 && ρ.lowerVarBounds.length === 0) {
      return e
    }
    return { effects: accumulated, tail: ClosedTail }
  }

  // negative polarity
  const upper = collectRowVarUpperBounds(ρ, visited)
  if (upper === null) {
    // No upper bound known; anything extra is allowed at this position.
    return { effects: new Set(e.effects), tail: OpenTail }
  }
  // Upper bound is the intersection; only those extras may appear.
  const result = new Set<string>(e.effects)
  for (const u of upper) result.add(u)
  return { effects: result, tail: ClosedTail }
}

function collectRowVarLowerBounds(ρ: RowVarTail, out: Set<string>, visited: Set<number>): void {
  if (visited.has(ρ.id)) return
  visited.add(ρ.id)
  for (const lb of ρ.lowerBounds) {
    for (const e of lb) out.add(e)
  }
  for (const lv of ρ.lowerVarBounds) collectRowVarLowerBounds(lv, out, visited)
}

/**
 * Two-pass intersection: first collect every concrete upper-bound set
 * reachable from ρ via the upper-var-bound graph, then intersect them all.
 * Splitting the traversal from the folding side-steps the prior ambiguity
 * where "cycle-visited" and "no-constraint-contributed" both returned null
 * and became indistinguishable to the caller.
 *
 * Returns null if the transitive closure has no concrete upper bounds at
 * all (unconstrained) — this is genuine "no upper bound known" and is
 * distinct from "already visited in cycle" (which simply doesn't contribute
 * but also doesn't preempt bounds from other paths).
 */
function collectRowVarUpperBounds(ρ: RowVarTail, visited: Set<number>): Set<string> | null {
  const bounds: Set<string>[] = []
  gatherRowVarUpperBounds(ρ, visited, bounds)
  if (bounds.length === 0) return null
  const intersection = new Set(bounds[0])
  for (let i = 1; i < bounds.length; i++) {
    const next = bounds[i]!
    for (const e of intersection) {
      if (!next.has(e)) intersection.delete(e)
    }
  }
  return intersection
}

function gatherRowVarUpperBounds(ρ: RowVarTail, visited: Set<number>, out: Set<string>[]): void {
  if (visited.has(ρ.id)) return
  visited.add(ρ.id)
  for (const ub of ρ.upperBounds) out.push(ub)
  for (const uv of ρ.upperVarBounds) gatherRowVarUpperBounds(uv, visited, out)
}

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
        expandEffectSet(t.effects, polarity),
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
        expandEffectSet(t.introduced, polarity),
      )
    }
    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [k, v] of t.fields) {
        fields.set(k, expandType(v, polarity, new Set(visited)))
      }
      return rebuildRecord(t, fields)
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
        expandEffectSet(t.effects, polarity),
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
        expandEffectSet(t.introduced, polarity),
      )
    }
    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [name, fieldType] of t.fields) {
        fields.set(name, expandTypeForDisplay(fieldType, 'positive', new Set(visited)))
      }
      return rebuildRecord(t, fields)
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
      return rebuildRecord(t, fields)
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
        // Display-only merge — multiple source records with no single "owner"
        // to pass to `rebuildRecord`, so `optionalFields` is intentionally not
        // carried over. This path is only reached by hover/display code.
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

  // Display-only reconstruction from accumulated upper-bound signatures —
  // no single source Record to pass to `rebuildRecord`, so `optionalFields`
  // is intentionally dropped here.
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
