# Stage 0: Dvala Syntax Overhaul

## Goal

Modernize Dvala's syntax to remove usability friction while preserving the language's functional and effect-oriented identity. The core change: JS-style identifiers unlock unary minus, remove mandatory operator spacing, and adopt familiar naming conventions.

## Completed

### ~~3. Remove ternary `?:` operator~~ ✅
Removed. `if...then...else...end` is the only conditional expression.

### ~~4. Remove `unless`~~ ✅
Removed. Use `if not(condition) then` instead.

### ~~5. Remove `cond`~~ ✅
Removed. `if/else if/else/end` chains replace it.

### ~~6. Remove `defined?`~~ ✅
Removed. `??` is now pure null coalescing. Undefined variables always throw.

### ~~7. Remove `identical?`~~ ✅
Removed. `==` (structural equality) is the only comparison.

### ~~8. Single `end` for `if/else if` chains~~ ✅
Implemented. `else if` is parsed as a flat chain — one `end` closes the whole thing.

### Also completed (not originally in this plan)

- **Removed `do...with case` syntax** — `handle...with...end` is the only effect handler
- **Handler shorthand** — `@effect(param) -> body` syntax
- **Effect pipe `||>`** — lightweight `handle...with` sugar
- **Handler param reorder** — `(arg, eff, nxt)` instead of `(eff, arg, nxt)`
- **Removed `$1`** — use `$` for first arg, `$2`, `$3` for rest
- **Moved core builtins to modules** — `sum`/`prod`/`mean`/`median` to vector, `mapcat` to sequence, `moving-fn`/`running-fn` to vector, date functions to time module, JSON functions to json module

---

## Remaining

### 1. JS-style identifier naming
**What:** Symbols follow JavaScript naming rules — letters, digits, `_`, `$`, starting with a letter or `_` or `$`. Hyphens no longer allowed in identifiers.

**Impact:**
- ~424 builtin functions renamed to camelCase
- All `?`-suffix predicates renamed: `empty?` → `isEmpty`, `string?` → `isString`, etc.
- All kebab-case functions renamed: `drop-last` → `dropLast`, `upper-case` → `upperCase`, etc.
- `effect-name` → `effectName`, `effect-matcher` → `effectMatcher`
- ~58 `.dvala` files, ~329 test files, reference examples all updated

**Tokenizer changes:**
- Add `-` to `illegalSymbolCharacters` (currently allowed)
- Remove `?`, `!`, and other special chars from allowed symbol characters
- First char: letter, `_`, or `$`
- Subsequent chars: letter, digit, `_`, `$`

### 2. Unary minus support
**What:** `-x` parses as negation. Currently impossible because `-` can appear in symbol names.

**Depends on:** Change #1 (removing `-` from identifiers)

**Implementation:** Add unary minus as a prefix operator in the expression parser. When `-` appears in prefix position (after `(`, `,`, `;`, `=`, operator, or at start), parse as negation.

### 9. (Bonus) Automatic tail-call optimization
**What:** Remove `recur` keyword. The evaluator automatically detects and optimizes tail calls.

**Complexity:** High. Defer to later. Keep `recur` for now.

### Open questions (defer to later)

**`do...end` blocks:** Should implicit blocks exist, or always require explicit `do...end`? Current rule: some constructs have implicit blocks (loop body), others require explicit. Could simplify by always requiring `do...end` for multi-expression bodies.

**`self` for recursion:** Currently implicit. Options: keep as-is, require explicit naming, or remove in favor of automatic TCO. Tied to the `recur` question.

---

## Scope estimate (remaining work)

| Category | Count | Effort |
|----------|-------|--------|
| Tokenizer: new symbol rules | 1 file | Small |
| Tokenizer: unary minus | 1-2 files | Medium |
| Rename ~424 builtins | ~30 source files | Large (mechanical) |
| Update ~58 .dvala files | ~58 files | Large (mechanical) |
| Update ~329 test files | ~329 files | Large (mechanical) |
| Update reference/examples | 1 file | Medium |
| Update playground, CLI, VSCode | ~10 files | Medium |
| Update docs (tutorials, README) | ~15 files | Medium |

## Implementation order (remaining)

1. **Tokenizer: JS-style identifiers** — change symbol rules, add `-` to illegal chars
2. **Parser: unary minus** — add prefix operator support
3. **Rename all builtins** — mechanical rename of ~424 functions
4. **Migrate all code** — .dvala files, tests, examples, docs
5. **Update tooling** — playground, CLI, VSCode extension, MCP server

Steps 1-2 are language changes. Steps 3-5 are mechanical migration.

## Naming convention reference

### Predicates (`?` suffix → `is` prefix)
```
empty?     → isEmpty        null?      → isNull
string?    → isString       number?    → isNumber
array?     → isArray        object?    → isObject
boolean?   → isBoolean      function?  → isFunction
effect?    → isEffect       regexp?    → isRegexp
zero?      → isZero         pos?       → isPos
neg?       → isNeg          even?      → isEven
odd?       → isOdd          finite?    → isFinite
true?      → isTrue         false?     → isFalse
collection? → isCollection  sequence?  → isSequence
not-empty? → isNotEmpty     blank?     → isBlank
```

### Kebab-case → camelCase
```
drop-last    → dropLast       take-while   → takeWhile
drop-while   → dropWhile      take-last    → takeLast
index-of     → indexOf        lower-case   → lowerCase
upper-case   → upperCase      merge-with   → mergeWith
replace-all  → replaceAll     type-of      → typeOf
re-match     → reMatch        select-keys  → selectKeys
effect-name  → effectName     effect-matcher → effectMatcher
```

### Special expressions
```
doseq → removed (use `for` instead)
```

### Effect names
```
@dvala.io.print       (was println — always adds newline; old no-newline print removed)
@dvala.io.read        (was read-line)
@dvala.io.readStdin   (was read-stdin)
@dvala.io.error       (unchanged)
@dvala.io.pick        (unchanged)
@dvala.io.confirm     (unchanged)
```

## Risk assessment

**High risk:** The bulk rename of ~424 functions across ~400 files. Regex-based migration is fragile — function names appear in strings, comments, docs, and TypeScript type definitions. Need careful validation after each step.

**Medium risk:** Unary minus parsing. Must correctly distinguish `-x` (negation) from `a - b` (subtraction) in all contexts. Edge cases: `-f(x)`, `[-1, 2]`, `if x then -1 else 1 end`.
