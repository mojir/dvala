# Stage 0: Dvala Syntax Overhaul

## Goal

Modernize Dvala's syntax to remove usability friction while preserving the language's functional and effect-oriented identity. The core change: JS-style identifiers unlock unary minus, remove mandatory operator spacing, and adopt familiar naming conventions.

## Changes

### 1. JS-style identifier naming
**What:** Symbols follow JavaScript naming rules — letters, digits, `_`, `$`, starting with a letter or `_` or `$`. Hyphens no longer allowed in identifiers.

**Impact:**
- ~424 builtin functions renamed to camelCase
- All `?`-suffix predicates renamed: `empty?` → `isEmpty`, `string?` → `isString`, `effect?` → `isEffect`, etc.
- All kebab-case functions renamed: `drop-last` → `dropLast`, `json-parse` → `jsonParse`, `upper-case` → `upperCase`, etc.
- `effect-name` → `effectName`, `effect-matcher` → `effectMatcher`
- 58 `.dvala` files, 329 test files, reference examples all updated

**Tokenizer changes:**
- Add `-` to `illegalSymbolCharacters` (currently allowed)
- Remove `?`, `!`, and other special chars from allowed symbol characters
- First char: letter, `_`, or `$`
- Subsequent chars: letter, digit, `_`, `$`

### 2. Unary minus support
**What:** `-x` parses as negation. Currently impossible because `-` can appear in symbol names.

**Depends on:** Change #1 (removing `-` from identifiers)

**Implementation:** Add unary minus as a prefix operator in the expression parser. When `-` appears in prefix position (after `(`, `,`, `;`, `=`, operator, or at start), parse as negation.

### 3. Remove ternary `?:` operator
**What:** Remove `condition ? trueExpr : falseExpr` syntax. `if` is already an expression.

**Impact:**
- Remove `?` and `:` from operator list (`:` may still be needed for object literals — check)
- Remove conditional parsing in `parseExpression.ts` (lines 95-106)
- Update any code/tests using ternary

**Note:** `:` is used in object literals `{key: value}` — keep it as a separator, just remove the ternary parsing.

### 4. Remove `unless`
**What:** Remove the `unless` special expression. Use `if not(condition)` instead.

**Impact:**
- Delete `src/builtin/specialExpressions/unless.ts`
- Remove from special expression registry
- Update tests and examples

### 5. Remove `cond`
**What:** Remove the `cond` special expression. `if/else if` chains (with single `end`) cover the same use case more clearly.

**Impact:**
- Delete `src/builtin/specialExpressions/cond.ts`
- Remove from special expression registry
- Migrate `cond` usage to `if/else if` chains
- No more need for `?? default` pattern after `cond` — `else` branch handles it

### 6. Remove `defined?`
**What:** Remove the `defined?` special expression.

**Impact:**
- Delete `src/builtin/specialExpressions/defined.ts`
- Remove from special expression registry
- Update tests — minimal usage expected

### 7. Remove `identical?`
**What:** Remove the `identical?` builtin. Users can use `==` for structural equality (the primary use case).

**Impact:**
- Remove from `src/builtin/core/misc.ts`
- Update tests

### 8. Single `end` for `if/else if` chains
**What:** `else if` treated as a continuation, not a nested `if`. One `end` closes the entire chain.

**Before:**
```
if A then B else if C then D else E end end
```

**After:**
```
if A then B else if C then D else E end
```

**Implementation:** Change the `if` parser to treat `else if` as a flat chain rather than nesting a new `if` expression inside the else branch.

### 9. (Bonus) Automatic tail-call optimization
**What:** Remove `recur` keyword. The evaluator automatically detects and optimizes tail calls.

**Complexity:** High. Requires:
- Detecting tail position during parsing or evaluation
- Replacing `recur(args)` with `self(args)` or direct function call in tail position
- Ensuring it works with `loop`, `do...with`, and other constructs
- **Recommendation:** Defer to Stage 1. Keep `recur` for now but renamed to camelCase (it's already camelCase).

### Open questions (defer to later)

**`do...end` blocks:** Should implicit blocks exist, or always require explicit `do...end`? Current rule: some constructs have implicit blocks (loop body), others require explicit (if you need multiple expressions in `if`). Could simplify by always requiring `do...end` for multi-expression bodies.

**`self` for recursion:** Currently implicit. Options: keep as-is, require explicit naming, or remove in favor of automatic TCO. Tied to the `recur` question.

## Scope estimate

| Category | Count | Effort |
|----------|-------|--------|
| Tokenizer: new symbol rules | 1 file | Small |
| Tokenizer: unary minus | 1-2 files | Medium |
| Parser: remove ternary | 2 files | Small |
| Parser: fix else if | 1 file | Medium |
| Remove unless, cond, defined?, identical? | 5-8 files | Small-Medium |
| Rename ~424 builtins | ~30 source files | Large (mechanical) |
| Update 58 .dvala files | 58 files | Large (mechanical) |
| Update 329 test files | 329 files | Large (mechanical) |
| Update reference/examples | 1 file | Medium |
| Update playground, CLI, VSCode | ~10 files | Medium |
| Update docs (CLAUDE.md, tutorials) | ~5 files | Small |

## Implementation order

1. **Tokenizer: JS-style identifiers** — change symbol rules, add `-` to illegal chars
2. **Parser: unary minus** — add prefix operator support
3. **Parser: remove ternary `?:`** — delete conditional operator parsing
4. **Parser: single `end` for if/else if** — flatten the if chain
5. **Remove `unless`, `cond`, `defined?`, `identical?`** — delete special expressions and builtins
6. **Rename all builtins** — mechanical rename of ~424 functions
7. **Migrate all code** — .dvala files, tests, examples, docs
8. **Update tooling** — playground, CLI, VSCode extension, MCP server

Steps 1-5 are the language changes. Steps 6-8 are mechanical migration. Each step should be independently committable and testable.

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
index-of     → indexOf        json-parse   → jsonParse
json-stringify → jsonStringify lower-case   → lowerCase
upper-case   → upperCase      merge-with   → mergeWith
moving-fn    → movingFn       running-fn   → runningFn
replace-all  → replaceAll     type-of      → typeOf
map-indexed  → mapIndexed     re-match     → reMatch
effect-name  → effectName     effect-matcher → effectMatcher
from-char-code → fromCharCode to-char-code → toCharCode
```

### Special expressions
```
doseq → doSeq (or forEach?)
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

**Low risk:** Removing `unless`, `defined?`, `identical?`, ternary. These are isolated features with limited usage.
