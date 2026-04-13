/**
 * Type representation for Dvala's set-theoretic type system.
 *
 * Every type denotes a set of values. Type operations are set operations:
 * - Union (A | B) = set union
 * - Intersection (A & B) = set intersection
 * - Negation (!A) = set complement
 * - Subtyping (A <: B) = set containment
 *
 * Design: side-table only, erased after checking. Zero runtime cost.
 */

// ---------------------------------------------------------------------------
// Type algebra
// ---------------------------------------------------------------------------

export type PrimitiveName = 'Number' | 'String' | 'Boolean' | 'Null'

/**
 * Effect set: a set of effect names, optionally open (polymorphic).
 * open=true: "these effects plus possibly more" (@{log, e...})
 * open=false: "exactly these effects" (@{log, fetch})
 * Empty closed set = pure function.
 */
export interface EffectSet {
  effects: Set<string>
  open: boolean
}

/** The empty (pure) effect set. Frozen to prevent accidental mutation. */
export const PureEffects: EffectSet = Object.freeze({ effects: Object.freeze(new Set<string>()), open: false })

export type Type =
  // Base types (sets of runtime values)
  | { tag: 'Primitive'; name: PrimitiveName }
  | { tag: 'Atom'; name: string } // Singleton: {:ok}
  | { tag: 'Literal'; value: string | number | boolean } // Singleton: {42}
  | { tag: 'Function'; params: Type[]; ret: Type; effects: EffectSet }
  | { tag: 'Tuple'; elements: Type[] }
  | { tag: 'Record'; fields: Map<string, Type>; open: boolean }
  | { tag: 'Array'; element: Type }
  | { tag: 'Regex' }

  // Set operations
  | { tag: 'Union'; members: Type[] } // A | B | C — flat, deduplicated
  | { tag: 'Inter'; members: Type[] } // A & B & C — flat, deduplicated
  | { tag: 'Neg'; inner: Type } // !A (complement)

  // Bounds
  | { tag: 'Unknown' } // Top type — supertype of all
  | { tag: 'Never' } // Bottom type — empty set, subtype of all

  // Inference (Step 2 — included in the type for completeness)
  | { tag: 'Var'; id: number; level: number; lowerBounds: Type[]; upperBounds: Type[] }

  // Named (Step 2+)
  | { tag: 'Alias'; name: string; args: Type[]; expanded: Type }
  | { tag: 'Recursive'; id: number; body: Type } // μα.F(α)

// ---------------------------------------------------------------------------
// Constructors — readable factory functions
// ---------------------------------------------------------------------------

// Primitives
export const NumberType: Type = { tag: 'Primitive', name: 'Number' }
export const StringType: Type = { tag: 'Primitive', name: 'String' }
export const BooleanType: Type = { tag: 'Primitive', name: 'Boolean' }
export const NullType: Type = { tag: 'Primitive', name: 'Null' }

// Bounds
export const Unknown: Type = { tag: 'Unknown' }
export const Never: Type = { tag: 'Never' }

// Regex
export const RegexType: Type = { tag: 'Regex' }

// Singletons
export function atom(name: string): Type {
  return { tag: 'Atom', name }
}

export function literal(value: string | number | boolean): Type {
  return { tag: 'Literal', value }
}

// Composite types
export function fn(params: Type[], ret: Type, effects: EffectSet = PureEffects): Type {
  return { tag: 'Function', params, ret, effects }
}

export function tuple(elements: Type[]): Type {
  return { tag: 'Tuple', elements }
}

export function record(fields: Record<string, Type>, open = false): Type {
  return { tag: 'Record', fields: new Map(Object.entries(fields)), open }
}

export function array(element: Type): Type {
  return { tag: 'Array', element }
}

// Set operations — flatten and deduplicate at construction
export function union(...members: Type[]): Type {
  // Flatten nested unions
  const flat: Type[] = []
  for (const m of members) {
    if (m.tag === 'Union') {
      flat.push(...m.members)
    } else {
      flat.push(m)
    }
  }

  // Remove Never (identity for union)
  const filtered = flat.filter(t => t.tag !== 'Never')
  if (filtered.length === 0) return Never

  // If Unknown is present, the whole union is Unknown
  if (filtered.some(t => t.tag === 'Unknown')) return Unknown

  // Deduplicate by structural equality
  const deduped = dedup(filtered)

  if (deduped.length === 1) return deduped[0]!
  return { tag: 'Union', members: deduped }
}

export function inter(...members: Type[]): Type {
  // Flatten nested intersections
  const flat: Type[] = []
  for (const m of members) {
    if (m.tag === 'Inter') {
      flat.push(...m.members)
    } else {
      flat.push(m)
    }
  }

  // Remove Unknown (identity for intersection)
  const filtered = flat.filter(t => t.tag !== 'Unknown')
  if (filtered.length === 0) return Unknown

  // If Never is present, the whole intersection is Never
  if (filtered.some(t => t.tag === 'Never')) return Never

  // Deduplicate by structural equality
  const deduped = dedup(filtered)

  if (deduped.length === 1) return deduped[0]!
  return { tag: 'Inter', members: deduped }
}

export function neg(inner: Type): Type {
  // Double negation: !!A = A
  if (inner.tag === 'Neg') return inner.inner
  // !Never = Unknown, !Unknown = Never
  if (inner.tag === 'Never') return Unknown
  if (inner.tag === 'Unknown') return Never
  return { tag: 'Neg', inner }
}

// ---------------------------------------------------------------------------
// Display — human-readable type strings
// ---------------------------------------------------------------------------

export function typeToString(t: Type): string {
  switch (t.tag) {
    case 'Primitive': return t.name
    case 'Atom': return `:${t.name}`
    case 'Literal':
      return typeof t.value === 'string' ? `"${t.value}"` : String(t.value)
    case 'Function': {
      const params = t.params.map(typeToString).join(', ')
      const effectStr = effectSetToString(t.effects)
      return effectStr
        ? `(${params}) -> ${effectStr} ${typeToString(t.ret)}`
        : `(${params}) -> ${typeToString(t.ret)}`
    }
    case 'Tuple': return `[${t.elements.map(typeToString).join(', ')}]`
    case 'Record': {
      const entries = [...t.fields.entries()].map(([k, v]) => `${k}: ${typeToString(v)}`)
      return t.open
        ? `{${entries.join(', ')}, ...}`
        : `{${entries.join(', ')}}`
    }
    case 'Array': return `${typeToString(t.element)}[]`
    case 'Regex': return 'Regex'
    case 'Union': return t.members.map(m => typeToString(m)).join(' | ')
    case 'Inter': return t.members.map(m => typeToString(m)).join(' & ')
    case 'Neg': return `!${typeToString(t.inner)}`
    case 'Unknown': return 'Unknown'
    case 'Never': return 'Never'
    case 'Var': return `α${t.id}`
    case 'Alias': return t.args.length > 0
      ? `${t.name}<${t.args.map(typeToString).join(', ')}>`
      : t.name
    case 'Recursive': return `μ${t.id}.${typeToString(t.body)}`
  }
}

/** Display an effect set. Returns empty string for pure (empty closed) sets. */
export function effectSetToString(e: EffectSet): string {
  if (e.effects.size === 0 && !e.open) return ''
  const names = [...e.effects].sort().join(', ')
  return e.open
    ? `@{${names}, ...}`
    : `@{${names}}`
}

// ---------------------------------------------------------------------------
// Structural equality — used for deduplication
// ---------------------------------------------------------------------------

export function typeEquals(a: Type, b: Type): boolean {
  if (a.tag !== b.tag) return false
  switch (a.tag) {
    case 'Primitive': return a.name === (b as typeof a).name
    case 'Atom': return a.name === (b as typeof a).name
    case 'Literal': return a.value === (b as typeof a).value
    case 'Function': {
      const bf = b as typeof a
      return a.params.length === bf.params.length
        && a.params.every((p, i) => typeEquals(p, bf.params[i]!))
        && typeEquals(a.ret, bf.ret)
        && effectSetEquals(a.effects, bf.effects)
    }
    case 'Tuple': {
      const bt = b as typeof a
      return a.elements.length === bt.elements.length
        && a.elements.every((e, i) => typeEquals(e, bt.elements[i]!))
    }
    case 'Record': {
      const br = b as typeof a
      if (a.open !== br.open) return false
      if (a.fields.size !== br.fields.size) return false
      for (const [k, v] of a.fields) {
        const bv = br.fields.get(k)
        if (!bv || !typeEquals(v, bv)) return false
      }
      return true
    }
    case 'Array': return typeEquals(a.element, (b as typeof a).element)
    case 'Regex': return true
    case 'Union':
    case 'Inter': {
      const bm = (b as typeof a).members
      return a.members.length === bm.length
        && a.members.every((m, i) => typeEquals(m, bm[i]!))
    }
    case 'Neg': return typeEquals(a.inner, (b as typeof a).inner)
    case 'Unknown': return true
    case 'Never': return true
    case 'Var': return a.id === (b as typeof a).id
    case 'Alias': {
      const ba = b as typeof a
      return a.name === ba.name
        && a.args.length === ba.args.length
        && a.args.every((arg, i) => typeEquals(arg, ba.args[i]!))
    }
    case 'Recursive': {
      const brec = b as typeof a
      return a.id === brec.id && typeEquals(a.body, brec.body)
    }
  }
}

// ---------------------------------------------------------------------------
// Effect set helpers
// ---------------------------------------------------------------------------

/** Check if two effect sets are equal. */
export function effectSetEquals(a: EffectSet, b: EffectSet): boolean {
  if (a.open !== b.open) return false
  if (a.effects.size !== b.effects.size) return false
  for (const e of a.effects) {
    if (!b.effects.has(e)) return false
  }
  return true
}

/** Create an effect set from named effects. */
export function effectSet(effects: string[], open = false): EffectSet {
  return { effects: new Set(effects), open }
}

/** Merge two effect sets (union of effects). */
export function mergeEffects(a: EffectSet, b: EffectSet): EffectSet {
  const merged = new Set([...a.effects, ...b.effects])
  return { effects: merged, open: a.open || b.open }
}

/** Subtract handled effects from an effect set. */
export function subtractEffects(from: EffectSet, handled: Set<string>): EffectSet {
  const remaining = new Set([...from.effects].filter(e => !handled.has(e)))
  return { effects: remaining, open: from.open }
}

/** Check if an effect set is a subset of another (fewer effects = subtype). */
export function isEffectSubset(sub: EffectSet, sup: EffectSet): boolean {
  // If sup is open, any sub is a subset (sup accepts more)
  if (sup.open) return true
  // If sub is open but sup is closed, sub might have more effects
  if (sub.open) return false
  // Both closed: every effect in sub must be in sup
  for (const e of sub.effects) {
    if (!sup.effects.has(e)) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function dedup(types: Type[]): Type[] {
  const result: Type[] = []
  for (const t of types) {
    if (!result.some(r => typeEquals(r, t))) {
      result.push(t)
    }
  }
  return result
}
