/**
 * Type simplification for Dvala's set-theoretic type system.
 *
 * Inference produces correct but often unreadable types. Simplification
 * normalizes them for better error messages and display.
 *
 * Steps:
 * 1. Flatten nested unions/intersections
 * 2. Remove redundant members (Never in unions, Unknown in intersections)
 * 3. Collapse disjoint intersections to Never
 * 4. Absorb subtypes in unions (Number | 42 → Number)
 * 5. Collapse trivial negations (Number & !String → Number when disjoint)
 */

import type { Type, PrimitiveName } from './types'
import { Never, Unknown, typeEquals, union, inter, neg } from './types'
import { isSubtype } from './subtype'

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Simplify a type to a normalized, more readable form.
 * Does not change the type's meaning — only its representation.
 */
export function simplify(t: Type): Type {
  switch (t.tag) {
    case 'Union': return simplifyUnion(t.members.map(simplify))
    case 'Inter': return simplifyIntersection(t.members.map(simplify))
    case 'Neg': return simplifyNeg(simplify(t.inner))
    case 'Function': return {
      tag: 'Function',
      params: t.params.map(simplify),
      ret: simplify(t.ret),
      effects: t.effects,
      handlerWrapper: t.handlerWrapper,
    }
    case 'Handler': {
      const handled = new Map<string, { argType: Type; retType: Type }>()
      for (const [name, sig] of t.handled) {
        handled.set(name, {
          argType: simplify(sig.argType),
          retType: simplify(sig.retType),
        })
      }
      return {
        tag: 'Handler',
        body: simplify(t.body),
        output: simplify(t.output),
        handled,
      }
    }
    case 'Tuple': return { tag: 'Tuple', elements: t.elements.map(simplify) }
    case 'Array': return { tag: 'Array', element: simplify(t.element) }
    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [k, v] of t.fields) {
        fields.set(k, simplify(v))
      }
      return { tag: 'Record', fields, open: t.open }
    }
    case 'Alias': return {
      tag: 'Alias',
      name: t.name,
      args: t.args.map(simplify),
      expanded: simplify(t.expanded),
    }
    default: return t
  }
}

// ---------------------------------------------------------------------------
// Union simplification
// ---------------------------------------------------------------------------

function simplifyUnion(members: Type[]): Type {
  // Start with the `union()` constructor which handles flattening,
  // Never removal, Unknown absorption, and deduplication
  const result = union(...members)
  if (result.tag !== 'Union') return result

  // Absorb subtypes: if 42 and Number are both present, keep only Number
  const absorbed = absorbSubtypes(result.members)
  if (absorbed.length === 0) return Never
  if (absorbed.length === 1) return absorbed[0]!
  return { tag: 'Union', members: absorbed }
}

/**
 * Remove members that are subtypes of other members.
 * e.g., [42, Number] → [Number] because 42 <: Number
 */
function absorbSubtypes(members: Type[]): Type[] {
  const result: Type[] = []
  for (let i = 0; i < members.length; i++) {
    const m = members[i]!
    // Keep m unless some other member (not m itself) is a supertype of m
    const absorbed = members.some((other, j) =>
      i !== j && !typeEquals(m, other) && isSubtype(m, other),
    )
    if (!absorbed) result.push(m)
  }
  return result
}

// ---------------------------------------------------------------------------
// Intersection simplification
// ---------------------------------------------------------------------------

function simplifyIntersection(members: Type[]): Type {
  // Start with the `inter()` constructor which handles flattening,
  // Unknown removal, Never absorption, and deduplication
  const result = inter(...members)
  if (result.tag !== 'Inter') return result

  // Check for disjoint base types → Never
  if (hasDisjointPrimitives(result.members)) return Never

  // Collapse trivial negations: Number & !String → Number (already disjoint)
  const collapsed = collapseTrivialNegations(result.members)
  if (collapsed.length === 0) return Unknown
  if (collapsed.length === 1) return collapsed[0]!

  // Narrow supertypes: if Number and 42 are both present, keep only 42
  const narrowed = narrowSupertypes(collapsed)
  if (narrowed.length === 0) return Never
  if (narrowed.length === 1) return narrowed[0]!
  return { tag: 'Inter', members: narrowed }
}

/** Check if the intersection contains disjoint primitive types. */
function hasDisjointPrimitives(members: Type[]): boolean {
  const primitiveNames = new Set<PrimitiveName>()
  for (const m of members) {
    if (m.tag === 'Primitive') {
      primitiveNames.add(m.name)
    }
  }
  return primitiveNames.size > 1
}

/**
 * Remove negation members that are already disjoint with positive members.
 * e.g., Number & !String → Number (Number and String are already disjoint)
 */
function collapseTrivialNegations(members: Type[]): Type[] {
  const positive = members.filter(m => m.tag !== 'Neg')
  const negated = members.filter(m => m.tag === 'Neg') as { tag: 'Neg'; inner: Type }[]

  // Keep only negations that actually constrain something
  const meaningfulNegations = negated.filter(n => {
    // If every positive member is already disjoint with the negated type,
    // the negation adds no information
    if (positive.length > 0) {
      const allDisjoint = positive.every(p => isSubtype(p, neg(n.inner)))
      if (allDisjoint) return false
    }
    return true
  })

  return [...positive, ...meaningfulNegations]
}

/**
 * In intersections, remove members that are supertypes of other members.
 * e.g., [Number, 42] → [42] because Number is a supertype of 42
 */
function narrowSupertypes(members: Type[]): Type[] {
  const result: Type[] = []
  for (let i = 0; i < members.length; i++) {
    const m = members[i]!
    // Keep m unless some other member (not m itself) is a subtype of m
    // (meaning m is a supertype and should be narrowed away)
    const redundant = members.some((other, j) =>
      i !== j && !typeEquals(m, other) && isSubtype(other, m),
    )
    if (!redundant) result.push(m)
  }
  return result
}

// ---------------------------------------------------------------------------
// Negation simplification
// ---------------------------------------------------------------------------

function simplifyNeg(inner: Type): Type {
  // neg() constructor already handles: !!A = A, !Never = Unknown, !Unknown = Never
  return neg(inner)
}
