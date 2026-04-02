# Two-Phase Formatter: prettyPrint + Comment Reinsertion

**Status:** Draft
**Created:** 2026-04-02

## Goal

Build a code formatter for Dvala that produces well-structured, consistently formatted code **without losing comments**. Combine the structural formatting strength of the existing `prettyPrint` (AST-based) with a comment reinsertion pass that preserves all comments from the original source.

---

## Background

### What exists today

- **`prettyPrint(node)`** (`src/prettyPrint.ts`, 634 lines) — converts AST nodes to readable Dvala source. Handles all 30+ node types, wraps at 80 columns, makes idiomatic syntax choices (infix operators, dot access, pipe chains). Used by the playground and the `ast` module.
- **Tokenizer** (`src/tokenizer/`) — produces a full token stream including `SingleLineComment`, `MultiLineComment`, and `Whitespace` tokens, each with `TokenDebugInfo` (0-based line and column).
- **Parser** — discards comments via `minifyTokenStream` before parsing. The AST and source map contain no comment information.

### The problem

`prettyPrint` produces excellent structural formatting but **destroys all comments** because they're not in the AST. A pure token-based formatter would preserve comments but can't do structural reformatting (intelligent line breaking, indentation of nested expressions, pipe chain detection, etc.).

### Why two phases

The AST-based approach gives us the hard things for free: understanding expression boundaries, smart wrapping, idiomatic rewrites. The only thing it can't do is preserve comments. Rather than building an entirely different formatter, we add a second pass that reinserts comments into the already-formatted output.

---

## Proposal

### Architecture

```
Source code
  │
  ├──→ Tokenize ──→ Extract comments with anchors
  │
  └──→ Parse ──→ AST ──→ prettyPrint (extended) ──→ Formatted code (no comments)
                                │                           │
                                │ nodeId → output position  │
                                └───────────┐               │
                                            ▼               ▼
                                    Reinsert comments ──→ Final output
```

### Phase 1: prettyPrint with position tracking

Extend `prettyPrint` to record where each AST node lands in the output. Currently `printNode` returns a string — we add a side channel that maps `nodeId → { line, column }` in the output.

The key insight: prettyPrint already receives `[type, payload, nodeId]` tuples. We just need to record the output position when we start printing each node.

```typescript
interface PrintContext {
  /** Current line number in output (0-based) */
  line: number
  /** Current column in output (0-based) */
  column: number
  /** Map from nodeId → output position */
  nodePositions: Map<number, { line: number; column: number }>
}
```

Each `printNode` call records `ctx.nodePositions.set(nodeId, { line: ctx.line, column: ctx.column })` before emitting text. The `line` and `column` are updated as text and newlines are emitted.

**Impact on prettyPrint**: Moderate refactor. Currently functions return strings and concatenate them. We'd need to route all output through a writer that tracks position. This could be done by changing the return type from `string` to writing into a shared buffer, or by post-processing the output string to compute positions from nodeIds.

**Alternative — lighter approach**: Instead of tracking positions during printing, use the source map from the *reformatted* output. After prettyPrint produces a string, re-tokenize it and use token positions. This avoids modifying prettyPrint internals but requires a second tokenization pass (cheap).

### Phase 2: Comment extraction and anchoring

Before formatting, tokenize the original source and extract every comment with an **anchor** — a reference to the nearest AST node:

```typescript
interface AnchoredComment {
  text: string                    // "// this is a comment" or "/* block */"
  kind: 'line' | 'block'
  placement: 'trailing' | 'leading' | 'standalone'
  anchorNodeId: number            // the AST node this comment is attached to
  /** For trailing: offset from end of anchor's line. For leading: lines before anchor. */
  gap: number
}
```

**Anchoring rules:**

1. **Trailing comment** — comment on the same line as code, after code tokens:
   ```
   let x = 42; // the answer
   ```
   Anchor: the preceding statement's nodeId. Placement: `trailing`.

2. **Leading comment** — comment on line(s) immediately before a code statement:
   ```
   // Calculate the sum
   let sum = a + b;
   ```
   Anchor: the following statement's nodeId. Placement: `leading`.

3. **Standalone comment** — comment block separated by blank lines from surrounding code, or at file start/end:
   ```
   let x = 1;

   // Section separator

   let y = 2;
   ```
   Anchor: the next statement's nodeId (or previous if at file end). Placement: `standalone`, preserve blank line gaps.

**How to determine anchors:** Walk the token stream. For each comment token, look at the surrounding non-whitespace tokens. Use the source map to find which AST nodeId those tokens belong to. This requires a mapping from token position → nodeId, which the source map provides (it maps nodeId → position; we invert it).

### Phase 3: Comment reinsertion

After prettyPrint produces the formatted output with nodeId positions:

1. Sort anchored comments by their anchor's output position
2. Insert each comment relative to its anchor:
   - **Trailing**: append ` // comment` to the anchor's output line
   - **Leading**: insert comment line(s) before the anchor's output line, with matching indentation
   - **Standalone**: insert with blank line separator before the anchor

Re-check line width after inserting trailing comments — if the line exceeds 80 columns, convert to a leading comment on the line above.

### Edge cases

| Case | Strategy |
|------|----------|
| **Intra-expression comment** `foo(a, /* note */ b)` | Anchor to nearest surrounding node. May shift position but won't be lost. |
| **Comment inside reformatted block** `do // x \n ... end` → single-line `do ... end` | Detect when anchor line was collapsed. Convert to leading comment. |
| **Multiple comments on same anchor** | Preserve relative order. Multiple leading comments stay as a block. |
| **Comment at file start** (before any code) | Special case: no anchor nodeId. Emit at file start unconditionally. |
| **Comment at file end** (after last statement) | Anchor to last statement, trailing or standalone depending on gap. |
| **Shebang** `#!/usr/bin/env dvala` | Always preserve as first line, unconditionally. |

---

## Implementation Plan

### Step 1: Comment extractor

Create `src/formatter/extractComments.ts`:
- Input: token stream (from `tokenize()` with debug info)
- Output: `AnchoredComment[]`
- Walk tokens, classify each comment as trailing/leading/standalone
- For now, anchor comments to **statement boundaries** (the nearest `let`, top-level expression, etc.) rather than arbitrary nodeIds — this is simpler and handles 95% of cases
- Tests with various comment patterns

### Step 2: Extend prettyPrint with nodeId tracking

Create `src/formatter/prettyPrintTracked.ts`:
- Wraps `prettyPrint` or forks the relevant parts
- Returns `{ output: string; nodePositions: Map<number, { line: number; column: number }> }`
- **Approach A** (minimal change): Run `prettyPrint` as-is, then re-parse the output to build a token→position map. Match original nodeIds to output positions by aligning the token sequences.
- **Approach B** (cleaner): Refactor `prettyPrint` to write into a position-tracking buffer instead of returning strings. More invasive but produces exact nodeId→position mapping.
- Start with Approach A; switch to B if alignment proves unreliable.

### Step 3: Comment reinsertion

Create `src/formatter/reinsertComments.ts`:
- Input: formatted string + nodeId positions + anchored comments
- Output: final formatted string with comments
- Insert comments in reverse order (bottom to top) to avoid position shifts
- Handle trailing→leading conversion when line gets too long
- Tests with round-trip formatting

### Step 4: Formatter entry point

Create `src/formatter/format.ts`:
- `format(source: string): string` — the public API
- Orchestrates: tokenize → extract comments → parse → prettyPrint (tracked) → reinsert → output
- Handles parse failures gracefully (return original source unchanged)
- Export for both CLI (`dvala format`) and VS Code extension

### Step 5: VS Code integration

In `vscode-dvala/src/extension.ts`:
- Register `DocumentFormattingProvider` and `DocumentRangeFormattingProvider`
- Wire to `format()` from Step 4
- Add `"editor.defaultFormatter": "mojir.dvala"` to extension's `package.json` contributes

### Step 6: CLI integration

- Add `dvala format <file>` / `dvala format --stdin` command
- `--check` flag to report unformatted files without modifying them
- `--write` flag to format files in place

---

## Open Questions

- **Statement-level vs nodeId-level anchoring**: Anchoring comments to top-level statements is simpler but won't preserve comments inside expressions perfectly. Is statement-level good enough for v1? We can always refine to nodeId-level later.
- **prettyPrint modification tolerance**: Approach B (position-tracking buffer) requires significant refactoring of prettyPrint. Is it worth the cleaner result, or should we stick with Approach A (re-tokenize output)?
- **Format-on-save**: Should we enable format-on-save by default in the extension, or leave it opt-in? Formatters that lose comments are dangerous with format-on-save — but ours won't.
- **Configurable style**: Should any formatting be configurable (indent size, max width, trailing commas)? Or keep it opinionated like gofmt with zero configuration?
- **Round-trip stability**: `format(format(code))` must equal `format(code)`. How do we test this systematically?
