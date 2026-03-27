# Macro System — Follow-up Items

Deferred and unrealized items from the [macro system design](../archive/2026-03-24_macro-system.md). These are independent of the [standard macro library](2026-03-27_standard-macro-library.md) and [bundler](2026-03-27_bundler.md) plans.

---

## 1. Core operators as macros (`&&`, `||`, `??`)

Currently implemented as special expressions (`and.ts`, `qq.ts`). The design envisions them as macros expanding to `if/else` at parse time — zero runtime cost.

Deferred reason: performance concern.

**What's needed:**
- Parser-level macro expansion (parse-time, not eval-time)
- Benchmark to confirm no regression
- Remove `and.ts`, `qq.ts` special expressions

---

## 2. Expansion depth limit

No protection against infinite macro expansion (macro A expands to macro B call, which expands to macro A call, etc.).

**What's needed:**
- Counter in macro expansion path
- Configurable limit (e.g., 100)
- Clear error message when exceeded

---

## 3. Binding-position splicing

`${expr}` inside code templates currently only works in expression positions. Binding-position splicing (e.g., `` ```let ${nameNode} = 42``` ``) is not supported.

**What's needed:**
- Parser support for splice markers in binding target positions
- Evaluator support for spliced binding names
- Tests for `let`, function params, destructuring patterns

---

## 4. Nested code templates with inner splices

`${...}` inside inner backtick fences is captured by the outer template's tokenizer. This blocks macro-generating macros.

**What's needed:**
- Backtick-depth-aware splice detection in the tokenizer
- Inner `${...}` should only be captured by the innermost enclosing template
- Tests for macro-generating macros

---

## 5. AST representation redesign

The design (Part 4) describes a clean AST format that differs from the current implementation:

| Aspect | Current | Design target |
|--------|---------|---------------|
| Node format | `["Num", 42, 0]` (3-tuple with nodeId) | `["num", 42]` (2-tuple, lowercase tags) |
| Positions | nodeId integer in every node | Symbol property (`Symbol.for('dvala:pos')`) — invisible to Dvala code |
| Wire format | Not separated | `[position, "tag", ...data]` — position at index 0 |
| Format detection | N/A | `typeof [0] === "number"` → wire; `typeof [0] === "string"` → runtime |

**What's needed:**
- Migrate AST node format (lowercase tags, drop nodeId from tuple)
- Implement Symbol-based position tracking for JS runtime
- Define wire/serialized format with position at index 0
- Update `ast` module constructors/predicates
- Update `prettyPrint`, `astToData`, `CodeTemplateBuildFrame`
- Update all tests

This is a large cross-cutting change. Consider doing it as a dedicated migration.

---

## 6. Continuations and wire format

Macro calls that appear after a suspension point remain as raw AST in serialized continuations. The design (Part 9) identifies requirements:

- `macroApply` AST node type must be part of the wire format
- KMP must handle `@dvala.macro.expand` when resuming continuations containing unexpanded macros
- Macro functions (closures) must be serializable

**Depends on:** AST representation redesign (#5), KMP runtime

---

## 7. KMP macro support

The design (Part 10) specifies what KMP needs:

- Recognize macro calls → perform `@dvala.macro.expand` effect
- Evaluate code template nodes (walk pre-parsed AST, fill in splice values)
- `ast` module (constructors, predicates, accessors)
- Hygiene (gensym during template evaluation)
- Default `@dvala.macro.expand` handler

KMP does NOT need: parser, build-time expansion, macro frame serialization.

**Depends on:** AST representation redesign (#5), continuations wire format (#6)

---

## Priority suggestion

| Item | Impact | Effort | Dependencies |
|------|--------|--------|-------------|
| 2. Expansion depth limit | Safety | Small | None |
| 1. Core operators as macros | Elegance, perf validation | Medium | None |
| 3. Binding-position splicing | Macro expressiveness | Medium | None |
| 4. Nested code template splices | Macro-generating macros | Medium | None |
| 5. AST representation redesign | Foundation for wire format | Large | None |
| 6. Continuations wire format | Cross-platform suspension | Large | #5 |
| 7. KMP macro support | Cross-platform macros | Large | #5, #6 |
