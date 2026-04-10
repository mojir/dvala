# Declare Declarations — Host-Injected Bindings

**Status:** Draft
**Created:** 2026-04-09

## Goal

Allow Dvala source files to declare bindings that are expected to be injected by the host environment, so that:
1. Static analysis doesn't flag them as undefined symbols
2. The host contract is documented in-source (not just comments)
3. Future type system can validate host bindings against declarations
4. Bundle manifests can collect all `declare` declarations across files

---

## Background

Today, host-injected bindings (e.g. `configExists`, `dirName` in `cli/src/init.dvala`) are passed via the `bindings` option in `runAsync()`. The Dvala source has no way to declare these — they appear as undefined symbols to static analysis, and the contract is documented only in comments.

The host injection flow:
```
Host TS → runAsync(source, { bindings: { configExists, dirName } })
  → createContextStack({ bindings })
  → ContextStack.lookUpByName() checks contexts → hostValues
```

Static analysis (`getUndefinedSymbols`) and the language service (`SymbolTableBuilder`) both flag these as undefined because no declaration exists in the source.

## Proposal

### Syntax

```dvala
declare configExists;
declare dirName;
```

- `declare` is a new keyword parsed at the expression level (like `let`, `import`)
- Allowed in any file, including imported modules
- Each file declares its own host dependencies

### AST Node

New node type `Declare` added to `NodeTypes`:
```typescript
// NodeTypes.Declare
[NodeTypes.Declare, symbolName: string, sourceCodeInfo: SourceCodeInfo]
```

### Semantics

- **Static analysis**: Registers the name in scope — no "undefined symbol" warning
- **Evaluator**: Validates that the binding exists in host bindings; throws `ReferenceError` if not provided
- **Runtime**: No new binding created — declared names resolve through the existing `hostValues` lookup in `ContextStack`

### Duplicate declarations

Same name declared in multiple files is allowed. When the type system arrives, duplicates must agree on type.

### Future: Bundle Manifest

When building a bundle, the compiler collects all `declare` declarations across all files and emits a manifest. This is deferred until the new type system is implemented.

### Future: Type Annotations

```dvala
declare configExists: boolean;
declare dirName: string;
```

Deferred until type system work.

## Open Questions

- Should `declare` declarations be restricted to top-level scope, or allowed inside blocks?
  - Recommendation: top-level only — host bindings are ambient, not block-scoped
- Should using a host binding without a `declare` declaration become a warning/error?
  - Recommendation: warning first, error later — avoid breaking existing code
- Should the evaluator error at the `declare` declaration site if the binding is missing, or defer to first use?
  - Recommendation: error at declaration site (fail fast)

## Implementation Plan

1. **Add `Declare` to `NodeTypes`** (`src/constants/constants.ts`)
2. **Add `declare` as reserved word** in tokenizer
3. **Parse `declare` declarations** (`src/parser/subParsers/parseExpression.ts`) — new `parseDeclare()` sub-parser
4. **Register in static analysis** (`src/getUndefinedSymbols/index.ts`) — mark name as defined in scope
5. **Register in SymbolTableBuilder** (`src/languageService/SymbolTableBuilder.ts`) — mark as external definition
6. **Evaluator handling** (`src/evaluator/trampoline-evaluator.ts`) — validate binding exists, or no-op
7. **Pretty printer** (`src/prettyPrint.ts`) — format `declare name;`
8. **Tests** — parser, evaluator, static analysis, language service
9. **Update `cli/src/init.dvala`** to use `declare` declarations instead of comments
