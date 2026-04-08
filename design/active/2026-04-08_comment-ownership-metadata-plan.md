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

**The formatter operates directly on CST nodes.** No intermediate formatting IR. The current `prettyPrint.ts` approach of recursive printing with `fits()` checks works well for Dvala. A document algebra (Wadler-Lindig) would be overkill at current scale — and can be added later as a mechanical refactor if needed, since it only changes the return type of the tree walk.

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
- Leading comments on top-level statements.
- Trailing comments on top-level statements.
- Leading comments on nested statements.
- Trailing comments on nested statements.
- Leading comments on expression nodes.
- Trailing comments on expression nodes.
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

## Implementation Plan

### Phase 1 — CST types and token-level infrastructure ✅

1. ✅ Define `CstToken` type (`{ leadingTrivia, text, trailingTrivia }`) and `TriviaNode` types.
2. ✅ Define typed `CstNode` interfaces for all Dvala syntax forms with named fields and source spans.
3. ✅ Implement trivia attachment algorithm (split convention: same-line trails previous, next-line leads next).
4. ✅ Implement `printCst()` tree printer for losslessness verification.
5. ✅ Verify token-level losslessness: `printTokens(attachTrivia(tokenize(source))) === source` (70 tests).

### Phase 2 — Event-based parser instrumentation

6. **Refactor: replace lambda backtracking with lookahead** in `parseOperand.ts`. Remove `storePosition()` / `restorePosition()` from `ParserContext` if no other callers remain. Run tests to verify no regressions.
7. Define `CstEvent` types: `StartNode(kind)`, `Token(cstToken)`, `EndNode()`. Define `UntypedCstNode` (`{ kind, children }`).
8. Implement `CstBuilder` that accumulates events and produces an `UntypedCstNode` tree.
9. Implement untyped→typed conversion module that maps `UntypedCstNode` children positionally to typed `CstNode` fields per node kind.
10. Modify `ParserContext` to support CST mode: work on full token stream, `peek()` skips trivia, `advance()` collects trivia and feeds `CstToken` to builder.
11. Instrument each sub-parser with `builder.startNode(kind)` / `builder.endNode()` calls. Existing AST construction stays untouched.
12. Implement `parseToCst()` public API: tokenize fully → create CST-mode context → parse → build untyped tree → convert to typed `CstProgram`.
13. Verify tree-level losslessness: `printCst(parseToCst(source)) === source` for a broad corpus.

### Phase 3 — CST-based formatter

14. Build the new CST formatter that walks CST nodes directly, applying formatting rules and normalizing trivia placement.
15. Port formatting behavior from `prettyPrint.ts` and the current reinsertion system to the new CST formatter.
16. Add broad regression coverage for comments, authored forms, arrays, objects, infix layouts, pipes, nested statements, and file-level comments.
17. Verify idempotency: `format(format(source)) === format(source)`.

### Phase 4 — Cleanup

18. Remove the old comment extraction, anchoring, and reinsertion code (`extractComments.ts`, `reinsertComments.ts`, comment hint plumbing in `format.ts`).
19. Remove the `prettyPrint` comment hint system (`withPrettyPrintCommentHints`, `withPrettyPrintBlankLineHints`) — only used by the old formatter path.
20. Validate that `prettyPrint.ts` still works for runtime AST display.
21. Run full `npm run check`.

### Future — Grammar schema (optional)

If the number of syntax forms grows significantly (type annotations, effect declarations, etc.), consider adopting a lightweight grammar DSL (similar to rust-analyzer's ungrammar) that generates the CstNode type definitions and builder API from a grammar specification. The event-based parser instrumentation would remain — only the types and builder would be derived from the grammar.
