# Source Map: Decouple Debug Info from AST

## Goal

Separate source position data from the AST into a standalone source map. Every AST node and binding target gets a stable numeric ID. Source positions are stored in a flat, indexed structure outside the tree.

## Current state

```typescript
type AstNode = [NodeType, Payload] | [NodeType, Payload, SourceCodeInfo]

interface SourceCodeInfo {
  position: { line: number, column: number }  // 1-based
  code: string
  filePath?: string
}
```

- Debug info is optional 3rd element on every node and binding target
- `hasDebugData` on the `Ast` object controls whether it's present
- The full source string is repeated on every node
- Positions are 1-based

## New design

### AST node shape

Every node always carries its ID as the 3rd element:

```typescript
type AstNode = [NodeType, Payload, number]  // number = node ID
```

Same for binding targets:

```typescript
type BindingTarget = [BindingTargetType, Payload, number]
```

No conditional shape — always three elements.

### Source map structure

```typescript
interface SourceMap {
  sources: { path: string, content: string }[]
  positions: {
    source: number          // index into sources[]
    start: [number, number] // [line, column], 0-based
    end: [number, number]   // [line, column], 0-based
  }[]                       // indexed by node ID
}
```

Conventions:
- **0-based** lines and columns (aligns with JS source maps, LSP)
- **Character offsets** for columns (not UTF-16 code units)
- `positions[nodeId]` gives the position for any node
- `sources[position.source]` gives the file path and content

### Ast type

```typescript
interface Ast {
  body: AstNode[]
  sourceMap?: SourceMap  // present when debug mode is on
}
```

`hasDebugData` is replaced by the presence/absence of `sourceMap`.

### ID allocation

- A single incrementing counter on `ParserContext`, starting at 0
- Both AST nodes and binding targets draw from the same counter
- Every node gets an ID, regardless of debug mode

### Error reporting

The evaluator resolves source info via the source map:

```typescript
// Before
throw new DvalaError('Division by zero', node[2])  // node[2] was SourceCodeInfo

// After
throw new DvalaError('Division by zero', sourceMap?.positions[node[2]])
```

The `DvalaError` constructor changes to accept a source map position (or undefined) instead of `SourceCodeInfo`.

## Migration plan

### Step 1: Add node IDs

- Add ID counter to `ParserContext`
- Change `AstNode` type to always have 3 elements: `[NodeType, Payload, number]`
- Change `BindingTarget` similarly
- Update `withSourceCodeInfo` helper to assign IDs
- Update all tests that construct AST nodes by hand
- `npm run check`

### Step 2: Build source map in parser

- Add `SourceMap` type
- In debug mode, populate `sourceMap.positions` during parsing
- Change `Ast` type: replace `hasDebugData: boolean` with `sourceMap?: SourceMap`
- **Switch positions from 1-based to 0-based** during this step
- `npm run check`

### Step 3: Migrate evaluator to use source map

- Thread source map through the evaluator (alongside the context stack or as a field on the evaluator state)
- Replace all `node[2]` → `SourceCodeInfo` reads with source map lookups
- Update `DvalaError` to accept the new position type
- Update binding/match slot code similarly
- `npm run check`

### Step 4: Remove SourceCodeInfo from tokens

- Tokens in debug mode currently carry `SourceCodeInfo` as 3rd element
- Change to carry just `[line, column]` (0-based) — the source string is no longer needed per-token
- Update tokenizer and all token consumers
- `npm run check`

### Step 5: Clean up

- Remove old `SourceCodeInfo` interface
- Remove `hasDebugData` field
- Update MCP server wire format
- Update serialization/deserialization
- `npm run check`

## What gets removed

- `SourceCodeInfo` interface (replaced by source map positions)
- `hasDebugData` boolean (replaced by presence of `sourceMap`)
- Repeated source string on every node
- `filePath` on `SourceCodeInfo` (moved to `sources[].path`)

## End position tracking

End positions are new — the current `SourceCodeInfo` only tracks start. The parser will need to record the end position when a node is fully parsed. For simple nodes (numbers, strings, symbols) this is `start + token length`. For compound nodes (expressions, blocks) it's the position after the closing token.
