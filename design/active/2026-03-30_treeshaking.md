# AST Tree-Shaking Pass

**Status:** Draft
**Created:** 2026-03-30

## Goal

Remove unused `let` bindings from a bundled AST, reducing bundle size and eliminating dead code. This is the natural follow-up to macro expansion — after macros are expanded, their definitions become dead code.

---

## Background

After bundling and macro expansion, the AST typically contains unused bindings:

1. **Expanded macro definitions** — `let double = macro ...` is dead after all `double(x)` calls are expanded
2. **Unused module exports** — a module exports 10 functions, the program uses 3
3. **Inlined module bindings** — `let __module_lib_macros = do ... end` may become unused after its exports are all expanded

The current pipeline:
```
parse → bundle → expandMacros → [treeshake] → emit
```

The AST is flat (single `body` array with inlined modules). All bindings are `Let` nodes. This makes analysis straightforward.

### Existing infrastructure

Dvala already has `getUndefinedSymbols` in `src/tooling.ts` — it analyzes which symbols are referenced but not defined. Tree-shaking is the inverse: find symbols that are defined but not referenced.

## Proposal

### Algorithm: Mark-and-sweep (graph-based)

Inspired by garbage collection and how production JS bundlers (Rollup, esbuild) work. Single traversal, no fixed-point iteration needed. Cascading removal is handled naturally.

**Step 1: Build dependency graph**

Walk the `body` array. For each `Let` node, record:
- The binding name(s) it defines (simple symbol or destructured names)
- The set of `Sym` names referenced in its value expression

This produces a graph: `bindingName → Set<referencedNames>`.

```
__module_lib_math → {} (no Sym references in the do...end block's value)
clamp → { __module_lib_math }
lerp → { __module_lib_math }
double → {} (macro definition, no external refs)
avg → { average, values }
doubled → { double, avg }  ← but after macro expansion: { avg }
...
```

**Step 2: Find the root**

The root is the last expression in the `body` array (the program's return value). Collect all `Sym` names referenced by the root.

**Step 3: Mark live bindings (transitive closure)**

Starting from the root's references, walk the graph transitively:
1. Add root's references to the "live" set
2. For each newly live binding, add its references to the live set
3. Repeat until no new bindings are added

This is a simple BFS/DFS over the dependency graph.

**Step 4: Sweep**

Remove all `Let` nodes whose binding names are not in the live set, provided their value expressions are side-effect-free.

### Why this is better than fixed-point iteration

- **One graph build + one traversal** vs multiple full AST scans
- **Cascading removal is free** — if `b` depends on `a`, and `b` is not reachable from the root, neither is `a` (unless something else references `a`)
- **Predictable performance** — O(bindings + edges), not O(bindings × iterations)

### Handling blocks

After bundling, module bodies are wrapped in `do...end` blocks:
```dvala
let __module_lib_math = do
  let clamp = ...;
  let lerp = ...;
  { clamp: clamp, lerp: lerp }
end;
let { clamp, lerp } = __module_lib_math;
```

Tree-shaking should:
1. If `__module_lib_math` is unused entirely → remove it
2. If only `clamp` is used from the destructuring → keep the module but this is a future optimization (partial module elimination)

For v1: only remove top-level `Let` bindings that are completely unreferenced. Don't optimize inside blocks.

### Destructuring bindings

Bundled code frequently uses destructuring imports:

```dvala
let { double, withDefault } = __module_lib_macros;
let { clamp, lerp, inRange } = __module_lib_math;
```

After macro expansion, `double` and `withDefault` may be unreferenced (their calls were expanded). The tree-shaker needs to handle three cases:

**Case 1: All destructured names unused**
```dvala
let { double, withDefault } = __module_lib_macros;
// neither double nor withDefault referenced anywhere
```
→ Remove the entire `Let` node. This may then make `__module_lib_macros` unreferenced (fixed-point catches it).

**Case 2: Some destructured names unused**
```dvala
let { clamp, lerp, inRange } = __module_lib_math;
// only clamp is referenced
```
→ For v1: keep the whole binding (conservative). The unused `lerp` and `inRange` are bound but harmless. Partial destructuring elimination is a future optimization.

**Case 3: Simple symbol binding unused**
```dvala
let __module_lib_macros = do ... end;
// __module_lib_macros not referenced
```
→ Remove if the value is side-effect-free.

The reference collector extracts all names from a destructuring target (symbol, array, object, nested) and checks if *any* are in the used set. If none are, the binding is dead.

### Builtin module imports

`import("math")` has no side effects — it returns an object. If the result is unused, the import is dead code:

```dvala
let { sin } = import("math");
// sin never used
```
→ Remove the `Let`. The `import("math")` call disappears with it.

All builtin modules are side-effect-free, so `Import` nodes are always safe to remove when unreferenced.

### Side effects

A binding is only safe to remove if its value expression has no side effects. Pure expressions (literals, functions, macros, arithmetic, object/array construction) are safe. Expressions with `perform`, `import`, or function calls to unknown functions are not.

For v1: assume `Macro` nodes and literal values are safe to remove. For everything else, keep the binding even if unreferenced (conservative).

### Cascading removal

The graph-based approach handles cascading naturally:
```dvala
let a = 1;      // used only by b
let b = a + 1;  // unused from root
```
If `b` is not reachable from the root, it's not marked live. Since `a` is only referenced by `b` and nothing else, `a` is also not reachable. Both are removed in a single sweep — no iteration needed.

### Integration

Add to the pipeline after macro expansion:
```
bundle → expandMacros → treeShake → emit
```

Configured in `dvala.json`:
```json
{
  "build": {
    "expandMacros": true,
    "treeShake": true,
    "sourceMap": true
  }
}
```

CLI override: `--no-tree-shake`

## Open Questions

- Should we tree-shake inside blocks (partial module elimination), or only top-level for v1?
- Should the side-effect analysis be a separate utility (reusable by other passes)?

## Implementation Plan

1. **Implement `buildDependencyGraph(ast)`** — walk body, build `Map<string, Set<string>>` of binding → referenced names
2. **Implement `findLiveBindings(graph, rootRefs)`** — BFS/DFS transitive closure from root references
3. **Implement `isSideEffectFree(node)`** — conservative check for pure value expressions
4. **Implement `treeShake(ast)`** — build graph → find root → mark live → sweep dead `Let` nodes
5. **Wire into pipeline** — add after `expandMacros`, controlled by `build.treeShake` config
6. **Add CLI flag** — `--no-tree-shake`
7. **Tests** — unit tests for graph building, liveness, side-effect detection, sweeping; integration test on example project
8. **Measure** — compare bundle sizes before/after on the example project
