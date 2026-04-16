/**
 * Subtyping checker for Dvala's set-theoretic type system.
 *
 * Subtyping is semantic: S <: T iff the set of values denoted by S
 * is a subset of the set denoted by T.
 *
 * Key rules:
 * - Never <: T for all T (empty set is subset of everything)
 * - T <: Unknown for all T (everything is subset of universal set)
 * - Primitive <: Primitive iff same name
 * - Literal <: Primitive iff the literal's type matches
 * - Function: contravariant params, covariant return
 * - Record: width subtyping (more fields <: fewer fields) + depth subtyping
 * - Union: S1|S2 <: T iff S1 <: T and S2 <: T
 * - Intersection: S <: T1&T2 iff S <: T1 and S <: T2
 * - Negation: S <: !T iff S & T = Never (S and T are disjoint)
 */

import type { FunctionType, SequenceType, Type, PrimitiveName } from './types'
import { functionAcceptsArity, getFunctionParamType, isEffectSubset, sequenceElementAt, sequenceMayHaveIndex, toSequenceType, typeEquals } from './types'

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Check whether S is a subtype of T (S <: T).
 * Uses a visited set for cycle detection (recursive types).
 */
export function isSubtype(s: Type, t: Type): boolean {
  return check(s, t, new Set())
}

// ---------------------------------------------------------------------------
// Core subtyping algorithm
// ---------------------------------------------------------------------------

function check(s: Type, t: Type, visited: Set<string>): boolean {
  // Identical types (by reference or structural equality)
  if (s === t || typeEquals(s, t)) return true

  // Bottom: Never <: T for all T
  if (s.tag === 'Never') return true

  // Top: T <: Unknown for all T
  if (t.tag === 'Unknown') return true

  // Unknown is only a subtype of Unknown (handled by equality above)
  if (s.tag === 'Unknown') return false

  // Never is only a supertype of Never — unless s is provably empty
  if (t.tag === 'Never') {
    if (s.tag === 'Inter' && isEmptyIntersection(s.members)) return true
    return false
  }

  // Cycle guard for recursive types
  const key = cacheKey(s, t)
  if (visited.has(key)) return true // coinductive: assume true for cycles
  visited.add(key)

  // --- Union on the left: S1|S2 <: T iff every member <: T ---
  if (s.tag === 'Union') {
    return s.members.every(m => check(m, t, visited))
  }

  // --- Union on the right: S <: T1|T2 iff S <: some Ti ---
  if (t.tag === 'Union') {
    // First try: is S a subtype of any single member?
    if (t.members.some(m => check(s, m, visited))) return true
    // For primitives and literals, the above is sufficient.
    // For more complex cases (e.g. intersections distributing over unions),
    // a full emptiness check would be needed — deferred to when BDDs are added.
    return false
  }

  // --- Intersection on the right: S <: T1&T2 iff S <: T1 and S <: T2 ---
  if (t.tag === 'Inter') {
    return t.members.every(m => check(s, m, visited))
  }

  // --- Intersection on the left: S1&S2 <: T iff some Si <: T ---
  if (s.tag === 'Inter') {
    // If any member is already a subtype of T, the intersection is too
    if (s.members.some(m => check(m, t, visited))) return true
    // Special case: intersection of disjoint primitives is Never
    if (isEmptyIntersection(s.members)) return true
    return false
  }

  // --- Both negated: !S <: !T iff T <: S (contravariant) ---
  if (s.tag === 'Neg' && t.tag === 'Neg') {
    return check(t.inner, s.inner, visited)
  }

  // --- Negation on the right: S <: !T iff S and T are disjoint ---
  if (t.tag === 'Neg') {
    return areDisjoint(s, t.inner, visited)
  }

  // --- Negation on the left: !S <: T ---
  if (s.tag === 'Neg') {
    // !S <: T is hard in general (requires complement reasoning).
    return false
  }

  // --- Alias: transparent, compare expanded form ---
  if (s.tag === 'Alias') return check(s.expanded, t, visited)
  if (t.tag === 'Alias') return check(s, t.expanded, visited)

  // --- Recursive types: unfold one step ---
  if (s.tag === 'Recursive') return check(unfoldRecursive(s), t, visited)
  if (t.tag === 'Recursive') return check(s, unfoldRecursive(t), visited)

  // --- Type variables: check bounds (Step 2 will extend this) ---
  if (s.tag === 'Var' || t.tag === 'Var') return false

  const sourceSequence = toSequenceType(s)
  const targetSequence = toSequenceType(t)
  if (sourceSequence && targetSequence) {
    return checkSequenceSubtype(sourceSequence, targetSequence, visited)
  }

  // --- Same-tag structural checks ---
  return checkStructural(s, t, visited)
}

// ---------------------------------------------------------------------------
// Structural subtyping (same-tag comparisons)
// ---------------------------------------------------------------------------

function checkStructural(s: Type, t: Type, visited: Set<string>): boolean {
  // Primitive <: Primitive
  if (s.tag === 'Primitive' && t.tag === 'Primitive') {
    return s.name === t.name
  }

  // Atom <: Atom (singletons — only equal atoms are subtypes)
  if (s.tag === 'Atom' && t.tag === 'Atom') {
    return s.name === t.name
  }

  // Literal <: Literal
  if (s.tag === 'Literal' && t.tag === 'Literal') {
    return s.value === t.value
  }

  // Literal <: Primitive (42 <: Number, "hi" <: String, true <: Boolean)
  if (s.tag === 'Literal' && t.tag === 'Primitive') {
    return literalMatchesPrimitive(s.value, t.name)
  }

  // Atom <: Primitive — atoms are NOT subtypes of any primitive
  // (they're their own kind, like symbols in Ruby/Elixir)

  // AnyFunction: supertype of all function types
  if (s.tag === 'Function' && t.tag === 'AnyFunction') return true
  if (s.tag === 'AnyFunction' && t.tag === 'AnyFunction') return true
  // Inter of functions <: AnyFunction
  if (s.tag === 'Inter' && t.tag === 'AnyFunction') {
    if (s.members.some(m => m.tag === 'Function')) return true
  }

  if (s.tag === 'Handler' && t.tag === 'Handler') {
    if (s.handled.size !== t.handled.size) return false
    for (const [name, tSig] of t.handled) {
      const sSig = s.handled.get(name)
      if (!sSig) return false
      if (!check(tSig.argType, sSig.argType, visited)) return false
      if (!check(sSig.retType, tSig.retType, visited)) return false
    }
    return check(s.body, t.body, visited) && check(s.output, t.output, visited)
  }

  // Function: contravariant params, covariant return, covariant effects
  if (s.tag === 'Function' && t.tag === 'Function') {
    if (!isSubtypeFunctionArityCompatible(s, t)) return false
    // Params: contravariant (T's params <: S's params)
    let paramsOk = true
    for (let i = 0; i < Math.max(s.params.length, t.params.length); i++) {
      const sourceParam = getFunctionParamType(s, i)
      const targetParam = getFunctionParamType(t, i)
      if (!sourceParam || !targetParam || !check(targetParam, sourceParam, visited)) {
        paramsOk = false
        break
      }
    }
    if (paramsOk && t.restParam !== undefined) {
      paramsOk = s.restParam !== undefined && check(t.restParam, s.restParam, visited)
    }
    // Return: covariant (S's return <: T's return)
    const retOk = check(s.ret, t.ret, visited)
    // Effects: covariant (fewer effects is subtype — S's effects ⊆ T's effects)
    const effectsOk = isEffectSubset(s.effects, t.effects)
    return paramsOk && retOk && effectsOk
  }

  // Record: width + depth subtyping
  // {name: String, age: Number} <: {name: String} (more fields is subtype)
  if (s.tag === 'Record' && t.tag === 'Record') {
    // Every field in T must exist in S with a subtype value
    for (const [key, tType] of t.fields) {
      const sType = s.fields.get(key)
      if (!sType) {
        // Missing field in S. If S is open, the field might exist → not provably subtype.
        // If S is closed, the field definitely doesn't exist → not a subtype.
        return false
      }
      if (!check(sType, tType, visited)) return false
    }
    // If T is closed, S must not have extra fields (unless S is also closed with same fields)
    if (!t.open && s.fields.size > t.fields.size) return false
    return true
  }

  // Regex: all regex values form one type
  if (s.tag === 'Regex' && t.tag === 'Regex') return true

  // No match — not a subtype
  return false
}

function checkSequenceSubtype(s: SequenceType, t: SequenceType, visited: Set<string>): boolean {
  if (!isLengthIntervalContained(s, t)) return false

  const relevantPrefixLength = Math.max(s.prefix.length, t.prefix.length)
  for (let index = 0; index < relevantPrefixLength; index++) {
    if (!sequenceMayHaveIndex(s, index)) continue
    if (!check(sequenceElementAt(s, index), sequenceElementAt(t, index), visited)) {
      return false
    }
  }

  return !sequenceMayHaveIndex(s, relevantPrefixLength) || check(s.rest, t.rest, visited)
}

// ---------------------------------------------------------------------------
// Disjointness check — S and T have no values in common
// ---------------------------------------------------------------------------

/**
 * Check if two types are disjoint (their intersection is empty).
 * Used for negation subtyping: S <: !T iff S and T are disjoint.
 */
function areDisjoint(s: Type, t: Type, visited: Set<string>): boolean {
  // Never is disjoint with everything
  if (s.tag === 'Never' || t.tag === 'Never') return true

  // Unknown is never disjoint with a non-Never type
  if (s.tag === 'Unknown' || t.tag === 'Unknown') return false

  // Different primitive types are disjoint
  if (s.tag === 'Primitive' && t.tag === 'Primitive') {
    return s.name !== t.name
  }

  // Primitive and Atom are disjoint (atoms are not primitives)
  if ((s.tag === 'Primitive' && t.tag === 'Atom') || (s.tag === 'Atom' && t.tag === 'Primitive')) {
    return true
  }

  // Primitive and Regex are disjoint
  if ((s.tag === 'Primitive' && t.tag === 'Regex') || (s.tag === 'Regex' && t.tag === 'Primitive')) {
    return true
  }

  // Different atoms are disjoint
  if (s.tag === 'Atom' && t.tag === 'Atom') {
    return s.name !== t.name
  }

  // Literal and different primitive are disjoint
  if (s.tag === 'Literal' && t.tag === 'Primitive') {
    return !literalMatchesPrimitive(s.value, t.name)
  }
  if (s.tag === 'Primitive' && t.tag === 'Literal') {
    return !literalMatchesPrimitive(t.value, s.name)
  }

  // Different literals are disjoint
  if (s.tag === 'Literal' && t.tag === 'Literal') {
    return s.value !== t.value
  }

  // Literal and Atom are always disjoint
  if ((s.tag === 'Literal' && t.tag === 'Atom') || (s.tag === 'Atom' && t.tag === 'Literal')) {
    return true
  }

  // Function and non-function are disjoint
  if (s.tag === 'Function' && t.tag !== 'Function' && t.tag !== 'AnyFunction' && isGroundType(t)) return true
  if (t.tag === 'Function' && s.tag !== 'Function' && s.tag !== 'AnyFunction' && isGroundType(s)) return true
  if (s.tag === 'AnyFunction' && isGroundType(t) && t.tag !== 'Function') return true
  if (t.tag === 'AnyFunction' && isGroundType(s) && s.tag !== 'Function') return true

  // Union: disjoint with T iff every member is disjoint with T
  if (s.tag === 'Union') return s.members.every(m => areDisjoint(m, t, visited))
  if (t.tag === 'Union') return t.members.every(m => areDisjoint(s, m, visited))

  // Intersection: disjoint with T if any member is disjoint with T
  // (conservative — may miss some cases)
  if (s.tag === 'Inter') return s.members.some(m => areDisjoint(m, t, visited))
  if (t.tag === 'Inter') return t.members.some(m => areDisjoint(s, m, visited))

  // Default: not provably disjoint
  return false
}

function isLengthIntervalContained(source: SequenceType, target: SequenceType): boolean {
  if (source.minLength < target.minLength) return false
  if (target.maxLength !== undefined && source.maxLength === undefined) return false
  if (target.maxLength !== undefined && source.maxLength !== undefined && source.maxLength > target.maxLength) return false
  return true
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a literal value matches a primitive type name. */
function literalMatchesPrimitive(value: string | number | boolean, name: PrimitiveName): boolean {
  switch (name) {
    case 'Number': return typeof value === 'number'
    case 'String': return typeof value === 'string'
    case 'Boolean': return typeof value === 'boolean'
    case 'Null': return false // null is not a literal
  }
}

/** A ground type has no type variables, unions, intersections, or negations. */
function isGroundType(t: Type): boolean {
  return t.tag === 'Primitive' || t.tag === 'Atom' || t.tag === 'Literal'
    || t.tag === 'Record' || t.tag === 'Tuple' || t.tag === 'Array' || t.tag === 'Sequence'
    || t.tag === 'Regex' || t.tag === 'Function' || t.tag === 'AnyFunction'
}

/** Check if an intersection of types is empty (contains disjoint base types). */
function isEmptyIntersection(members: Type[]): boolean {
  // If two different primitives are intersected, the result is Never
  const primitives = members.filter(m => m.tag === 'Primitive') as { tag: 'Primitive'; name: PrimitiveName }[]
  if (primitives.length >= 2) {
    const names = new Set(primitives.map(p => p.name))
    if (names.size > 1) return true
  }
  // A primitive intersected with a non-matching literal is empty
  for (const prim of primitives) {
    for (const m of members) {
      if (m.tag === 'Literal' && !literalMatchesPrimitive(m.value, prim.name)) return true
      if (m.tag === 'Atom') return true // atoms are disjoint with all primitives
    }
  }
  return false
}

/** Unfold a recursive type by substituting the body's self-reference. */
function unfoldRecursive(rec: Type & { tag: 'Recursive' }): Type {
  return substituteVar(rec.body, rec.id, rec)
}

/** Substitute all occurrences of Var with the given id. */
function substituteVar(t: Type, varId: number, replacement: Type): Type {
  switch (t.tag) {
    case 'Var': return t.id === varId ? replacement : t
    case 'Union': return { tag: 'Union', members: t.members.map(m => substituteVar(m, varId, replacement)) }
    case 'Inter': return { tag: 'Inter', members: t.members.map(m => substituteVar(m, varId, replacement)) }
    case 'Neg': return { tag: 'Neg', inner: substituteVar(t.inner, varId, replacement) }
    case 'Function': return {
      tag: 'Function',
      params: t.params.map(p => substituteVar(p, varId, replacement)),
      ...(t.restParam !== undefined ? { restParam: substituteVar(t.restParam, varId, replacement) } : {}),
      ret: substituteVar(t.ret, varId, replacement),
      effects: t.effects,
      handlerWrapper: t.handlerWrapper,
    }
    case 'Tuple': return { tag: 'Tuple', elements: t.elements.map(e => substituteVar(e, varId, replacement)) }
    case 'Array': return { tag: 'Array', element: substituteVar(t.element, varId, replacement) }
    case 'Sequence': return {
      tag: 'Sequence',
      prefix: t.prefix.map(member => substituteVar(member, varId, replacement)),
      rest: substituteVar(t.rest, varId, replacement),
      minLength: t.minLength,
      ...(t.maxLength !== undefined ? { maxLength: t.maxLength } : {}),
    }
    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [k, v] of t.fields) {
        fields.set(k, substituteVar(v, varId, replacement))
      }
      return { tag: 'Record', fields, open: t.open }
    }
    case 'Alias': return {
      tag: 'Alias',
      name: t.name,
      args: t.args.map(a => substituteVar(a, varId, replacement)),
      expanded: substituteVar(t.expanded, varId, replacement),
    }
    case 'Recursive': {
      // Don't substitute into recursive types that shadow the same variable
      if (t.id === varId) return t
      return { tag: 'Recursive', id: t.id, body: substituteVar(t.body, varId, replacement) }
    }
    default: return t // Primitive, Atom, Literal, Regex, Unknown, Never
  }
}

/** Generate a cache key for a pair of types (for cycle detection). */
function cacheKey(s: Type, t: Type): string {
  return `${typeId(s)}<:${typeId(t)}`
}

/** Structural identifier for a type (for cache keys).
 * Must be unique enough that distinct types don't collide — otherwise
 * the cycle-detection cache returns false positives. */
function typeId(t: Type): string {
  switch (t.tag) {
    case 'Primitive': return `P:${t.name}`
    case 'Atom': return `A:${t.name}`
    case 'Literal': return `L:${t.value}`
    case 'Function': return `F(${t.params.map(typeId).join(',')}${t.restParam !== undefined ? `|...${typeId(t.restParam)}` : ''})${typeId(t.ret)}${t.handlerWrapper ? `|HW:${t.handlerWrapper.paramIndex}:${[...t.handlerWrapper.handled.entries()].map(([name, sig]) => `${name}:${typeId(sig.argType)}:${typeId(sig.retType)}`).join(',')}` : ''}`
    case 'Tuple': return `T[${t.elements.map(typeId).join(',')}]`
    case 'Record': return `R{${[...t.fields.entries()].map(([k, v]) => `${k}:${typeId(v)}`).join(',')}${t.open ? ',..' : ''}}`
    case 'Array': return `Ar[${typeId(t.element)}]`
    case 'Sequence': return `Sq[${t.prefix.map(typeId).join(',')}|${typeId(t.rest)}|${t.minLength}|${t.maxLength ?? '*'}]`
    case 'Regex': return 'Rx'
    case 'Handler': return `H(${typeId(t.body)}=>${typeId(t.output)}|${[...t.handled.entries()].map(([name, sig]) => `${name}:${typeId(sig.argType)}:${typeId(sig.retType)}`).join(',')})`
    case 'AnyFunction': return 'AF'
    case 'Union': return `U(${t.members.map(typeId).join('|')})`
    case 'Inter': return `I(${t.members.map(typeId).join('&')})`
    case 'Neg': return `N:${typeId(t.inner)}`
    case 'Unknown': return '?'
    case 'Never': return '!'
    case 'Var': return `V:${t.id}`
    case 'Alias': return `Al:${t.name}<${t.args.map(typeId).join(',')}>`
    case 'Recursive': return `Rec:${t.id}`
  }
}

function isSubtypeFunctionArityCompatible(source: FunctionType, target: FunctionType): boolean {
  if (target.restParam !== undefined) {
    return source.restParam !== undefined && source.params.length <= target.params.length
  }
  return functionAcceptsArity(source, target.params.length)
}
