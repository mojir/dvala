# Core Builtin Inventory — primitive vs derivable

**Status:** Draft (analysis)
**Created:** 2026-06-05
**Parent:** [2026-06-05_minimize-kmp-runtime-surface-via-dvala-builtins.md](2026-06-05_minimize-kmp-runtime-surface-via-dvala-builtins.md)

## Purpose

Step 1 of the parent design, scoped to **core builtins only** (`packages/dvala-engine/src/builtin/core/*.ts` — modules are a later pass).

Classify every core builtin into one of four classes:

- **DONE** — already implemented in a `.dvala` file; free on any second runtime (KMP).
- **PRIM** — *irreducible primitive*: cannot be expressed in pure Dvala. Bottoms out
  in raw arithmetic, the native value-tag representation, persistent-data-structure
  internals, the string/regex/bitwise engine, function-object construction, or
  runtime introspection. **Every runtime implementation must provide these natively.**
- **PORT** — *derivable*: body is pure composition of already-callable builtins +
  control flow. Could move to `.dvala`; KMP would then inherit it for free.
- **PORT\*** — derivable in principle, but **flagged**: either perf-hot (evaluator
  overhead may dwarf the native op) or needs a helper that isn't itself a core
  primitive. Each needs a per-function decision.

## Headline numbers

~126 core builtin functions (counts approximate — variadic operators and the
docs-entry count don't line up perfectly):

| Class | Count | Meaning |
|-------|------:|---------|
| DONE | ~11 | already `.dvala` |
| PRIM | ~79 | irreducible — the KMP **native core-builtin contract** |
| PORT | ~26 | clear migration candidates (first backlog) |
| PORT\* | ~10 | derivable but flagged (perf / missing helper) |

**The useful takeaway for the KMP estimate:** the irreducible *core* builtin
surface is **~79 functions, not 150+**. (The 150+ figure in
[2026-03-28_kmp-migration.md](2026-03-28_kmp-migration.md) counts modules too;
those are a later inventory, and many modules are already `.dvala`.)

**Honest caveat on the win size:** most PRIM functions are individually trivial to
reimplement (tag predicates, arithmetic) — the real KMP cost is the *evaluator*,
not the builtin count. Migrating the ~26 PORT functions removes them from every
future implementation, but for *core* that's a modest saving. The larger payoff is
applying the same pass to **modules** (linear-algebra, grid, matrix, …), where far
more logic is derivable — that's the follow-up the parent doc anticipates.

## The central tension (why PORT isn't automatically "migrate it")

Two different notions of "primitive" pull in opposite directions:

- **KMP-irreducible** (this doc's PRIM): genuinely inexpressible in Dvala → must be
  native everywhere.
- **Perf-primitive**: *could* be Dvala, but is hot enough that we'd keep it native
  in TS for speed.

For a derivable-but-hot function (e.g. `isEmpty`, the `<`/`>` comparison chains),
TS-perf wants it native while KMP-surface wants it `.dvala`. Keeping it native in TS
means KMP must reimplement it; shipping it `.dvala` means it rides the trampoline on
*both* runtimes. **This is exactly what the parent doc's benchmark step (step 3) is
for** — PORT\* is the set where that benchmark actually decides.

## Classification by file

Legend: **DONE** / **PRIM** / **PORT** / **PORT\***

### predicates.ts (26)

| fn | class | note |
|----|-------|------|
| isString, isNumber, isBoolean, isNull, isArray, isObject, isFunction, isMacro, isAtom, isRegexp, isEffect, isCollection, isSequence | PRIM | inspect the native value tag (`typeof` / type-guards) |
| isZero, isPos, isNeg, isEven, isOdd | PORT → **DONE** | `isNumber` + arithmetic (`mod`, `==`, `<`, `>`). Migrated (PR: predicates slice). `abs`/`%` reproduce the native `assertNumber(finite)` guard; `isPos`/`isNeg` force the finite check with a leading `abs(x)`. |
| isInteger | PORT → **stays PRIM** | **Correction:** the suggested `isNumber(x) && x == floor(x)` is unsound on the `Infinity`/`NaN` edge — native `isInteger` returns `false` (no throw) there, but `floor(Infinity)`/`floor(NaN)` *throw* (ArithmeticError / RuntimeError). No core primitive tests integer-ness without throwing on non-finite, so `isInteger` can't be expressed in pure Dvala without changing behaviour. Kept native. |
| isEmpty, isNotEmpty | PORT → **DONE** | `isNull(x) \|\| count(x) == 0` / `!isNull(x) && count(x) > 0`. Migrated. |
| isTrue, isFalse | PORT → **DONE** | `x == true` / `x == false` (`==` is type-strict, so `isTrue(1) == false`). Migrated. |
| isVector, isMatrix, isGrid | PORT\* | need an `all`/`every` fold — **not a core builtin** (only in the `ast` module); would inline a `reduce`. Deferred. |

### math.ts (20)

| fn | class | note |
|----|-------|------|
| +, -, \*, /, ^, %, mod, quot, sqrt, cbrt, round, trunc, floor, ceil, min, max, abs, sign | PRIM | raw numeric operators / `Math.*` |
| inc, dec | PORT | trivially `x + 1` / `x - 1` — but so cheap that PORT\* perf logic applies; likely keep native |

### sequence.ts (19)

| fn | class | note |
|----|-------|------|
| some, sort, takeWhile, dropWhile | DONE | in `sequence.dvala` |
| nth, first, last, pop, push, slice, reverse | PRIM | persistent-vector / string intrinsics (`.get`, `.append`, `.substring`, `.size`) |
| second | PORT | `nth(x, 1)` |
| rest, next | PORT | `slice` + empty/null guard |
| take, drop, takeLast, dropLast | PORT | `slice` + index arithmetic (mirrors the already-migrated `takeWhile`/`dropWhile`) |
| indexOf | PORT | `loop` + `==` |

### misc.ts (14)

| fn | class | note |
|----|-------|------|
| raise | DONE | in `error.dvala` |
| ==, != | PRIM | structural `deepEqual` (recursive over the value representation) — also perf-hot |
| compare | PRIM | `Math.sign` + scalar ordering |
| ! | PRIM | native boolean negation |
| typeOf, effectName, qualifiedName, qualifiedMatcher, macroexpand | PRIM | runtime introspection / evaluator hooks |
| >, <, >=, <= | PORT\* | variadic chain over `compare` — derivable, but hot path → benchmark before moving |

### object.ts (9)

| fn | class | note |
|----|-------|------|
| mergeWith | DONE | in `object.dvala` |
| keys, vals, entries, dissoc | PRIM | persistent-map intrinsics |
| find | PORT | `if contains(o,k) then [k, get(o,k)]` |
| merge | PORT | `reduce` over `keys` + `assoc` |
| zipmap | PORT | `reduce` + `assoc` (uses `min` for length) |
| selectKeys | PORT | `reduce` over `keys` + `contains` + `assoc` |

### collection.ts (8)

| fn | class | note |
|----|-------|------|
| map, filter, reduce | DONE | in `collection.dvala` |
| get, count, contains, assoc, ++ | PRIM | data-structure intrinsics (`contains` also uses `deepEqual`) |

### string.ts (8)

| fn | class | note |
|----|-------|------|
| str, number, lowerCase, upperCase, trim, join, split, isBlank | PRIM | JS string engine / `JSON.stringify` / `Number()` / regex |

### bitwise.ts (6)

| fn | class | note |
|----|-------|------|
| <<, >>, >>>, &, \|, xor | PRIM | raw bitwise operators (variadic fold is derivable, but the binary op is primitive) |

### functional.ts (5)

| fn | class | note |
|----|-------|------|
| \|>, apply | DONE | in `functional.dvala` |
| comp, constantly | PRIM | construct new function objects (FUNCTION_SYMBOL injection) |
| identity | PORT | returns its arg unchanged |

### regexp.ts (4)

| fn | class | note |
|----|-------|------|
| regexp, reMatch, replace, replaceAll | PRIM | native regex engine (`new RegExp`, `.exec`, `.replace`) |

### array.ts (3)

| fn | class | note |
|----|-------|------|
| range | PORT\* | `loop` + `push`; hot generator → benchmark |
| repeat | PORT\* | `loop` + `push` (TS uses transient mutation for speed) |
| flatten | PORT\* | recursion + `isArray`; deep recursion cost on the trampoline |

### meta.ts (3)

| fn | class | note |
|----|-------|------|
| doc, withDoc, arity | PRIM | function-object introspection / mutation |

### assertion.ts (1)

| fn | class | note |
|----|-------|------|
| assert | PORT | `if !cond then raise(...)` — `raise` is already `.dvala` |

## The irreducible primitive set (the KMP native contract, core slice)

This is the deliverable that feeds the parent doc and the `dvala-runtime` contract
question. Grouped by category, ~79 functions that **must** be native in any runtime:

- **Arithmetic / math (18):** `+ - * / ^ % mod quot sqrt cbrt round trunc floor ceil min max abs sign`
- **Bitwise (6):** `<< >> >>> & | xor`
- **Value-tag predicates (13):** `isString isNumber isBoolean isNull isArray isObject isFunction isMacro isAtom isRegexp isEffect isCollection isSequence`
- **Equality / ordering (3):** `== != compare` (+ `!`)
- **Collection/seq intrinsics (16):** `count nth get assoc dissoc ++ keys vals entries first last pop push slice reverse contains`
- **String engine (8):** `str number lowerCase upperCase trim join split isBlank`
- **Regex (4):** `regexp reMatch replace replaceAll`
- **Function / introspection (8):** `comp constantly typeOf doc withDoc arity effectName qualifiedName` (+ evaluator-internal `qualifiedMatcher macroexpand`)

## First migration backlog (PORT — high confidence)

Ordered roughly by cohesion (migrate a file's worth at a time, matching the existing
partial-migration pattern):

1. **predicates** — `isZero isPos isNeg isEven isOdd isInteger isEmpty isNotEmpty isTrue isFalse` (10). Smallest, most mechanical; good first slice.
2. **sequence** — `second rest next take drop takeLast dropLast indexOf` (8). Mirrors the already-migrated `takeWhile`/`dropWhile`; `sequence.dvala` already exists.
3. **object** — `find merge zipmap selectKeys` (4). `object.dvala` already exists (`mergeWith`).
4. **misc/functional/assertion** — `identity` (1), `assert` (1).

`>`/`<`/`>=`/`<=`, `inc`/`dec`, `isVector`/`isMatrix`/`isGrid`, and `range`/`repeat`/`flatten`
are **PORT\*** — defer until the benchmark says whether the trampoline cost is acceptable.

## Caveats / what this does NOT claim

- **Derivability is by code inspection, not execution.** The stale CLI build blocked
  a live check. This is low-risk: the migration mechanism is per-function with the
  TS `evaluate` kept as fallback, so each move is independently verifiable when it
  actually happens (parent doc step 4).
- **PORT ≠ should-migrate.** See "the central tension" — perf decides PORT\*, and may
  pull some plain PORT functions back to native too.
- **Counts are approximate** (variadic operators, docs-entry counting).
- **Modules are out of scope here** by request (builtins before modules). The larger
  derivable surface — and thus the larger KMP-saving — lives in the modules pass.

## Outcome — backlog item 1 (predicates) shipped

The predicates slice landed. **9 of 10 high-confidence PORT predicates migrated** to
[`predicates.dvala`](../../packages/dvala-engine/src/builtin/core/predicates.dvala)
(`isZero isPos isNeg isEven isOdd isEmpty isNotEmpty isTrue isFalse`); docs/arity stay
in `predicates.ts` with throw-stub `evaluate` fallbacks (collection.dvala pattern).
`isInteger` stays native — see the correction above.

**Perf budget (the open question this slice answers).** The pipeline-bench corpus
doesn't call these predicates, so there's no pipeline-level regression. A targeted
micro-benchmark (tight `loop` calling one predicate per iteration, `.dvala` vs an
equivalently-shaped native predicate) isolates the per-call cost:

| | per-call (isolated, loop baseline subtracted) | vs native |
|---|---:|---:|
| native predicate (`isInteger`) | ~240 ns | 1.0× |
| `.dvala` `isEven` | ~1050 ns | ~4.4× |
| `.dvala` `isPos` (with `abs` finite-force) | ~1200 ns | ~5.0× |

So a `.dvala` predicate is **~4–5× a native call** (~0.8–1.0 µs absolute extra),
visible only when a predicate is hammered in a tight loop (e.g. `filter(xs, isEven)`).

**Decision: ship all 9 as `.dvala`.** Consistent with the already-shipped `.dvala`
HOFs — `map`/`filter`/`reduce`/`sort` are far hotter and already run on the trampoline,
so a predicate used as their callback adds proportionally little. The 4–5× factor is
the **perf budget** for future PORT migrations: trivial-body builtins pay roughly this
multiplier, acceptable off the hot path, worth a second look for anything in an inner
loop. (This is the concrete number for the parent doc's open perf question.)

## Next step

Next backlog slice: **sequence** (`second rest next take drop takeLast dropLast indexOf`),
then **object**, then the `identity`/`assert` stragglers. The PORT\* set
(`>`/`<`/`>=`/`<=`, `inc`/`dec`, `range`/`repeat`/`flatten`) should be measured against
this ~4–5× budget before moving — they're hotter than predicates.
