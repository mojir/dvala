# JS-Style Identifiers: Implementation Plan

## Status: IN PROGRESS (branch: js-style-identifiers)

## The Change

Dvala identifiers switch from kebab-case + special chars to JavaScript naming rules:
- **Allowed**: letters, digits, `_`, `$`
- **First char**: letter, `_`, `$`
- **No more**: `-`, `?`, `!` in identifiers

This enables unary minus (`-x`), no mandatory operator spacing, and familiar naming.

## Rename Map

### Core functions (44 renames)

**Predicates (? → is prefix):**
```
array?     → isArray          blank?     → isBlank
boolean?   → isBoolean        collection? → isCollection
contains?  → contains         effect?    → isEffect
empty?     → isEmpty          even?      → isEven
false?     → isFalse          finite?    → isFinite
function?  → isFunction       grid?      → isGrid
integer?   → isInteger        matrix?    → isMatrix
neg?       → isNeg            negative-infinity? → isNegativeInfinity
not-empty? → isNotEmpty       null?      → isNull
number?    → isNumber         object?    → isObject
odd?       → isOdd            pos?       → isPos
positive-infinity? → isPositiveInfinity
regexp?    → isRegexp         sequence?  → isSequence
string?    → isString         true?      → isTrue
vector?    → isVector         zero?      → isZero
```

**kebab-case → camelCase:**
```
drop-last    → dropLast        drop-while   → dropWhile
effect-matcher → effectMatcher  effect-name  → effectName
index-of     → indexOf         lower-case   → lowerCase
merge-with   → mergeWith       re-match     → reMatch
replace-all  → replaceAll      select-keys  → selectKeys
take-last    → takeLast        take-while   → takeWhile
type-of      → typeOf          upper-case   → upperCase
with-doc     → withDoc
```

### Module functions (~170 renames)

Every module function with `-` or `?` needs renaming. Key modules:
- **assertion**: `assert-fails` → `assertFails`, `assert-true` → `assertTrue`, etc. (~27)
- **collection**: `sort-by` → `sortBy`, `group-by` → `groupBy`, etc. (~15)
- **sequence**: `split-with` → `splitWith`, `partition-by` → `partitionBy`, etc. (~10)
- **vector**: all moving/running/normalize functions (~40)
- **math**: `from-polar` → `fromPolar`, etc. (~5)
- **string**: `pad-left` → `padLeft`, `trim-right` → `trimRight`, etc. (~15)
- **grid**: `flip-h` → `flipH`, `push-rows` → `pushRows`, etc. (~20)
- **matrix**: `lower-triangular?` → `isLowerTriangular`, etc. (~15)
- **linear-algebra**: `pearson-corr` → `pearsonCorr`, etc. (~15)
- **number-theory**: `euler-totient` → `eulerTotient`, etc. (~10)
- **bitwise**: `bit-and-not` → `bitAndNot`, etc. (~8)
- **convert**: `to-deg` → `toDeg`, etc. (~5)

### Effect names (1 rename)
```
dvala.io.read-stdin → dvala.io.readStdin
```

### Special expressions
```
No renames needed — all already valid JS identifiers
```

## Implementation Order

### Phase 1: Core function renames ✅
- Renamed 44 core function keys and all usages

### Phase 2: Module function renames ✅
- Renamed ~270 module function keys across all modules

### Phase 3: Effect name renames ✅
- Renamed `dvala.io.read-stdin` → `dvala.io.readStdin`
- Renamed user-defined kebab-case variables in .dvala files and tests

### Phase 4a: Sequence renames ✅
- Renamed all number-theory sequence names (*-seq → *Seq, *-nth → *Nth, etc.)
- Updated TS template types and runtime key generation

### Phase 4b: Update tokenizer — DEFERRED
Rejecting `-`, `?`, `!` in identifiers via illegalSymbolCharacters breaks too much:
- `-` is used in `->` arrow, `-` operator, module names (`number-theory`)
- Needs a more nuanced approach (e.g., context-aware tokenizer rules)
- Old-style names still parse but all definitions use new JS-style names

### Step 5 (remaining): Update tokenizer
- `src/tokenizer/tokenizers.ts` — add `-`, `?`, `!` to illegalSymbolCharacters
- `src/tokenizer/reservedNames.ts` — no changes needed (all reserved words are valid JS ids)
- Update effect name tokenizer to use new rules for segments

### Step 4: Add unary minus
- `src/parser/subParsers/parseOperand.ts` — parse `-` as prefix negation operator
- Or handle in `parseExpression.ts` as a prefix operator

### Step 5: Migrate all Dvala code
- `src/builtin/core/*.dvala` — function bodies
- `src/builtin/modules/*/*.dvala` — module implementations
- `__tests__/**/*.ts` — Dvala code in test strings (~330 files)
- `tutorials/**/*.md` — code blocks
- `README.md` — code examples
- `reference/examples.ts` — example programs
- `playground-www/**` — playground code
- `escape-room.dvala` — example game

### Step 6: Update tooling
- `vscode-dvala/syntaxes/dvala.tmLanguage.json` — syntax highlighting
- `vscode-dvala/README.md` — token list
- `design/reference/dvala-llm-prompt.md` — LLM prompt

### Step 7: Final cleanup
- Remove old names from seeAlso references
- `npm run check`

## Files touched (estimate)
- ~30 source definition files (Step 1)
- ~20 .dvala files (Step 1 + 5)
- ~330 test files (Step 5)
- ~15 tutorial/doc files (Step 5)
- ~5 tooling files (Step 6)
- Total: ~400 files
