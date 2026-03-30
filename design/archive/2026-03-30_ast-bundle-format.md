# AST-Based Bundle Format

**Status:** Completed
**Created:** 2026-03-30

## Goal

Replace the current bundle format (source code strings parsed at runtime) with a single pre-parsed AST. Bundles become compiled artifacts — no tokenization or parsing at load time. The format serves as the universal intermediate representation for a composable AST pipeline (bundle → treeshake → optimize → deduplicate → emit).

---

## Background

The current `DvalaBundle` stores Dvala source code as strings:

```typescript
interface DvalaBundle {
  program: string                    // main program source
  fileModules: [string, string][]   // [canonicalName, source][]
}
```

At runtime, `dvala.run(bundle)` parses each source string via `buildAst()` (tokenize → parse) before evaluating. Problems:

- **Parsing happens at runtime** — wasted work for pre-built artifacts
- **Source code is shipped** — larger bundles, exposes implementation details
- **No deterministic node IDs** across environments — node IDs depend on parse order
- **Source maps are generated on-the-fly** — debug info is ephemeral
- **Separate `fileModules`** — every pipeline pass must be "bundle-aware", complicating treeshaking, deduplication, and optimization

### Existing `Ast` type

The parser already produces an `Ast` type that contains everything needed:

```typescript
interface Ast {
  body: AstNode[]
  sourceMap?: SourceMap  // present in debug mode
}

interface SourceMap {
  sources: { path: string; content: string }[]  // original source text
  positions: (SourceMapPosition | undefined)[]   // indexed by node ID
}
```

## Proposal

### Single-AST bundle

The bundler flattens all file modules into a single AST. Module boundaries become `let` bindings. File imports are rewritten to variable references.

```typescript
interface DvalaBundle {
  /** Format version for forwards compatibility */
  version: 1
  /** Single self-contained AST — all modules inlined */
  ast: Ast
}
```

No `fileModules` — everything is in `ast.body`. The pipeline is `Ast → Ast` at every step.

### How modules are inlined

Given this project:

```dvala
// lib/math.dvala
let clamp = (value, lo, hi) -> min(max(value, lo), hi);
{ clamp: clamp }

// main.dvala
let { clamp } = import("./lib/math.dvala");
clamp(5, 0, 10)
```

The bundler produces a single AST equivalent to:

```dvala
let __module_lib_math = do
  let clamp = (value, lo, hi) -> min(max(value, lo), hi);
  { clamp: clamp }
end;
let { clamp } = __module_lib_math;
clamp(5, 0, 10)
```

Each file module becomes a `let` binding whose value is a `do...end` block containing the module's body. The `import()` call is replaced with a reference to that binding. Modules are inlined in dependency order (topologically sorted), so a module's dependencies are always defined before it.

Diamond dependencies (A imports B and C, both import D) produce D's binding once — deduplication at the module level is handled by the bundler.

### AST pipeline vision

The single-AST format enables a composable pipeline where each step is `Ast → Ast`:

```
parse → bundle → treeshake → optimize → deduplicate → lint → emit
```

Each pass operates on the same flat structure:
- **Treeshake**: walk the AST, find unused `let` bindings, remove them
- **Optimize**: constant folding, inlining, etc.
- **Deduplicate**: find identical subtrees, replace with shared references
- **Lint**: analyze the AST for patterns, report warnings

No pass needs to understand module boundaries — they're just `let` bindings.

Future: these passes become Dvala macros (AST in → AST out), and the pipeline is expressible as Dvala code:

```dvala
(entryAst) |> bundle({ target: "kmp" }) |> treeShake |> minify
```

### Source maps

Source maps are optional. The bundler controls this via a flag:

- `dvala bundle main.dvala` — includes source maps (default, debug-friendly)
- `dvala bundle main.dvala --no-sourcemap` — strips source maps (smaller, no source exposure)

When included:
- Error messages show original file paths and line numbers
- The original source text is embedded in `sourceMap.sources[].content` for code snippets in error output
- Each inlined module's nodes retain their original source positions

When stripped:
- Errors show node IDs but no file/line context
- Bundle is smaller and doesn't expose source code

The source map merges entries from all files — each file gets an entry in `sources[]`, and node positions reference the correct source index.

### Import rewriting

The bundler operates on AST, not strings:

1. Parse each file to AST
2. Walk the AST, find `Import` nodes whose module name matches a resolved file
3. Replace the `Import` node with a `Sym` (variable reference) to the inlined module binding
4. No regex, no string manipulation

Bare module imports like `import("math")` are left untouched — they're resolved at runtime by the module system as today.

### Versioning

The `version` field enables future format changes without breaking existing bundles. The runtime checks the version and rejects unsupported formats with a clear error.

### Migration

The old format (`{ program: string, fileModules: [...] }`) can be detected by checking for the `version` field. During a transition period, `dvala.run()` can support both formats. Eventually the old format is dropped.

## Open Questions

- Should the bundle include metadata (creation timestamp, dvala version, entry file path)?
- How large are single-AST bundles compared to source bundles? Need to measure.
- Should inlined module bindings use hygienic names (gensym) or deterministic names (`__module_<canonical>`)?
- Should `dvala.run(bundle)` evaluate in pure mode (current behavior for file modules) or inherit the caller's purity setting?

## Implementation Plan

1. **Update bundle interface** — new `{ version, ast }` format, keep old format detection for backwards compat
2. **Rewrite bundler** — parse to AST, inline modules as `let` bindings, rewrite `Import` nodes to `Sym` references, merge source maps
3. **Update runtime** — `dvala.run(bundle)` evaluates the single AST directly (no `buildAst()`, no file module registration)
4. **Update CLI** — `dvala bundle` outputs new format with `--no-sourcemap` flag, `dvala run-bundle` loads it
5. **Update tests** — bundler tests, createDvala bundle tests, e2e
6. **Measure** — compare bundle sizes on the example project
7. **Remove old format support**
