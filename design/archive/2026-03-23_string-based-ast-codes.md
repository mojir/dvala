# String-Based AST Codes — COMPLETED

**Goal:** Replace all numeric codes in the AST with human-readable strings, eliminating lookup tables and making the AST self-describing.

**Status:** All 4 steps completed. 31988 tests passing.

## What changed

### 1. BindingTarget types (12 files)
`src/parser/types.ts` — `symbol: 11` → `symbol: 'symbol'`, etc.

### 2. SpecialExpression types (43 files)
`src/builtin/specialExpressionTypes.ts` — `if: 7` → `if: 'if'`, etc.
`src/builtin/index.ts` — `specialExpressions` changed from array to Record keyed by string type.

### 3. NormalBuiltinSymbol indices (8 files)
`NormalBuiltinSymbolNode` payload changed from `number` (index) to `string` (function name).
`normalExpressionTypes` changed from `Record<string, number>` to `Set<string>`.

Eliminated:
- `allNormalExpressions` array (index-based lookup)
- `normalExpressionNames` / `specialExpressionNames` reverse-lookup arrays
- All index-based dispatch — evaluator now uses `normalExpressions[name]` directly

### 4. NodeTypes (32 files)
`src/constants/constants.ts` — `Number: 1` → `Number: 'Number'`, etc.
`getNodeTypeName()` simplified to identity function.

## AST before/after

Before: `[4, [8, [9, [[11, [[5, "a"], null]], [1, 42]]]]]`
After: `["SpecialExpression", ["let", ["Binding", [["symbol", [["UserDefinedSymbol", "a"], null]], ["Number", 42]]]]]`
