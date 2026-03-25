# QualifiedName — Universal Identifier for Dvala Entities

## Status: In Progress

## Summary

Extract the dotted DNS-style naming convention currently used by effects into a first-class concept — `QualifiedName`. Any entity with a public identity in the Dvala ecosystem carries a `QualifiedName` and can be matched using the same wildcard logic.

## Motivation

Today, effects use dotted names (`dvala.io.print`) with wildcard matching (`dvala.*`). As macros gain qualified names (for host-level dispatch via `@dvala.macro.expand`), the same naming and matching infrastructure is needed. Rather than duplicating it, we should recognize that this is a general concept.

The host — which may be JS, Kotlin, WASM, or anything else — needs a platform-agnostic, serializable way to identify and match entities. `QualifiedName` is that.

## Entities with Qualified Names

| Level | Example | Status |
|-------|---------|--------|
| Effect | `dvala.io.print` | Exists today |
| Macro | `mylib.memoize` | Adding (see macro design) |
| Program | `mojir.examples.example1` | Future |
| Module | `mojir.mylib.math` | Future |

## Design

### The name does NOT include the entity type

The type is known from context (effect dispatch, macro expansion, import resolution). Including it in the name would be redundant and make wildcard matching less useful.

```dvala
// Good — "everything from mojir"
qualifiedMatcher("mojir.*")

// Bad — need separate patterns per type
qualifiedMatcher("mojir.macro.*")
qualifiedMatcher("mojir.effect.*")
```

Entities of different types can share the same qualified name without collision — they live in different dispatch contexts.

### Builtins

Generalize the existing effect-specific builtins:

```dvala
// qualifiedName — extract the name string from any qualified entity
qualifiedName(@dvala.io.print)     // → "dvala.io.print"
qualifiedName(memoize)              // → "mylib.memoize"
qualifiedName(regularFunction)      // → null (no qualified name)

// qualifiedMatcher — wildcard/regexp predicate, works on any qualified entity
let pred = qualifiedMatcher("mylib.*");
pred(memoize)                       // → true
pred(@mylib.something)              // → true
pred(@other.thing)                  // → false
```

`effectName` and `effectMatcher` become aliases or are deprecated in favor of the generalized versions.

### Matching rules (unchanged from effects)

- `"dvala.io.print"` — exact match
- `"dvala.*"` — matches `dvala.io.print`, `dvala.error`, etc. (dot-boundary enforced)
- `"*"` — matches everything
- `#"regex"` — regexp match

### Implementation

1. ⏳ **Type**: `QualifiedName` — type alias for `string` (gives the concept a name)
2. ⏳ **Rename**: `effectNameMatchesPattern` → `qualifiedNameMatchesPattern`
3. ⏳ **`EffectRef`**: `.name` becomes `.name: QualifiedName` (no runtime change, just type)
4. ✅ **`MacroFunction`**: `.qualifiedName: string | null` field — populated from `macro "name" (params) -> body` syntax
5. ✅ **`qualifiedName()` builtin**: works on effects (returns name) and macros (returns qualifiedName or null). Returns null for all other values.
6. ⏳ **`qualifiedMatcher()` builtin**: generalized from `effectMatcher` — not yet implemented
7. ⏳ **Host matching**: `findMatchingHandlers` uses the shared matcher

### Backward compatibility

`effectName` and `effectMatcher` can remain as aliases pointing to the generalized versions. No breaking change.
