# Effect Name Sigil (`@` prefix)

## Problem

Effect names like `dvala.io.println` are dotted identifiers that only have meaning inside `effect(...)`. The tokenizer can't distinguish them from other dotted symbols (e.g. `string.split`), which makes syntax highlighting require context-scanning hacks. The `effect(...)` wrapper is verbose and adds ceremony without adding clarity.

## Proposal

Introduce `@` as a sigil prefix for effect names. An effect name becomes a first-class literal value — no `effect()` wrapper needed.

### Before
```
perform(effect(dvala.io.println), "hello")
let e = effect(dvala.io.println)
effect?(e)
effect-name(e)
```

### After
```
perform(@dvala.io.println, "hello")
let e = @dvala.io.println
effect?(e)
effect-name(e)
```

## Syntax rules

- An effect name literal starts with `@` followed by a dotted identifier
- At least one dot is required: `@foo` is invalid, `@foo.bar` is valid
- Each segment follows normal symbol rules (alphanumeric, hyphens): `@dvala.io.read-line`
- No whitespace allowed between `@` and the name or around dots
- The `@` prefix is not part of the name string — `@dvala.io.println` produces an effect ref whose name is `"dvala.io.println"`

## Changes required

### Tokenizer (`src/tokenizer/`)
- New token type: `EffectName`
- When the tokenizer sees `@`, it scans ahead for a dotted identifier
- Emits a single `EffectName` token with the full name as value (without `@`)
- Error if no valid dotted identifier follows `@`
- `@` is a reserved character — it cannot appear in symbol names or any other context

### Parser (`src/parser/`)
- Parse `EffectName` token as a literal expression node (new node type `EffectNameLiteral`)
- Evaluates to an `EffectRef` value (same as current `effect(...)` produces)
- Remove `parseEffectArgs` from `parseFunctionCall.ts`
- Remove `effect` from special expressions

### Evaluator (`src/evaluator/`)
- Handle `EffectNameLiteral` node — look up or create the `EffectRef` for the name
- Same caching behavior as current `effect(...)` implementation

### Built-ins (`src/builtin/`)
- Remove `effect` special expression (`src/builtin/specialExpressions/effect.ts`)
- Keep `effect?` predicate (works on values, not syntax)
- Keep `effect-name` function (works on values, not syntax)
- `perform` first argument is now directly an `EffectRef` value (no change needed — it already expects an EffectRef)

### Syntax highlighting (`playground-www/src/SyntaxOverlay.ts`)
- Color `EffectName` tokens by checking the name against:
  - `standardEffectNames` → `--syntax-effect`
  - `playgroundEffectNames` → `--syntax-effect-playground`
  - Everything else → `--syntax-effect-custom`
- Remove the `getEffectColor` context-scanning function entirely
- The `@` prefix itself should be colored the same as the effect name

### Autocomplete
- When typing `@`, trigger autocomplete with all known effect names
- When typing `@dvala.`, filter to `dvala.*` effects

### Reference data / docs
- Update all examples in effect docs, playground effect docs, tutorials
- Update `CLAUDE.md` syntax notes

### Migration
- Search-and-replace `effect(name)` → `@name` across all `.dvala` source files, examples, tests
- The `effect` symbol becomes available as a user-defined name (no longer reserved)

## Considerations

### Why `@`?
- Not used in Dvala syntax today
- Short and visually distinct
- Familiar from other languages (decorators, handles, mentions)
- Doesn't conflict with operators or other sigils

### Alternatives considered
- `#foo.bar` — `#` is commonly used for comments in other languages
- `$foo.bar` — `$` feels like variable interpolation
- `:foo.bar` — `:` is used for other purposes in many languages
- No sigil (just dotted names) — ambiguous with module member access

### Reserved `@` as starting character
Symbols cannot start with `@` — the tokenizer treats `@` at the start of a token as the effect name sigil. However, `@` may appear in the middle or end of a symbol name (e.g. `send@server` is a valid variable name).

### Breaking change
This is a breaking change to the language syntax. All existing Dvala code using `effect(...)` must be migrated. The migration is mechanical (find-and-replace).

## Implementation order

1. Add `EffectName` token type to tokenizer
2. Add `EffectNameLiteral` parser node
3. Add evaluator support for the new node
4. Update syntax highlighting (trivial after tokenizer change)
5. Migrate all examples, tests, and docs
6. Remove `effect` special expression
7. Update autocomplete
