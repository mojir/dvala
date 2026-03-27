# Binding-Position Splice in Code Templates

**Status:** Ready
**Created:** 2026-03-27

## Goal

Enable `${expr}` splicing in binding positions inside code templates, so macros can programmatically generate let bindings with destructuring patterns.

---

## Background

### What works today

Simple name splicing — the splice value is a `Sym` node, which fits inside the binding target's expected `["symbol", [symNode, default], id]` structure:

```dvala
let defConst = macro (nameAst, valueAst) -> ```let ${nameAst} = ${valueAst}```;
defConst(myVar, 42);
myVar                    // → 42
```

### What doesn't work

Destructuring pattern splicing — the splice value is an `Array` or `Object` AST node, but the binding target parser wraps it in a `["symbol", [splice, null], 0]` structure. At evaluation time the splice resolves to an array/object AST, which produces garbage:

```dvala
let defConst = macro (nameAst, valueAst) -> ```let ${nameAst} = ${valueAst}```;
defConst([a, b], [1, 2]);
a + b                    // Error: Undefined symbol 'a'
```

`macroexpand` shows the problem: `let Sym,a,0,Sym,b,0 = [1, 2]` — the array AST data is flattened into the binding target instead of being recognized as an array destructuring pattern.

### How code templates work

1. Parser replaces `${expr}` with placeholder `__splice_N__`
2. The assembled source `let __splice_0__ = __splice_1__` is parsed normally
3. `replacePlaceholders` walks the AST, replacing `Sym("__splice_N__")` → `Splice(N)`
4. At evaluation time, `astToData` replaces `Splice(N)` with the evaluated value

The problem: in step 2, `let __splice_0__ = ...` parses `__splice_0__` as a symbol binding target: `["symbol", [["Sym", "__splice_0__", 0], null], 0]`. After step 3, the inner Sym becomes a Splice node. But `astToData` treats the binding target as a plain array structure — it replaces the Splice with its value (e.g. the Array AST node), but the outer `["symbol", ...]` wrapper remains, producing an invalid binding target.

### Binding target format

Binding targets are AST-like tuples:

```
["symbol", [symNode, default?], id]     — simple name: x
["rest", [name, default?], id]          — rest: ...x
["array", [targets[], default?], id]    — array destructuring: [a, b]
["object", [record, default?], id]      — object destructuring: { a, b }
```

## Proposal

### Fix in `astToData` — recognize binding target splices

When `astToData` encounters a Let node, the binding target (first element of the payload) may contain Splice nodes. Currently splices in binding position resolve to raw AST data inside the `["symbol", ...]` wrapper. The fix:

After splice resolution in binding targets, check if the resolved value is an AST node that represents a destructuring pattern. If so, convert it to the appropriate binding target format.

Specifically, in the `astToData` processing of Let nodes:

1. Process the value expression normally (splice resolution)
2. Process the binding target — when a splice inside a `["symbol", [splice, default], id]` resolves to a non-Sym AST node:
   - If it's an `["Array", elements, id]` → convert to `["array", [convertedTargets, default], id]`
   - If it's an `["Object", entries, id]` → convert to `["object", [convertedRecord, default], id]`
   - If it's a `["Sym", name, id]` → keep as `["symbol", [symNode, default], id]` (already works)

The conversion from expression AST to binding target AST is recursive — array elements and object values become nested binding targets.

### AST expression → binding target conversion

```
Expression AST                    → Binding Target
["Sym", "x", id]                  → ["symbol", [["Sym", "x", id], null], 0]
["Array", [elem1, elem2], id]     → ["array", [[target1, target2], null], 0]
["Object", [[k1,v1],[k2,v2]], id] → ["object", [{k1: target1, k2: target2}, null], 0]
```

Each element/value is recursively converted. Rest/spread (`...x`) in array/object positions should also map correctly.

### Where to implement

The conversion should happen in `astToData` when processing Let node payloads, specifically in the binding target position. This is the only place where AST data flows into binding target interpretation.

Alternatively, it could happen earlier in `replacePlaceholders` — when a Splice node replaces a symbol inside a binding target, we could restructure the parent binding target based on the splice value type. But this happens at parse time before splice values are known, so `astToData` (evaluation time) is the right place.

## Open Questions

None — the approach is straightforward.

## Implementation Plan

1. Add a helper `expressionAstToBindingTarget(astData)` that converts expression-format AST data to binding target format
2. In `astToData`, when processing a Let node's binding target, detect when a splice resolved to an Array/Object AST and convert it
3. Add tests for: simple name splice (already works), array destructuring splice, object destructuring splice, nested destructuring, rest elements in spliced patterns
4. Update CLAUDE.md to remove the "binding-position splicing not supported" gotcha
