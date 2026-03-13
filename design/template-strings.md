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

### Option A: Backtick with `${expr}` (chosen)

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

### Option D: `${...}` inside regular `"..."` strings

- No new delimiter or syntax
- **Hard technical limitation**: you can't embed a `"..."` string inside `${...}` because
  the inner `"` closes the outer string. e.g. `"Hello ${"world"}"` is broken.
- Breaking change for any existing string containing `${`
- No visual distinction between plain and interpolated strings

**Decision: Option A (backtick).** Cleanest separation, no conflicts, familiar, no nesting limitation with inner strings.

---

## Alternative 2 — Implementation Architecture

### Approach X: Parse-time desugaring

Transform a template string into a `(str ...)` call during parsing.

```dvala
`Hello ${name}, ${age} years old`
-- desugars to:
str("Hello ", name, ", ", age, " years old")
```

- Zero evaluator changes — reuses existing `str` built-in
- Zero changes to `getUndefinedSymbols` logic
- Error messages refer to the desugared form, not the original template syntax
- `untokenize` cannot faithfully reconstruct the backtick form

### Approach Y: New `TemplateString` AST node (chosen)

Add `NodeTypes.TemplateString` and a new node type:

```typescript
type TemplateStringNode = [
  typeof NodeTypes.TemplateString,
  Array<StringNode | AstNode>,  // alternating literal StringNodes and expression AstNodes
  SourceCodeInfo?,
]
```

- Clean AST representation; error messages can point to the original template
- `untokenize` can faithfully reconstruct the backtick form
- Evaluator needs a new `TemplateStringBuildFrame` — but it is mechanical (~40 lines,
  structurally identical to `ArrayBuildFrame` but concatenates strings)
- `getUndefinedSymbols` needs one new case (~8 lines)
- `typeGuards/astNode.ts` needs `NodeTypes.TemplateString` in `isExpressionNode`
- The `satisfies never` exhaustiveness guard in `getUndefinedSymbols` ensures
  TypeScript catches any missed cases at compile time

**Decision: Approach Y.** The extra code is mechanical and the faithful `untokenize` reconstruction is worth it.

---

## Design: Backtick + TemplateString AST Node

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

The tokenizer must:
- Enter on `` ` ``
- Track brace depth when inside `${...}` so a `}` closing a nested object literal
  doesn't end the interpolation span
- When inside a `${...}` span and a `` ` `` is encountered, recursively scan an
  inner template string (enabling nested templates — see Edge Cases)
- Exit on `` ` `` that is **outside** a `${...}` span
- Return error on unclosed template string

No `` \` `` inside a template string is supported in V1 (escaped backtick). Add in V2.

### 2. New token type (`src/tokenizer/token.ts`)

```typescript
export type TemplateStringToken = [type: 'template-string', value: string, sourceCodeInfo?: SourceCodeInfo]
```

Add `TemplateStringToken` to the `Token` union.

### 3. Parser (`src/parser/subParsers/parseTemplateString.ts`) — new file

Split the raw content string into alternating literal/expression segments:

```
"Hello ${name}, ${age} years!"
  → ["Hello ", name-expr, ", ", age-expr, " years!"]
     literal   AstNode   literal AstNode  literal
```

Algorithm:
1. Scan for `${` with brace-depth counting to find matching `}`
2. Each literal segment → `StringNode` (empty literals are omitted)
3. Each expression segment → re-tokenize with `tokenize()` + re-parse with `parseTokens()`
4. If only one segment (no interpolations) → return a plain `StringNode`
5. Otherwise → return a `TemplateStringNode`:
   `[NodeTypes.TemplateString, [seg1, seg2, ...], sourceCodeInfo]`

### 4. Main parser dispatch

Add a case for `'template-string'` token → call `parseTemplateString(ctx, token)`.

### 5. Evaluator (`src/evaluator/frames.ts` + `src/evaluator/trampoline-evaluator.ts`)

Add `TemplateStringBuildFrame` to `frames.ts`:

```typescript
interface TemplateStringBuildFrame {
  type: 'TemplateStringBuild'
  segments: AstNode[]   // all segments (StringNodes + expression nodes)
  index: number         // next segment to evaluate
  result: string        // accumulated string so far
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}
```

This is structurally identical to `ArrayBuildFrame` — evaluate nodes sequentially,
accumulate into a result, return the final value. ~40 lines total.

Add `stepTemplateString` in `trampoline-evaluator.ts`:
- Creates the frame, kicks off evaluation of `segments[0]`

Add `applyFrame` case for `TemplateStringBuildFrame`:
- Coerce value to string with `String(value)`, append to `result`
- Advance index or return final string value

### 6. `getUndefinedSymbols` (`src/getUndefinedSymbols/index.ts`)

Add one case:

```typescript
case NodeTypes.TemplateString: {
  const unresolvedSymbols = new Set<string>()
  for (const segment of (node as TemplateStringNode)[1]) {
    findUnresolvedSymbolsInNode(segment, contextStack, builtin)
      ?.forEach(symbol => unresolvedSymbols.add(symbol))
  }
  return unresolvedSymbols
}
```

The `satisfies never` exhaustiveness guard will fail to compile until this is added.

### 7. `typeGuards/astNode.ts`

Add `NodeTypes.TemplateString` to `isExpressionNode`:

```typescript
export function isExpressionNode(node: AstNode): node is ExpressionNode {
  return isNormalExpressionNode(node)
    || node[0] === NodeTypes.SpecialExpression
    || node[0] === NodeTypes.Number
    || node[0] === NodeTypes.String
    || node[0] === NodeTypes.TemplateString
}
```

### 8. Tooling (`src/tooling.ts`)

`untokenize` reconstructs the backtick form from a `TemplateStringNode`:

```
[NodeTypes.TemplateString, [StringNode("Hello "), nameNode, StringNode("!")]]
  → `Hello ${name}!`
```

This is the primary reason for choosing Approach Y over X.

### 9. Docs / reference

Add a `TemplateString` entry to the syntax section of the reference, with examples.

---

## Edge Cases and Limitations

| Case | V1 behaviour |
|------|-------------|
| Empty interpolation `` `${}` `` | Parse error (empty expression) |
| Nested template `` `${`inner ${x}`}` `` | Supported — tokenizer recursively scans inner template |
| Escaped backtick `` `a\`b` `` | Not supported in V1 — parse error |
| Multi-line template strings | Supported (backtick allows newlines) |
| Zero literal segments `` `${x}` `` | `TemplateStringNode` with single expression segment |
| Single literal, no interpolation `` `hello` `` | Returns plain `StringNode("hello")` |

---

## File Change Map

| File | Change | Status |
|------|--------|--------|
| `src/tokenizer/tokenizers.ts` | Add `tokenizeTemplateString` with recursive inner-template scanning | ✅ Done |
| `src/tokenizer/token.ts` | Add `TemplateStringToken` to the `Token` union | ✅ Done |
| `src/constants/constants.ts` | Add `NodeTypes.TemplateString = 11` | ✅ Done |
| `src/parser/types.ts` | Add `TemplateStringNode` type; add to `ExpressionNode` union | ✅ Done |
| `src/parser/subParsers/parseTemplateString.ts` | **New file** — split + re-parse logic | ✅ Done |
| `src/parser/subParsers/parseOperand.ts` | Add `'TemplateString'` case | ✅ Done |
| `src/evaluator/frames.ts` | Add `TemplateStringBuildFrame`; add to `Frame` union | ✅ Done |
| `src/evaluator/trampoline-evaluator.ts` | Add `stepTemplateString` + `applyFrame` case | ✅ Done |
| `src/getUndefinedSymbols/index.ts` | Add `NodeTypes.TemplateString` case | ✅ Done |
| `src/typeGuards/astNode.ts` | Add `NodeTypes.TemplateString` to `isExpressionNode` | ✅ Done |
| `playground-builder/src/formatter/rules.ts` | Add `'TemplateString'` case to syntax highlighter | ✅ Done |
| `src/evaluator/frames.test.ts` | Add `TemplateStringBuild` to exhaustiveness test | ✅ Done |
| `__tests__/template-string.test.ts` | **New file** — integration tests (27 tests) | ✅ Done |
| `src/tooling.ts` / `untokenizer` | No changes needed — token stores raw source, `untokenize` works for free | ✅ N/A |

---

## Open Questions

1. **Should `` ` `` support escaped backtick** (`` \` ``)?
   V1: no. V2: add `` \` `` handling in `tokenizeTemplateString`.

2. **Should tagged template strings be considered?**
   e.g. `` html`<b>${x}</b>` `` — not in scope for V1.

3. **`string.template()` overlap**
   The existing `string.template()` function uses `$1`/`$2` positional placeholders and
   supports pluralization. Template strings and `string.template()` are complementary —
   template strings are inline/syntactic; `string.template()` is for l10n/pluralization.
   No deprecation is needed.
