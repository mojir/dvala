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
import { Never, Unknown, array, indexType, inter, keyofType, neg, normalizeSequenceType, tuple, typeEquals, union } from './types'
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
      ...(t.restParam !== undefined ? { restParam: simplify(t.restParam) } : {}),
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
        introduced: t.introduced,
      }
    }
    case 'Tuple': return { tag: 'Tuple', elements: t.elements.map(simplify) }
    case 'Array': return { tag: 'Array', element: simplify(t.element) }
    case 'Sequence':
      return simplifySequence({
        tag: 'Sequence',
        prefix: t.prefix.map(simplify),
        rest: simplify(t.rest),
        minLength: t.minLength,
        ...(t.maxLength !== undefined ? { maxLength: t.maxLength } : {}),
      })
    case 'Record': {
      const fields = new Map<string, Type>()
      for (const [k, v] of t.fields) {
        fields.set(k, simplify(v))
      }
      const rec: Type = { tag: 'Record', fields, open: t.open }
      // Preserve the optional-fields sidecar — dropping it would silently
      // turn optional fields into required ones (unsound).
      if (t.optionalFields && t.optionalFields.size > 0) {
        rec.optionalFields = new Set(t.optionalFields)
      }
      return rec
    }
    case 'Alias': return {
      tag: 'Alias',
      name: t.name,
      args: t.args.map(simplify),
      expanded: simplify(t.expanded),
    }
    case 'Keyof': return keyofType(simplify(t.inner))
    case 'Index': return indexType(simplify(t.target), simplify(t.key))
    // Refinement: simplify the base only. Phase 2.2 will add multi-
    // refinement merging (collapsing `Base & {x|P} & {y|Q}` into one
    // Refined node) and trivial-predicate collapse (`{x | true}` → `Base`);
    // Phase 2.1 keeps the Refined node inert so Phase 2.2 has clean
    // ground to build on.
    case 'Refined': return { tag: 'Refined', base: simplify(t.base), binder: t.binder, predicate: t.predicate, source: t.source }
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

  // Merge Record × Record pairs structurally so that
  // `{a: Number} & {b: String}` becomes `{a: Number, b: String}` —
  // one record whose fields are the merged set. Without this, the
  // intersection stays as an Inter and downstream code (width/depth
  // subtyping, constrain on records) treats the members as
  // overload alternatives rather than a single combined shape.
  const merged = mergeRecordMembers(result.members)
  if (merged.tag === 'Never') return Never
  if (merged.tag !== 'Inter') return merged

  // Check for disjoint base types → Never. Primitive × primitive
  // pairs handled inline (cheap), cross-kind disjointness (e.g.
  // Record × String, Tuple × Boolean) via `isSubtype`'s negation
  // rule (which calls `areDisjoint` internally).
  if (hasDisjointKinds(merged.members)) return Never

  // Collapse trivial negations: Number & !String → Number (already disjoint)
  const collapsed = collapseTrivialNegations(merged.members)
  if (collapsed.length === 0) return Unknown
  if (collapsed.length === 1) return collapsed[0]!

  // Narrow supertypes: if Number and 42 are both present, keep only 42
  const narrowed = narrowSupertypes(collapsed)
  if (narrowed.length === 0) return Never
  if (narrowed.length === 1) return narrowed[0]!
  return { tag: 'Inter', members: narrowed }
}

/**
 * Fold all Record members of an intersection into a single Record via
 * pairwise structural merge. Non-record members pass through
 * unchanged. Returns `Never` only when a shared required field's
 * types have empty intersection. Field-only-on-one-side is ALWAYS
 * carried through (permissive semantics — the other side's closed
 * flag does not veto fields it never declared; see the
 * `intersectRecordPair` JSDoc for the full rationale). Returns the
 * original `Inter` shape when there's at most one record to merge.
 */
function mergeRecordMembers(members: Type[]): Type {
  type RecordType = Type & { tag: 'Record' }
  const records: RecordType[] = []
  const others: Type[] = []
  for (const m of members) {
    if (m.tag === 'Record') records.push(m)
    else others.push(m)
  }
  if (records.length < 2) return { tag: 'Inter', members }
  let combined = records[0]!
  for (let i = 1; i < records.length; i++) {
    const merged = intersectRecordPair(combined, records[i]!)
    if (merged.tag === 'Never') return Never
    if (merged.tag !== 'Record') {
      // Defensive: shouldn't happen, but fall back to leaving the
      // intersection unreduced rather than losing members.
      return { tag: 'Inter', members }
    }
    combined = merged
  }
  if (others.length === 0) return combined
  return { tag: 'Inter', members: [combined, ...others] }
}

/**
 * Pairwise structural intersection of two record types for the
 * user-facing simplify path. Semantics follow the TS-ish "shape
 * merge" convention: `{a: A} & {b: B}` means "has both fields" and
 * resolves to `{a: A, b: B}`, independent of either side's `open`
 * flag at the source. The `open` flag combines as `a.open && b.open`
 * — the result allows extras only if both inputs did.
 *
 * This differs from the narrowing path's `intersectRecords` in
 * `infer.ts`, which uses strict set-theoretic semantics (a closed
 * record's values have EXACTLY those fields, so the intersection
 * with a different closed record is `Never`). That strictness is
 * correct for runtime-value narrowing on tagged unions; it would be
 * surprising here where users write intersections to combine shapes.
 */
function intersectRecordPair(
  a: Type & { tag: 'Record' },
  b: Type & { tag: 'Record' },
): Type {
  const fields = new Map<string, Type>()
  const optionalFields = new Set<string>()
  const allKeys = new Set<string>([...a.fields.keys(), ...b.fields.keys()])
  for (const k of allKeys) {
    const av = a.fields.get(k)
    const bv = b.fields.get(k)
    const aOpt = a.optionalFields?.has(k) ?? false
    const bOpt = b.optionalFields?.has(k) ?? false
    if (av && bv) {
      const intersected = simplify(inter(av, bv))
      if (intersected.tag === 'Never') {
        // If both sides agree the field is optional, values can
        // simply omit it; the record as a whole still has solutions.
        if (aOpt && bOpt) continue
        return Never
      }
      fields.set(k, intersected)
      // Optional only if both sides agree — a required side wins.
      if (aOpt && bOpt) optionalFields.add(k)
    } else if (av) {
      // Field only in `a`. Carry it over with `a`'s optionality.
      // Permissive semantics: `b`'s closedness doesn't veto a field
      // it never declared — combining shapes, not narrowing values.
      fields.set(k, av)
      if (aOpt) optionalFields.add(k)
    } else if (bv) {
      fields.set(k, bv)
      if (bOpt) optionalFields.add(k)
    }
  }
  const open = a.open && b.open
  const out: Type = { tag: 'Record', fields, open }
  if (optionalFields.size > 0) out.optionalFields = optionalFields
  return out
}

/** Check if any pair of members in the intersection is disjoint, in
 * which case the whole intersection is empty (Never). Handles:
 *  - Primitive × Primitive (with the Integer ⊂ Number exception —
 *    `narrowSupertypes` then collapses that pair to Integer).
 *  - Cross-kind pairs (Record × String, Tuple × Boolean, Record ×
 *    Tuple, etc.) via `isSubtype(a, neg(b))`, which runs the
 *    `areDisjoint` logic in subtype.ts. Composite-vs-scalar and
 *    Record-vs-list-kind are the main added cases (see issue #83).
 * Skips pairs where either side is a Var / Neg / Inter / Union /
 * Recursive / Alias / Keyof / Index — those don't have a stable
 * "kind" at this point and could simplify later. */
function hasDisjointKinds(members: Type[]): boolean {
  const names: PrimitiveName[] = []
  for (const m of members) {
    if (m.tag === 'Primitive') names.push(m.name)
  }
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i]!
      const b = names[j]!
      if (a === b) continue
      // Integer ⊂ Number — their intersection is Integer, not empty.
      if ((a === 'Integer' && b === 'Number') || (a === 'Number' && b === 'Integer')) continue
      return true
    }
  }
  // Cross-kind disjointness — leverage the subtype engine's
  // disjointness via `isSubtype(a, neg(b))`. Only consider concrete
  // member pairs (records/tuples/arrays/atoms/regex/function types);
  // skip variables, negations, and other placeholders that may
  // simplify later.
  const concrete = members.filter(isConcreteKindMember)
  for (let i = 0; i < concrete.length; i++) {
    for (let j = i + 1; j < concrete.length; j++) {
      if (isSubtype(concrete[i]!, neg(concrete[j]!))) return true
    }
  }
  return false
}

/**
 * Members whose kind alone can drive disjointness via `areDisjoint`.
 * `Literal` is deliberately excluded: the primitive-pair loop above
 * already catches literal-vs-mismatching-primitive (via the earlier
 * `isEmptyIntersection` path and `areDisjoint`'s literal branches),
 * and `areDisjoint` has no rules for literal vs composite, so a call
 * there would waste work and always return false.
 */
function isConcreteKindMember(t: Type): boolean {
  return t.tag === 'Primitive' || t.tag === 'Atom'
    || t.tag === 'Record' || t.tag === 'Tuple' || t.tag === 'Array' || t.tag === 'Sequence'
    || t.tag === 'Regex' || t.tag === 'Function' || t.tag === 'AnyFunction'
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

// Current strategy: conservative — only collapse sequences back to tuple/array
// canonical forms, no branch merging between distinct sequences in unions.
// If diagnostics become noisy from match subtraction producing many sequence
// branches, consider moderate merging: merge sequences with identical prefixes
// and adjacent/overlapping length intervals (e.g., Sequence([!1], Number, 2, 2)
// | Sequence([!1], Number, 3, undefined) → Sequence([!1], Number, 2, undefined)).
function simplifySequence(type: Extract<Type, { tag: 'Sequence' }>): Type {
  const normalized = normalizeSequenceType(type)

  if (normalized.maxLength !== undefined && normalized.minLength > normalized.maxLength) {
    return Never
  }

  if (normalized.prefix.some(member => member.tag === 'Never')) {
    return Never
  }

  if (normalized.rest.tag === 'Never') {
    return tuple(normalized.prefix)
  }

  if (normalized.prefix.length === 0 && normalized.minLength === 0 && normalized.maxLength === undefined) {
    return array(normalized.rest)
  }

  return normalized
}
