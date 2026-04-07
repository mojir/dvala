# Opinionated AST-Based Formatter

**Status:** Active  
**Created:** 2026-04-02  
**Updated:** 2026-04-07

## Goal

Build an opinionated source formatter for Dvala — like `gofmt` — that produces consistently formatted code without losing comments. The formatter is a **fixer**, not just a whitespace normaliser: it enforces one canonical style for spacing, indentation, and structure.

---

## Approach

Use `prettyPrint` (AST → source) as the formatting engine. It already handles indentation, 80-column wrapping, and idiomatic syntax choices. The two things it cannot do are:

1. **Preserve comments** — not in the AST
2. **Preserve authored syntactic form** for constructs where two surface forms map to the same AST

Both are solved with targeted additions, not an architectural rewrite.

---

## Part 1: AST Hints for Sugar Forms

The parser was audited for all cases where two surface forms produce identical AST nodes. Three require hints to preserve authorial intent; the rest are acceptable opinionated normalizations.

### 1a. Shorthand lambda

```dvala
-> $ + 1          // authored as shorthand
($) -> $ + 1      // authored with explicit param
```

Both parse to the same `Function` AST node. `prettyPrint` currently always emits the explicit form.

**AST change:** `Function` node payload gains `isShorthand?: boolean`.  
**Parser change:** `parseShorthandLambdaFunction` sets `isShorthand = true`.  
**prettyPrint change:** when `isShorthand`, omit the `($)` prefix.

### 1b. Infix call

```dvala
1 foo 2       // authored as infix
foo(1, 2)     // authored as prefix call
```

Both parse to the same `Call` AST node. `prettyPrint` currently always emits the prefix form.

**AST change:** `Call` node payload gains `isInfix?: boolean`.  
**Parser change:** infix call parser sets `isInfix = true`.  
**prettyPrint change:** when `isInfix`, emit as `lhs fn rhs`.

### 1c. Pipe call

```dvala
x |> f |> g       // authored as pipeline
g(f(x))           // authored as nested calls
```

Both desugar to the same `Call` chain. `prettyPrint` currently reconstructs a pipe chain from any single-arg nested call sequence — meaning `processData(validate(parse(input)))` silently rewrites to `input |> parse |> validate |> processData`. This is too aggressive for a formatter.

**AST change:** `Call` node payload gains `isPipe?: boolean`.  
**Parser change:** `|>` operator sets `isPipe = true` on the resulting `Call` node.  
**prettyPrint change:** pipe chain reconstruction only fires when `isPipe` is set on the outer call.

### Opinionated normalizations (no hint needed)

These transformations are acceptable because they enforce one unambiguously idiomatic form:

| Written as | Formatter emits | Rationale |
|---|---|---|
| `array(1, 2)` | `[1, 2]` | Literal form is idiomatic |
| `object("a", 1)` | `{ a: 1 }` | Literal form is idiomatic |
| `{ x: x }` | `{ x }` | Shorthand is idiomatic |
| `get(obj, "key")` | `obj.key` | Dot form is idiomatic |
| `+(1, 2)` | `1 + 2` | Built-in operators always infix |
| `0 - x` | `-x` | Unary minus reconstruction |

### Principle

A hint is warranted when **the author's syntactic choice changes how a reader interprets the code**. Mechanical style differences are not hint candidates — the formatter is opinionated about those.

---

## Part 2: Comment Preservation

Comments are not in the AST. We preserve them with a two-phase approach:

```
source
  │
  ├─ tokenize(source, debug=true) ──→ extract + classify comments
  │
  └─ parse ──→ AST ──→ prettyPrint ──→ formatted statements (no comments)
                                              │
                               anchor + reinsert comments
                                              │
                                        final output
```

### Comment classification

Each comment is classified by its relationship to surrounding tokens:

| Kind | Definition | Output placement |
|---|---|---|
| **inline** | Block comment between two code tokens on the same line | Reinserted at exact token-index position |
| **trailing** | Comment after code on the same line | Appended after `;` on the same line |
| **leading** | Comment on its own line immediately before a statement (no blank lines between) | Emitted before the statement |
| **standalone** | Comment separated by blank lines from surrounding code | Emitted before the statement, preceded by one blank line |

### Inline comment reinsertion

The key insight: after minifying (removing whitespace and comments), token N in the original maps to token N in the formatted output — same tokens, same order, just different whitespace. So inline comments need no searching or value matching: the comment was between minified tokens N and N+1 in the original, so it goes between formatted tokens N and N+1.

This breaks only when `prettyPrint` structurally rewrites a construct (e.g. `get(obj, "k")` → `obj.k`), changing the token count. In that case the inline comment falls back to trailing placement.

### Anchoring

Comments are anchored to top-level statement indices (not arbitrary nodeIds). This handles 95%+ of real cases. Intra-expression comments (rare) may shift to trailing placement in edge cases.

| Placement | Anchored to |
|---|---|
| inline / trailing | the statement whose source line contains the comment |
| leading / standalone | the statement whose source line follows the comment |
| before all statements | preamble (emitted at file top) |
| after all statements | epilogue (emitted at file bottom) |

---

## Implementation Plan

### Step 1: AST hints

- Add `isShorthand` to `Function` node (parser + prettyPrint)
- Add `isInfix` to `Call` node (parser + prettyPrint)
- Add `isPipe` to `Call` node (parser + prettyPrint — pipe chain reconstruction gated on this flag)
- Unit tests for round-trip: `format(format(x)) === format(x)` for all three forms

### Step 2: Comment extractor

`src/formatter/extractComments.ts`
- Input: full token stream (from `tokenize()` with `debug=true`)
- Output: `ExtractedComment[]` with `text`, `kind`, `placement`, `sourceLine`, `prevMinifiedIndex`
- Maintains `minifiedCount` counter while walking; records `prevMinifiedIndex = minifiedCount - 1` at each comment

### Step 3: Formatter core

`src/formatter/format.ts`  
`src/formatter/reinsertComments.ts`

- Orchestrates: tokenize → extract comments → parse → prettyPrint per statement → compute inline offsets → reinsert
- On parse failure: return original source unchanged
- Handles shebang, preamble, epilogue, blank line preservation

### Step 4: Public API

`src/tooling.ts` — export `formatSource`  
`src/index.ts` — re-export through tooling  
Playground — wire to Format button in toolbar dropdown

### Step 5: Tests

`src/formatter/format.test.ts` — unit tests using `check(input, expected)` pattern  
`e2e/playground.spec.ts` — e2e test clicking Format and asserting output

### Step 6 (future): CLI + VS Code

- `dvala format <file>` / `dvala format --stdin` / `--check` / `--write`
- VS Code `DocumentFormattingProvider`

---

## Open Questions

- **`:` spacing in objects**: `{ key: value }` — colon is an `Operator` token. Spacing rule needs to differ from arithmetic operators (no space before `:`).
- **Unary minus**: `-x` vs `a - b` — need context to determine spacing (no leading space for unary).
- **Multi-line template strings**: content inside `` `...${expr}...` `` should be untouched by spacing rules.
- **Configurable style**: Start opinionated with zero config. Add config later if needed.
- **Round-trip stability**: `format(format(x)) === format(x)` — enforce this in the test suite.
