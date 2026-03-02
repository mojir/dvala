# File Modules Design

## Problem

Dvala currently has two separate mechanisms for referencing external code:

1. **`import(moduleName)`** — a language-level special expression that imports registered builtin modules (e.g., `import(vector)`, `import(math)`). These are TypeScript-implemented modules injected via `new Dvala({ modules: [...] })`.

2. **`// @include file.dvala`** — a comment-based directive used only by the test framework. It's invisible to the language, parsed by TypeScript host code, and has no general-purpose use.

This is not clean. The goal is to unify file imports under the existing `import` syntax and introduce a bundler for multi-file projects.

## Solution: Two-Phase Approach

### Phase 1 — Bundler (build time)

A standalone function (not a method on `Dvala`) that:

1. Reads the entry file and scans for `import("./path/to/file.dvala")` calls (string argument = file import).
2. Recursively resolves all file imports, following `import("...")` in each referenced file.
3. Resolves all relative paths to absolute paths, deduplicating files that are referenced from multiple locations.
4. Assigns each unique file a **canonical module name** (a valid Dvala symbol).
5. Detects circular dependencies and throws an error if found.
6. Topologically sorts the file modules by dependency order.
7. Ensures no canonical module name collides with a builtin module name — adjusts the name if needed.
8. Rewrites all `import("./path/to/file.dvala")` calls to `import(canonicalName)` (string argument → bare symbol).
9. Outputs a `DvalaBundle`.

### Phase 2 — Existing `Dvala.run` (runtime)

`Dvala.run` accepts `string | DvalaBundle`. When it receives a bundle:

1. Iterates `fileModules` in order (dependency order).
2. For each `[name, source]`: parses and evaluates the source, registers the result as a **value module** keyed by `name`.
3. Parses and evaluates the main `program`, which can now `import(name)` and find the registered value modules.

No changes to the parser or tokenizer are needed — the bundler rewrites string imports to bare symbol imports before the parser sees them.

## Bundle Format

```typescript
interface DvalaBundle {
  program: string
  fileModules: [string, string][]  // [canonicalName, source][], ordered by dependency
}
```

- `program`: The main program source, with file imports rewritten to bare symbols.
- `fileModules`: An ordered array of `[canonicalName, source]` pairs. Array (not object) because order matters — dependencies must be evaluated before dependents.
- All values are strings (unparsed Dvala source code). Pre-parsing to ASTs is a potential future optimization, not included in the initial implementation.
- The bundle is pure JSON — fully serializable and portable (e.g., build on a server, run in a browser).

## Bundler API

The bundler is a standalone function, separate from the `Dvala` class:

```typescript
// Separate entry point: '@mojir/dvala/bundler'
import { bundle } from '@mojir/dvala/bundler'

const b = bundle('./main.dvala')
```

Import paths can be:
- **Relative**: `import("./lib/utils.dvala")`, `import("../../shared/helpers.dvala")`
- **Absolute**: `import("/opt/dvala-libs/utils.dvala")`

Paths outside the project root are allowed — no restrictions.

```typescript
// Runtime (anywhere, including browser)
import { Dvala } from '@mojir/dvala'
const dvala = new Dvala()
dvala.run(b)
```

**Why standalone, not on the Dvala class:**
- Bundling is a build-time concern; `Dvala` is the runtime.
- Bundling requires file system access; the `Dvala` class doesn't and shouldn't.
- Separate entry point (`@mojir/dvala/bundler`) — browser consumers never pay for it.

## Canonical Module Names

The bundler resolves every `import("...")` to an absolute file path, then derives a canonical module name. Canonical name generation is an internal bundler concern — names only exist inside the bundle and are never referenced by the user directly.

The bundler should prefer readable names:

- **Files under the entry directory**: Path relative to the entry file's directory, with `.dvala` stripped. E.g., `lib/utils` for `./lib/utils.dvala`.
- **Files outside the entry directory**: The bundler derives a readable name from the file path (e.g., using the last N path segments). If there's a collision, the bundler disambiguates (e.g., by adding more path segments or a suffix).

Canonical names are always valid Dvala symbols (no dots — `.dvala` extension is stripped). They are naturally distinct from builtin module names (bare words like `math`, `vector`) because file module names contain path separators (`/`).

### Deduplication

Multiple files may reference the same file via different relative paths. The bundler resolves all paths to absolute, so the same file maps to the same canonical name. Each file appears exactly once in the bundle.

### Circular Dependencies

Circular imports are not supported. The bundler detects cycles during dependency resolution and throws an error listing the cycle.

### Name Collisions with Builtin Modules

If a canonical module name would collide with a builtin module name (e.g., `./math.dvala` at the project root would naturally get the name `math`), the bundler adjusts the canonical name to avoid the collision (e.g., `_math` or `file/math`). The user never needs to worry about this — canonical names are an internal bundler detail. In practice, collisions are rare because file module names under subdirectories contain `/` (e.g., `lib/math`), which naturally distinguishes them from bare builtin names.

## Value Modules

Currently, `import(moduleName)` only works with **builtin modules** (`DvalaModule`), which contain `BuiltinNormalExpression` objects with TypeScript `evaluate` functions. File modules are different — they evaluate to a plain Dvala value.

The `import` evaluator handles two kinds of modules:

- **Builtin modules** (`DvalaModule`): Existing behavior. Wraps functions as `ModuleFunction` descriptors.
- **Value modules** (new): The result of evaluating a file module source. `import(name)` returns the stored value directly — no wrapping.

A file module can evaluate to **any Dvala value**: object, array, number, string, null, function, etc.

```dvala
// math-helpers.dvala → evaluates to an object
let add = (a, b) -> a + b;
{add: add}

// constants.dvala → evaluates to a number
42

// names.dvala → evaluates to an array
["alice", "bob"]
```

```dvala
let { add } = import(math-helpers);   // object → destructure
let answer = import(constants);        // number → use directly
let names = import(names);             // array → use directly
```

The `ContextStack` needs a second map (or a unified map with a discriminated union) to hold value modules alongside builtin modules.

## Changes to `Dvala.run`

`Dvala.run` signature becomes:

```typescript
run(programOrBundle: string | DvalaBundle, params?: ContextParams & FilePathParams): unknown
```

- `string`: Today's behavior — tokenize, parse, evaluate.
- `DvalaBundle`: Evaluate file modules in order, register as value modules, then parse and evaluate the main program.

## Removing `evaluate` from the Public API

`Dvala.evaluate(ast, params)` can be removed from the public API. With `Dvala.run` accepting bundles, there's no external need for `evaluate`. It becomes a private implementation detail.

Current external usage is minimal:
- 2 calls in a performance test file (can use `run`)
- 1 documentation example in README.md (update)

## Replacing `@include`

The `// @include file.dvala` comment directive in the test framework is replaced by standard `import("./file.dvala")` syntax. The test framework would use the bundler to resolve imports before running tests, or construct a `DvalaBundle` directly.

## Future Considerations (Not in Initial Implementation)

- **Bundler options**: `bundle(entry, options?)` — an optional second argument for configuration such as `noAccessOutsideProject`, `parse` (output ASTs instead of source strings), `optimize` (AST optimization when parsing), and parser options (e.g., `debug`). The current zero-config signature extends naturally without breaking changes.
- **Pre-parsed bundles**: A `{ parse: true }` option on the bundler to output ASTs instead of source strings. Would require `DvalaBundle` to become a discriminated union or generic to represent both source and AST bundles. Would enable an eval-only runtime entry point (`@mojir/dvala/eval`) that excludes the tokenizer and parser for smaller browser bundles.
- **Eval-only entry point**: `@mojir/dvala/eval` — a minimal runtime that only accepts pre-parsed ASTs/bundles, excluding tokenizer and parser code.
