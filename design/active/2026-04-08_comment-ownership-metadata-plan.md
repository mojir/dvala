# Concrete Syntax Tree Plan

**Status:** Decided
**Created:** 2026-04-08

## Goal

Define and execute a complete migration from the current AST-plus-comment-reinsertion formatter to a CST-first architecture where formatting and comment preservation operate on a concrete syntax tree, while the AST remains the semantic representation for evaluation, analysis, and bundling. Work remains on the current `concrete-syntax-tree` branch.

---

## Background

The current formatter uses a two-phase pipeline:

1. Parse source into AST and pretty-print it.
2. Reattach comments by reconstructing ownership from source positions.

That reconstruction has improved for nested statement-like constructs such as block bodies and `if` branches, but it still breaks for expression-local comments. The current regression is:

```dvala
filter(/* an array */ [description, visitedStatus, itemsDesc, exitsDesc], -> not(isEmpty($))) join "\n"
```

The formatter currently moves `/* an array */` to the statement epilogue instead of keeping it attached to the array argument. That suggests the formatter cannot always infer comment ownership correctly after parsing.

The deeper issue is architectural: formatting needs access to concrete syntax details such as comments, punctuation, separators, authored infix/prefix form, and local token adjacency. The AST intentionally abstracts away much of that information because it is primarily a semantic structure.

The desired end state is therefore not a more elaborate ownership-reconstruction system. The desired end state is:

1. Parse source into a CST that preserves concrete syntax.
2. Lower that CST into the AST used by the evaluator and other semantic tooling.
3. Run the formatter from CST data, not from an AST that has already discarded syntax detail.

## Proposal

Adopt a CST-first architecture:

- Parse source into a concrete syntax tree that preserves comments, token relationships, delimiters, separators, and authored syntactic forms.
- Derive the existing AST from that CST.
- Move formatting to operate directly on CST nodes.
- Remove the current post-parse comment reinsertion architecture once CST-based formatting is complete.

### Why this direction

- Comments are a concrete syntax concern, not a semantic AST concern.
- Authored forms such as infix vs prefix are concrete syntax concerns too.
- A CST can preserve comment placement and token adjacency directly instead of forcing the formatter to reconstruct them later.
- The AST can stay focused on semantic meaning, which keeps evaluation, analysis, transforms, and bundling simpler.
- This is the most robust long-term foundation for formatting, comment preservation, and future tooling (LSP, refactoring, code actions).

### Architecture

The pipeline is:

```
source -> tokenize -> CST -> AST
```

Responsibilities by layer:

- **CST** (fully lossless — every source byte accounted for):
  - preserves all tokens including whitespace and comments as trivia
  - preserves punctuation and delimiters
  - preserves authored syntax choices (infix, pipe, shorthand)
  - serves formatting and syntax-fidelity tooling
  - `print(parse(source)) === source` holds by construction
- **AST** (semantic, unchanged from today):
  - preserves semantic structure
  - serves evaluation, analysis, transforms, bundling, and runtime-facing work
  - retains formatting hints (`isInfix`, `isPipe`, `isShorthand`) for `prettyPrint.ts`

The AST continues to exist after this migration. Bundling and evaluation operate on the AST, not on the CST.

## Decided Design

The following decisions were made through structured review on 2026-04-08.

### Parser strategy

**Event-based instrumentation of the existing parser.** No second parser. The existing Pratt parser is instrumented to emit structured events (`startNode`, `token`, `endNode`) into a `CstBuilder` when CST mode is active. A post-parse step converts the event stream into the typed `CstNode` tree. This is the same approach used by rust-analyzer (rowan).

Why events over a separate CST parser:
- Zero drift risk — one parser, not two.
- Syntax changes only need updates in one place. This matters because the type system plan will add new syntax forms (type annotations, effect declarations).
- The existing parser's contextual logic (contextual keywords, quote/splice nesting) stays untouched.
- The instrumentation is mechanical: each sub-parser gets a few `builder.startNode()` / `builder.endNode()` calls around its existing logic.

In CST mode, `ParserContext` operates directly on the full token stream (including whitespace and comments). `peek()` skips trivia internally; `advance()` collects trivia and produces a `CstToken`. The minified token stream is not created for the CST path. This makes the parser the single owner of token consumption including trivia — no parallel arrays to keep in sync.

### Public API

- `parse()` continues to return AST as today. Callers unchanged.
- New `parseToCst()` returns the CST. Internally: parse with CST events enabled, build CstNode tree from events. Only the formatter calls this.
- Eager: the CST event stream is not retained after tree construction.

### CST losslessness

**Fully lossless.** Every token including whitespace is represented in the tree. Concatenating all leaf nodes reproduces the original source exactly.

Rationale: the tokenizer already produces all tokens. The gap between partial and lossless is small. Lossless is the industry standard (Roslyn, rust-analyzer, swift-syntax, tree-sitter, Biome, Ruff) and provides the strongest foundation for future tooling (LSP, refactoring, code actions) without rework.

### Trivia attachment convention

**Split convention:** same-line trivia is trailing trivia of the previous token; next-line trivia is leading trivia of the next token. This matches how comments naturally behave — `let x = 1 // foo` attaches `// foo` to the `1` token, not to whatever follows.

The formatter is the bridge that produces deterministic output from any trivia arrangement. `format(format(source)) === format(source)` (idempotency) because the formatter normalizes trivia placement regardless of how it was originally attached.

### CST type design

**New separate type hierarchy** (`CstNode`, `CstToken`) — not extensions of `AstNode`. CST and AST have different concerns; mixing them into one type defeats the purpose.

**CST leaf nodes** are `CstToken` — a new type that bundles `{ leadingTrivia, token, trailingTrivia }`. Trivia is a per-token concern; co-locating it with the token keeps the tree walk simple.

**CST interior nodes** use **typed nodes with named fields** per syntax form:
```ts
// Example — not final
interface CstCallNode {
  kind: 'Call'
  fn: CstNode
  openParen: CstToken
  args: CstNode[]
  commas: CstToken[]
  closeParen: CstToken
  span: SourceSpan
}
```
Named fields are self-documenting, catch errors at compile time, and are practical for a hand-written parser with a moderate number of syntax forms.

### Source positions

**CST nodes store their source span** (start line/col, end line/col), set during parsing. The parser already tracks positions in `ParserContext`; storing them is cheap and avoids repeated tree walks.

**CST-to-AST lowering preserves the current `SourceMap`** by transferring positions from CST nodes to AST node IDs. Error messages and stack traces continue to work.

### Formatter architecture

**The formatter operates on CST nodes via a Wadler-Lindig document algebra.** The CST formatter walks the typed CstNode tree and produces a `Doc` tree (Text, Line, Group, Nest, Concat, HardLine, IfBreak, LineComment). A renderer takes a target line width and produces the formatted string. This was originally considered overkill, but reassessed during the Phase 3 interview: because comments are now part of the tree and participate in line-breaking decisions, the algebra's automatic width accounting pays for itself. See Q7 for the full rationale.

### `prettyPrint.ts` and formatting hints

**`prettyPrint.ts` survives** as the runtime AST printer for REPL output, playground display, and the `ast` module's `prettyPrint` function. These contexts have no source text and no CST.

**AST formatting hints (`isInfix`, `isPipe`, `isShorthand`) stay on the AST.** They are needed by `prettyPrint.ts` for runtime display of AST values. The CST formatter does not need them — it reads authored form directly from CST structure — but removing them from the AST is not a goal.

### What the CST must preserve

The CST preserves every byte of the source. Beyond that losslessness guarantee, the tree structure must make the following accessible without reconstruction heuristics:

- comments: leading, trailing, inline, file-level (via trivia attachment)
- punctuation: commas, semicolons, delimiters, parentheses, brackets, braces (as `CstToken` fields)
- separators between entries and arguments
- authored operator/infix/prefix form (from CST node kind, not hints)
- pipe chain structure as authored
- token adjacency and local trivia boundaries
- grouping structure sufficient to format arrays, objects, call arguments, branches, handlers, templates, and other nested syntax forms

### What this solves better than the current approach

- `filter(/* an array */ [a, b], pred)` — the comment is trivia on the `[` token's `CstToken`. No ownership inference needed.
- Inline comments stay attached to the exact syntax boundary they came from.
- Authored syntax like infix `a join b` is preserved by CST node structure, not by encoding formatting policy into AST hints.
- New syntax features are easier to support because the formatter works from syntax-preserving data.

### Comparison With AST-Plus-Metadata

The strongest alternative considered was keeping the AST-based formatter and adding a sidecar comment ownership map. That is viable and significantly better than the current solution, but it still leaves formatting centered on a structure that was not designed to preserve concrete syntax.

Why CST is preferred over AST-plus-metadata:

- CST preserves more than comments; it preserves syntax shape more generally.
- It avoids reintroducing a parallel syntax model beside the AST that eventually behaves like a hidden CST.
- It gives the formatter direct access to the layer it actually needs.

### Comment classes to cover

The CST-based formatter must correctly preserve all formatter-relevant comment categories:

- File preamble comments.
- File epilogue comments.
- Leading comments on top-level expressions.
- Trailing comments on top-level expressions.
- Leading comments on nested expressions.
- Trailing comments on nested expressions.
- Inline comments that belong between specific rendered tokens or specific child nodes.
- Collection-local comments, including comments before array elements and object entries.
- Comments attached to call arguments, infix operands, pipe segments, branches, handlers, quotes, and templates.

### Non-goals

- Replacing the AST as the semantic representation.
- Making comments part of evaluation semantics.
- Preserving the current reinsertion architecture as a permanent fallback.
- Forcing bundling or evaluation to consume CST directly.
- Removing formatting hints from the AST (they are still needed by `prettyPrint.ts`).

### Migration policy

During implementation it is acceptable to keep parts of the old formatter machinery temporarily so tests can stay green while CST support expands. But that is strictly a migration aid. The plan ends with the removal of the current ownership-reconstruction and reinsertion logic as the formatter's primary strategy.

### Success criteria

The migration is complete when all of the following are true:

- The formatter operates on CST and no longer depends on comment reinsertion or post-parse ownership reconstruction.
- The CST is fully lossless: concatenating leaf tokens reproduces the original source.
- The CST lowers to AST with semantic equivalence to the current parser output.
- `parse()` returns AST as before; existing callers are unchanged.
- Evaluation, analysis, and bundling continue to operate through the AST layer without semantic regressions.
- `prettyPrint.ts` continues to work for runtime AST display.
- Formatter round-trip tests, comment regressions, and `npm run check` pass.

### Migration risks

- CST-to-AST lowering drift could subtly change runtime semantics.
- Parser complexity could increase during the transition from AST-emitting to CST-emitting.
- Memory use increases: CST nodes are larger than AST nodes due to trivia. Mitigated by eager lowering — CST only lives during formatting.
- Performance: CST construction must not accidentally enter the evaluation hot path. Mitigated by keeping `parse()` as the default (CST built only via `parseToCst()`).
- Old and new formatter paths may temporarily duplicate logic during migration.
- Trivia attachment ambiguity: lossless guarantees no information is lost, but the formatter still needs rules to interpret what trivia means spatially.

## Design Decisions (Phase 2)

Decided through structured interview on 2026-04-08.

### Q1: Typed or untyped intermediate tree? → Untyped first, then convert (B)

The event stream produces an untyped tree (`{ kind: string, children: (CstToken | UntypedNode)[] }`). A separate conversion module interprets children positionally per node kind to produce the typed `CstNode` interfaces from `types.ts`. This keeps parser instrumentation minimal (just `startNode(kind)` / `endNode()`, no field name annotations) and concentrates schema knowledge in one place.

### Q2: How to synchronize full and minified token streams? → Full stream directly (A)

In CST mode, `ParserContext` operates on the full token stream. `peek()` skips trivia internally. `advance()` collects trivia and produces a `CstToken`. The minified stream is not created. This makes the parser the single owner of token consumption — no parallel arrays to keep in sync. The trivia splitting logic (same-line trails previous, next-line leads next) moves into the advance method.

### Q3: How to handle parser backtracking? → Eliminate it

The parser's `storePosition()` / `restorePosition()` is used only for lambda detection in two places in `parseOperand.ts`. Both can be replaced with simple lookahead scans:
- Parenthesized: see `(` → scan forward counting paren depth until `)` → check if next token is `->`.
- Symbol: see symbol → check if next token is `->`.

This eliminates backtracking entirely, removing the need for event rollback in the CST builder.

### Q4: Should `parse()` ever use CST mode internally? → Decide later (C)

Start with separate paths: `parse()` stays unchanged, `parseToCst()` is opt-in. Measure CST overhead later and switch to a single CST→lower path only if negligible.

### Open question for next session

None — all Phase 2 design questions are resolved. Ready to implement.

## Design Decisions (Phase 3)

Decided through structured interview on 2026-04-08.

### Q5: Should `parseToCst()` support error recovery? → Type-level support now, implement later (C)

Add a minimal `CstErrorNode` to the type hierarchy so the tree shape is stable from day one. `parseToCst()` throws on error for now — no partial trees, no recovery logic. All tree walkers (formatter, `printCst()`, future LSP visitors) handle the `CstErrorNode` case from the start. When error recovery is implemented later, consumers already compile.

The error node is intentionally minimal — just a bag of tokens the parser couldn't structure:
```ts
interface CstErrorNode {
  kind: 'Error'
  tokens: CstToken[]
  span: SourceSpan
}
```

No attempt to capture "what the parser was trying to parse" or partial children — that's recovery-time knowledge. The formatter prints error nodes verbatim.

Why not fail-fast only: the project has a language server, making error recovery a real future need. Designing the type now avoids a breaking tree-shape change later.

### Q6: Incremental instrumentation strategy → Top-down incremental (B)

Instrument the parser top-down: `CstProgram` → top-level expressions → nested sub-structures (branches, bindings, entries, arguments). Each layer adds events for a batch of node kinds with losslessness tests. Multiple smaller commits.

Why top-down: the event-based approach is inherently layered — outer nodes wrap inner nodes. Each step is testable independently. Mismatched `startNode`/`endNode` bugs are caught early in small scope rather than debugged across 43+ node types at once.

### Q7: CST formatter output model → Document algebra (C)

The CST formatter uses a Wadler-Lindig document algebra: CST → Doc → string. The `Doc` type is a small algebraic data type (~30 lines: Text, Line, Group, Nest, Concat, HardLine, IfBreak, LineComment). A renderer (~60-80 lines) takes a target line width and produces the formatted string.

Why document algebra over direct string building: the CST formatter is new code, and comments are now part of the tree participating in formatting decisions. With direct string building, every construct needs manual `fits()` checks that account for trivia width. The document algebra handles this naturally — comments are `Text` nodes in the doc tree, and the renderer accounts for their width when deciding breaks. The per-node-kind formatting functions are comparable effort either way; the algebra just replaces manual measurement with declarative structure.

The original plan considered and rejected this as "overkill at current scale." The reassessment is that the CST formatter changes the problem: comments-in-the-tree makes line-breaking significantly more complex, and the algebra's ~100 lines of infrastructure pays for itself quickly.

### Q8: Normalization scope → Normalize everything, preserve comments (A)

The formatter normalizes all structural whitespace to canonical form: indentation, line breaks, trailing whitespace, semicolons. Comments are the only authored content that survives, preserved at their logical position (leading/trailing/inline relative to the node they're attached to).

This matches the current formatter's behavior and keeps the rule simple: the formatter owns all whitespace. The document algebra makes this clean — build the canonical Doc tree, insert comment docs at attachment points, the renderer produces deterministic output.

### Q9: Comment handling in the Doc algebra → Inline with structure, LineComment forces hard break (A+C)

Block comments (`/* */`) become plain `Text` nodes in the Doc tree — they're inline content and participate in width calculations naturally. Line comments (`// foo`) get a `LineComment` variant (or `Concat(Text("// foo"), HardLine)`) so the renderer knows a hard break must follow — without this, the fitting logic might try to place content after a line comment on the same line.

No separate comment pass (B rejected) — comments are already precisely located on CST tokens, so there's no reason to detach and reattach them.

### Q10: IfBreak combinator → Include IfBreak, add GroupRef later if needed (B)

The Doc algebra includes `IfBreak(flat, broken)` — a node that renders its `flat` child when the enclosing group fits on one line, `broken` child when it breaks. This enables trailing commas in multi-line collections, conditional separators, and different delimiter styles.

`GroupRef` (allowing `IfBreak` to reference a specific group's break state rather than just the nearest enclosing one) is omitted for now. It's a forward-compatible extension that can be added if an edge case requires cross-group break coordination.

### Q11: Blank lines between top-level expressions → Preserve authored, cap at max (A)

Blank lines are the one whitespace signal where authorial intent matters for readability — they indicate visual grouping of related definitions. The formatter preserves authored blank lines (up to `MAX_BLANK_LINES`) but doesn't add them.

Implementation: when emitting top-level separators in the Doc tree, check the CST trivia between expressions. If it contains a blank line, emit `HardLine, HardLine`; otherwise just `HardLine`.

### Q12: Reuse prettyPrint.ts → Fully independent (A)

The CST formatter is a fully independent module. `prettyPrint.ts` stays untouched as the runtime AST-to-code tool for REPL output, playground display, and the `ast` module's `prettyPrint` function. These contexts have no source text and no CST.

No shared logic, no shared abstractions. The formatting policy (80-col target, indent size, when to break) is a handful of constants replicated in the new formatter. The logic is fundamentally different because the Doc algebra handles the hard parts.

### Q13: File organization → `src/formatter/`, replace wholesale (C)

The CST formatter lives in `src/formatter/`: `doc.ts` for the algebra, `cstFormat.ts` for the formatter. `format.ts` remains the public entry point.

`format.ts` does not need to be a "stable entry point" or support gradual switching between old and new paths. When the CST formatter is ready, the implementation is replaced wholesale — the old AST+reinsertion path is removed entirely.

`src/cst/` stays focused on types, trivia attachment, and tree construction — not formatting policy.

## Implementation Plan

### Phase 1 — CST types and token-level infrastructure ✅

1. ✅ Define `CstToken` type (`{ leadingTrivia, text, trailingTrivia }`) and `TriviaNode` types.
2. ✅ Define typed `CstNode` interfaces for all Dvala syntax forms with named fields and source spans.
3. ✅ Implement trivia attachment algorithm (split convention: same-line trails previous, next-line leads next).
4. ✅ Implement `printCst()` tree printer for losslessness verification.
5. ✅ Verify token-level losslessness: `printTokens(attachTrivia(tokenize(source))) === source` (70 tests).

### Phase 2 — Event-based parser instrumentation

6. **Refactor: replace lambda backtracking with lookahead** in `parseOperand.ts`. Remove `storePosition()` / `restorePosition()` from `ParserContext` if no other callers remain. Run tests to verify no regressions.
7. Add `CstErrorNode` to the CST type hierarchy (minimal: `{ kind: 'Error', tokens: CstToken[], span: SourceSpan }`). Update all existing tree walkers to handle it.
8. Define `CstEvent` types: `StartNode(kind)`, `Token(cstToken)`, `EndNode()`. Define `UntypedCstNode` (`{ kind, children }`).
9. Implement `CstBuilder` that accumulates events and produces an `UntypedCstNode` tree.
10. Implement untyped→typed conversion module that maps `UntypedCstNode` children positionally to typed `CstNode` fields per node kind.
11. Modify `ParserContext` to support CST mode: work on full token stream, `peek()` skips trivia, `advance()` collects trivia and feeds `CstToken` to builder.
12. Instrument sub-parsers top-down with `builder.startNode(kind)` / `builder.endNode()` calls. Start with `CstProgram` → top-level expressions → nested sub-structures (branches, bindings, entries, arguments). Each layer verified with losslessness tests before proceeding. Existing AST construction stays untouched.
13. Implement `parseToCst()` public API: tokenize fully → create CST-mode context → parse → build untyped tree → convert to typed `CstProgram`. Fail-fast on parse error (no error recovery yet).
14. Verify tree-level losslessness: `printCst(parseToCst(source)) === source` for a broad corpus.

### Phase 3 — CST-based formatter (Doc algebra)

15. Implement the Doc algebra in `src/formatter/doc.ts`: `Text`, `Line`, `Group`, `Nest`, `Concat`, `HardLine`, `IfBreak(flat, broken)`, `LineComment`. Implement the Wadler-Lindig "best fit" renderer.
16. Build the CST formatter in `src/formatter/cstFormat.ts`: walk CstNode tree, produce Doc tree. Block comments (`/* */`) as `Text` nodes; line comments (`// foo`) as `LineComment` (forces hard break). Preserve authored blank lines between top-level expressions (up to `MAX_BLANK_LINES`).
17. Normalize all structural whitespace to canonical form. Comments are the only authored content preserved at their logical attachment positions.
18. Add broad regression coverage for comments, authored forms, arrays, objects, infix layouts, pipes, nested expressions, and file-level comments.
19. Verify idempotency: `format(format(source)) === format(source)`.

### Phase 4 — Cleanup

20. Replace `format.ts` implementation wholesale: `parseToCst()` → `formatCst()`. Remove the old AST+reinsertion path entirely.
21. Remove the old comment extraction, anchoring, and reinsertion code (`extractComments.ts`, `reinsertComments.ts`, comment hint plumbing).
22. Remove the `prettyPrint` comment hint system (`withPrettyPrintCommentHints`, `withPrettyPrintBlankLineHints`) — only used by the old formatter path.
23. Validate that `prettyPrint.ts` still works for runtime AST display (unchanged, no dependency on removed code).
24. Run full `npm run check`.

### Future — Grammar schema (optional)

If the number of syntax forms grows significantly (type annotations, effect declarations, etc.), consider adopting a lightweight grammar DSL (similar to rust-analyzer's ungrammar) that generates the CstNode type definitions and builder API from a grammar specification. The event-based parser instrumentation would remain — only the types and builder would be derived from the grammar.
