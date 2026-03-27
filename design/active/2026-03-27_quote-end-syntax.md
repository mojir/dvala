# Replace Code Templates: `quote...end` with `$^{}` Splicing

**Status:** Ready
**Created:** 2026-03-27

## Goal

Replace the triple-backtick code template syntax (``` ``` ```) with `quote...end` blocks and `$^{}` splicing. Remove N-backtick nesting entirely. One syntax for all cases — simple, nestable, no counting.

---

## Background

### Current syntax

```dvala
let double = macro (ast) -> ```${ast} + ${ast}```;
```

N-backtick nesting for macro-generating macros:
```dvala
let makeDoubler = macro (op) ->
  ````macro (ast) -> ```$${ast} ${op} $${ast}```````
```

### Problems

1. **N-backtick counting** — 3, 4, 5, 6+ backticks for nesting. Error-prone, hard to read.
2. **Adjacent closing delimiters** — ```` ``` ```` + ```` ```` ```` = 7 consecutive backticks. Ambiguous, needs spaces.
3. **Markdown/demo collision** — commit messages and docs need even MORE backtick levels to wrap code containing backticks.
4. **Syntax overlay issues** — inner backticks confuse the tokenizer, cause rendering bugs.
5. **Two splice syntaxes** — `${}` and `$${}` for deferred. Implementation detail leaking into syntax.
6. **Two ways to do the same thing** — ``` ``` ``` and `quote...end` (proposed) increases cognitive load.

## Proposal

### New syntax: `quote...end`

```dvala
let double = macro (ast) -> quote $^{ast} + $^{ast} end;
```

Nested:
```dvala
let makeDoubler = macro (op) ->
  quote
    macro (ast) -> quote $^{ast} $^^{op} $^{ast} end
  end;
```

### Splicing: `$^{expr}`

Inside a `quote`, all content is quoted (AST data). To escape back to runtime evaluation, use `$^`:

- `$^{expr}` — escape one level: evaluate `expr` in the immediately enclosing quote's scope
- `$^^{expr}` — escape two levels: evaluate `expr` in the parent quote's scope
- `$^^^{expr}` — escape three levels, etc.
- Unbounded — any number of `^` is valid

Every splice is an explicit "escape from quotation." The `^` count tells you how many levels you're escaping. No special case for "current level."

### Parse error for invalid levels

`$^^{x}` inside a single (non-nested) quote is a parse error: "splice level 2 but only 1 quote level deep." Validated at parse time.

### Remove triple-backtick syntax entirely

No sugar, no fallback. `quote...end` is the only way.

### Examples

**Simple macro:**
```dvala
let double = macro (ast) -> quote $^{ast} + $^{ast} end;
double(21)   // → 42
```

**Macro with let binding:**
```dvala
let unless = macro (cond, body) ->
  quote if not($^{cond}) then $^{body} else null end end;
unless(false, 42)   // → 42
```

**Macro generating macro:**
```dvala
let makeApplier = macro (fn) ->
  quote
    macro (ast) -> quote $^^{fn}($^{ast}) end
  end;
let doubleIt = makeApplier((x) -> x * 2);
doubleIt(21)   // → 42
```

**Multi-statement quote:**
```dvala
let debug = macro (expr) -> quote
  let val = $^{expr};
  perform(@dvala.io.print, str(val));
  val
end;
```

## Migration

### Scope

- All ``` ``` ``` code templates → `quote...end`
- All `${expr}` inside templates → `$^{expr}`
- All `$${expr}` deferred splices → `$^^{expr}`
- Remove N-backtick tokenizer/parser (3, 4, 5+ backticks)
- Remove `CodeTemplate` token type from tokenizer
- Remove `splitSegments` deferred splice handling (no more `$$`)

### Files affected

**Parser:**
- Remove `src/parser/subParsers/parseCodeTemplate.ts` (or rewrite for `quote...end`)
- Remove `src/tokenizer/tokenizers.ts` `tokenizeCodeTemplate`
- Add `quote` to reserved keywords / parser
- Update `splitSegments` — remove `$$` handling, add `$^` handling

**Evaluator:**
- `CodeTmpl` node type → rename to `Quote` (or keep internal name)
- `CodeTemplateBuildFrame` → `QuoteBuildFrame`
- `InlinedData` handling stays (needed for nested quotes)
- `astToData` / `astToDataWithCodeTmplAwareness` — same logic, different node type

**Tests:**
- `__tests__/code-template.test.ts` → rewrite all tests
- `__tests__/macro.test.ts` — update macro tests using templates
- Other test files referencing ``` ``` ```

**Docs/tutorials:**
- All tutorial files with code template examples
- CLAUDE.md skill docs
- Reference examples

**Playground:**
- `SyntaxOverlay.ts` — replace `renderCodeTemplateToken` with `quote` keyword highlighting
- `renderCodeBlock.ts` / `renderDvalaMarkdown.ts` — if they reference templates

## Open Questions

None — all design decisions resolved in discussion.

## Implementation Plan

1. **Add `quote` as reserved keyword** — tokenizer + parser
2. **Implement `quote...end` parser** — similar to `do...end` but produces `Quote` (née `CodeTmpl`) AST nodes. Parse `$^...{expr}` as splice markers with level count.
3. **Update evaluator** — rename `CodeTmpl` → `Quote` (or keep as internal name), update frames
4. **Remove triple-backtick tokenizer** — delete `tokenizeCodeTemplate`, `CodeTemplate` token type
5. **Remove `splitSegments` deferred handling** — the `$^` level is handled by the quote parser directly
6. **Migrate all tests** — code-template, macro, examples
7. **Migrate all docs** — tutorials, CLAUDE.md, skill docs, reference
8. **Update playground** — syntax overlay, code blocks
9. **Run full check + e2e**
10. **Update demo commit messages** (rebase if needed)
