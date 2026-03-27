# Deferred Splices in Code Templates

**Status:** In Progress
**Created:** 2026-03-27

## Goal

Enable nested code templates (macro-generating macros) by supporting deferred splices: `$${expr}` and `$$${expr}`.

---

## Background

Today, `${expr}` inside a code template is always captured by the **outermost** template's parser. This means a macro that generates code containing another code template with splices doesn't work — the outer template captures the inner splices.

```dvala
// Doesn't work: outer template captures ${ast}
let makeMacro = macro (body) ->
  ````let m = macro (ast) -> ```${ast} + ${body}```````
```

## Proposal

### Deferred splice syntax

- `${expr}` — resolved by the current template level
- `$${expr}` — passes through as `${expr}` in the output (deferred one level)
- `$$${expr}` — passes through as `$${expr}` in the output (deferred two levels)

Maximum 3 levels (3 `$` signs). This covers macros generating macros generating macros.

### Example

```dvala
let makeDoubler = macro (op) ->
  ````macro (ast) -> ```$${ast} ${op} $${ast}```````
let double = makeDoubler(+);
double(21)   // → 42
```

The outer template (4 backticks) resolves `${op}` and passes `$${ast}` through as `${ast}`. The resulting AST contains a macro whose body is a code template with `${ast}` as a normal splice.

## Investigation Notes (from implementation attempt)

### What works

1. **Tokenizer** (`tokenizeCodeTemplate`): When `$${` is encountered, the tokenizer detects that `value` ends with `$` (from the previous iteration) and emits `$${...}` as literal text in the token — no splice parsing. This correctly preserves the deferred splice in the token value. ✅

2. **`splitSegments`**: When processing the code template content, `$${x}` is recognized by checking if the literal buffer ends with `$`. One `$` is stripped and `${x}` is emitted as literal text. ✅

3. **AST structure**: The outer `macroexpand` produces a valid `["Macro", [[params], [bodyExprs]], id]` where `bodyExprs` contains a `["CodeTmpl", [bodyAst, spliceExprs], id]` with 2 splice expressions referencing the `ast` parameter. ✅

### The deeper problem

The outer code template's content is `macro (ast) -> \`\`\`${ast} + ${ast}\`\`\``. After stripping `$${` → `${`, the inner ` ``` ``` ` is parsed as a code template by `parseCodeTemplate`. The inner template's `${ast}` splices become `Splice` nodes **indexed into the outer template's splice expression list**.

When `astToData` converts the outer template to data, these inner Splice nodes are resolved against the outer template's splice values. But they should be left as Splice nodes for the inner template to resolve at its own evaluation time.

**Root cause:** `parseCodeTemplate` doesn't track backtick depth. When it encounters inner code template delimiters (` ``` `) inside the content, it parses the entire source including the inner template. The inner template's `${...}` splices are handled by the same `splitSegments` call as the outer template's splices. There is only ONE splice index namespace — outer and inner splices share it.

### What needs to change

The fix requires **backtick-depth-aware splice parsing**. Two possible approaches:

**Approach A: Parser-level depth tracking**

`parseCodeTemplate` needs to know that splices inside inner code templates (lower backtick count) belong to the inner template, not the outer one. When building the source with `__splice_N__` placeholders, inner template splices should NOT get placeholder substitution — they should remain as `${expr}` literal text in the source.

This means `splitSegments` (or a replacement) must track backtick nesting depth:
- When encountering ` ``` ` in the content, increment depth
- When encountering the matching closing ` ``` `, decrement depth
- Only create splice expressions for `${...}` at depth 0
- At depth > 0, emit `${...}` as literal text

**Approach B: Two-pass processing**

1. First pass: only process `$${...}` → `${...}` stripping (already done in tokenizer + splitSegments)
2. Second pass: parse the resulting source, which now contains only same-level `${...}` splices

The problem with Approach B: after stripping, the inner template's `${ast}` is indistinguishable from an outer-level `${ast}`. The backtick depth is the only way to know which level it belongs to.

**Approach A is necessary.** The key change is in `splitSegments` (or `parseCodeTemplate`): when scanning content for `${...}` patterns, track backtick nesting and only create splice segments at depth 0.

### Implementation complexity

- `splitSegments` currently does simple `${` scanning with brace matching
- Adding backtick depth tracking requires matching N-backtick delimiters inside the content
- Must handle: 3-backtick, 4-backtick, etc. inner templates
- Must handle: nested template strings (single backtick) — these are NOT code templates
- Edge case: inner code templates that themselves contain deferred splices (`$${}`)

## Implementation Plan

1. **Extend `splitSegments` with backtick depth tracking** — when scanning content, match N-backtick delimiters and only create splice expressions at depth 0. Inner `${...}` at depth > 0 become literal text.
2. **Keep tokenizer changes** — `$${` handling in `tokenizeCodeTemplate` is correct and needed
3. **Keep `splitSegments` deferred splice stripping** — `$` stripping for `$${` is correct, just needs to happen only at depth 0
4. **Add tests** — macro-generating macro end-to-end
5. **Update skill docs** — remove "nested code templates don't work" gotcha
