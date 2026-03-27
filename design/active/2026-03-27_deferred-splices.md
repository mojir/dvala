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

## Investigation Notes

### Three layers of changes needed

**Layer 1: Tokenizer** ✅
`tokenizeCodeTemplate` detects `$${` (value ends with `$` when `$` + `{` is encountered) and emits the full `$${...}` as literal text — no splice parsing.

**Layer 2: splitSegments** ✅
When `splitSegments` encounters `$` + `{` and the literal buffer ends with `$`, it strips one `$` and emits `${expr}` as literal text. This happens at all nesting levels — the `$${` syntax is purely a "strip one `$`" operation.

No backtick depth tracking is needed in `splitSegments`. `${expr}` at any level is always a splice of the current template. `$${expr}` is always deferred. The user controls which level via the `$` count.

**Layer 3: Splice index separation** ✅ (data structure correct, runtime broken)

The outer template's source (after deferred splice stripping) contains both:
- `${op}` → outer splice (replaced with `__splice_N__` placeholder → `Splice(N)` after `replacePlaceholders`)
- Inner code template with `${ast}` → inner splice (parsed independently by inner `splitSegments`)

These share the same `Splice` index namespace, causing collisions. Fix: `replacePlaceholders` offsets outer splice indices by the inner template's splice count when entering a `CodeTmpl` node.

In `astToData`, the CodeTmpl handler distinguishes inner vs outer splices by index:
- `index < innerCount` → inner splice, preserved as `["Splice", index, 0]` data
- `index >= innerCount` → outer splice, resolved to `spliceValues[index - innerCount]`

**Verified**: the expanded AST structure is correct — inner splices preserved, outer values inlined.

### The remaining problem: double conversion

When the inner macro is called and its CodeTmpl body is evaluated, the evaluator calls `astToData` on the body to produce the final AST data. At this point:

- Inner Splice(0) nodes are resolved correctly (replaced with evaluated `ast` value)
- But the inlined outer splice values (already data like `["Function", ...]`) are treated as AST nodes and re-converted by `astToData`

This produces garbage because the data is double-converted. `astToData` can't distinguish "already data from an outer splice" from "AST that needs converting" — they share the same `[type, payload, nodeId]` format.

### Solution: Wrapper node approach

Introduce a new internal node type `InlinedData` that wraps already-resolved data inside CodeTmpl bodies. `astToData` passes `InlinedData` values through without conversion.

**In `astToDataWithCodeTmplAwareness`**: when resolving an outer splice (index >= innerCount), wrap the value:
```typescript
// Instead of: return spliceValues[index - innerCount]!
return toAny([NodeTypes.InlinedData, spliceValues[index - innerCount]!, 0])
```

**In `astToData`**: when encountering `InlinedData`, return the payload as-is:
```typescript
if (type === NodeTypes.InlinedData) {
  return payload as Any
}
```

**In the evaluator's `stepNode`**: when encountering `InlinedData` during CodeTmpl evaluation, return the payload as the value (it's already data).

This is a minimal change — one new node type, three handlers.

## Implementation Plan

1. ~~Tokenizer: `$${` handling~~ ✅ (in stash)
2. ~~splitSegments: deferred splice stripping~~ ✅ (in stash)
3. ~~replacePlaceholders: offset outer indices inside CodeTmpl~~ ✅ (in stash)
4. ~~astToData: CodeTmpl-aware splice resolution~~ ✅ (in stash)
5. **Add `InlinedData` node type** — prevents double conversion of outer splice values
6. **Update `astToDataWithCodeTmplAwareness`** — wrap outer splice values in `InlinedData`
7. **Update `astToData`** — pass through `InlinedData` payloads
8. **Update evaluator `stepNode`** — handle `InlinedData` during CodeTmpl evaluation
9. Add end-to-end tests
10. Run full check + e2e
11. Update skill docs
