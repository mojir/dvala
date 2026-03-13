# Template Strings Design

## Goal

Allow string interpolation in Dvala so expressions can be embedded inline:

```dvala
let name = "world"
`Hello ${name}!`       -- => "Hello world!"
`1 + 1 = ${1 + 1}`    -- => "1 + 1 = 2"
```

---

## Alternative 1 — Syntax Choice

### Option A: Backtick with `${expr}` (recommended)

```dvala
`Hello ${name}!`
`${first} ${last}`
`Result: ${a + b}`
```

- Same as JavaScript/TypeScript — highly familiar
- No conflict with existing `"..."` strings
- Backtick is currently unused in the tokenizer
- Nested braces in expressions work: `` `${{a: 1}}` ``

### Option B: f-string prefix `f"...{expr}..."`

```dvala
f"Hello {name}!"
f"{first} {last}"
```

- Python-inspired
- Reuses `"..."` delimiter; tokenizer detects `f"` prefix
- `{` and `}` inside the literal part must be escaped as `{{`/`}}`
- Slightly unusual for a functional language
- `f` as a prefix character is not currently a keyword or built-in

### Option C: Double-quote with `#{expr}` (Ruby style)

```dvala
"Hello #{name}!"
"#{first} #{last}"
```

- No new delimiter
- **Conflicts** with the existing `#"..."` regexp shorthand token — the tokenizer
  would need disambiguation
- Any existing string containing `#` is unaffected (only `#{` triggers interpolation),
  but the mental model is subtle
- Hard to distinguish at a glance from plain strings

**Recommendation: Option A (backtick).** Cleanest separation, no conflicts, familiar.

---

## Alternative 2 — Implementation Architecture

### Approach X: Parse-time desugaring (recommended)

Transform a template string into a `(str ...)` call during parsing.

```dvala
`Hello ${name}, ${age} years old`
-- desugars to:
str("Hello ", name, ", ", age, " years old")
```

- Zero evaluator changes — reuses existing `str` built-in
- Zero changes to `getUndefinedSymbols` logic (symbols inside `${...}` are just
  normal expression nodes already handled by the recursive walk)
- Slightly higher parser complexity (re-parse expression parts)
- Error messages refer to the desugared form, not the original template syntax

### Approach Y: New `TemplateString` AST node

Add `NodeTypes.TemplateString = 22` and a new node type:

```typescript
type TemplateStringNode = SpecialExpressionNode<[22, Array<StringNode | AstNode>]>
```

- Clean AST representation; error messages can point to template
- Requires evaluator changes (`trampoline-evaluator.ts` case)
- Requires `getUndefinedSymbols` handler
- More code surface area; no real user-visible benefit over desugaring

**Recommendation: Approach X (parse-time desugaring).** Less code, no evaluator risk.

---

## Recommended Design: Backtick + Parse-time Desugaring

### 1. Tokenizer (`src/tokenizer/tokenizers.ts`)

Add a `tokenizeTemplateString` function alongside `tokenizeString`.

The tokenizer captures the raw template content as a single token, **including** the
interpolated `${...}` spans, using brace-depth counting to handle nested braces:

```
` Hello ${obj.key} world ${ {a: 1}.a } ! `
  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  raw content (between backticks), stored verbatim
```

Token type: `['template-string', rawContent]`

The tokenizer only needs to:
- Enter on `` ` ``
- Track brace depth when inside `${...}` so a `}` that closes a nested object
  literal doesn't end the interpolation span
- Exit on `` ` `` that is **outside** a `${...}` span
- Return error on unclosed template string

No `\`` inside a template string is supported in V1 (escaped backtick). Add `\\`` in V2.

### 2. New token type (`src/tokenizer/token.ts`)

```typescript
export type TemplateStringToken = [type: 'template-string', value: string, sourceCodeInfo?: SourceCodeInfo]
```

Add `TemplateStringToken` to the `Token` union.

### 3. Parser (`src/parser/subParsers/parseTemplateString.ts`) — new file

Split the raw content string into alternating literal/expression spans:

```
"Hello ${name}, ${age} years!"
  → ["Hello ", "name", ", ", "age", " years!"]
     literal   expr   literal  expr   literal
```

Algorithm:
1. Scan for `${` with brace-depth counting to find matching `}`
2. Each literal segment → `StringNode`
3. Each expression segment → re-tokenize with `tokenize()` + re-parse with `parseTokens()`
4. If only one segment (no interpolations), return a plain `StringNode`
5. If multiple segments, return a `NormalExpressionNode` calling `str`:
   `[NodeTypes.NormalExpression, 'str', [seg1, seg2, ...], sourceCodeInfo]`

### 4. Main parser dispatch (`src/parser/parseAstNode.ts` or equivalent)

Add a case for `'template-string'` token → call `parseTemplateString(ctx, token)`.

### 5. No evaluator changes needed

The desugared node is an ordinary `str(...)` call — the evaluator handles it already.

### 6. `getUndefinedSymbols`

No new handler needed. The desugared node is a `NormalExpressionNode`; its children
(the segment AST nodes) are already walked by the existing recursive logic.

### 7. Tooling (`src/tooling.ts`)

`getAutoCompleter` / `untokenize` may need minor updates to handle the new token type.
`untokenize` could reconstruct the backtick form or fall back to the `str(...)` form.

### 8. Docs / reference

Add a `TemplateString` entry to the syntax section of the reference, with examples and
a note about the nesting limitation (V1: no `\`` escape inside template strings).

---

## Edge Cases and Limitations

| Case | V1 behaviour |
|------|-------------|
| Empty interpolation `` `${}` `` | Parse error (empty expression) |
| Nested template `` `${`inner`}` `` | Not supported — inner backtick closes the outer |
| Escaped backtick `` `a\`b` `` | Not supported — treat as parse error |
| Multi-line template strings | Supported (backtick allows newlines) |
| `str()` with zero literal segments `` `${x}` `` | Desugar to `str(x)` — works fine |
| Single literal, no interpolation `` `hello` `` | Return plain `StringNode("hello")` |

---

## File Change Map

| File | Change |
|------|--------|
| `src/tokenizer/tokenizers.ts` | Add `tokenizeTemplateString`, export it |
| `src/tokenizer/token.ts` | Add `TemplateStringToken` to the `Token` union |
| `src/tokenizer/index.ts` | Register `tokenizeTemplateString` in the tokenizer chain |
| `src/parser/subParsers/parseTemplateString.ts` | **New file** — split + re-parse logic |
| `src/parser/parseAstNode.ts` (or equivalent dispatch) | Add `'template-string'` case |
| `src/tooling.ts` | Handle `TemplateStringToken` in `untokenize` |
| `__tests__/template-string.test.ts` | **New file** — integration tests |

No changes required in:
- `src/evaluator/` (desugaring means `str(...)` is already handled)
- `src/builtin/` (no new built-in needed)
- `src/constants/constants.ts` (no new `NodeTypes` entry)

---

## Open Questions

1. **Should `` ` `` support escaped backtick** (`\``)?
   V1: no. V2: add `\\`` handling in `tokenizeTemplateString`.

2. **Should tagged template strings be considered?**
   e.g. `` html`<b>${x}</b>` `` — not in scope for V1.

3. **Should `untokenize` reconstruct backtick form or emit `str(...)`?**
   Reconstructing the backtick form is nicer for user-facing output; emitting `str(...)`
   is simpler and sufficient for tooling.

4. **`string.template()` overlap**
   The existing `string.template()` function uses `$1`/`$2` positional placeholders and
   supports pluralization. Template strings and `string.template()` are complementary —
   template strings are inline/syntactic; `string.template()` is for l10n/pluralization.
   No deprecation is needed.
