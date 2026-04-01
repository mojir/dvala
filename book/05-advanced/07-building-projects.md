# Building Projects

When a program grows beyond a single file you need a way to split it into modules, manage dependencies, and produce a deployable artifact. Dvala handles this with **projects** — a directory with a `dvala.json` configuration file — and the `dvala build` command, which bundles everything into a single portable JSON file.

## Creating a Project

The fastest way to start is `dvala init`:

```sh
$ mkdir my-project && cd my-project
$ dvala init
```

This interactive command asks for a project name, whether to create an entry file, tests, and REPL configuration. It generates a `dvala.json` and starter files:

```text
my-project/
├── dvala.json
├── main.dvala
└── tests/
    └── main.test.dvala
```

The generated `main.dvala` exports some functions, and `main.test.dvala` imports and tests them — a working project out of the box. Run `dvala test` to verify, or `dvala run` to execute the entry file.

## Projects and dvala.json

A project is any directory that contains a `dvala.json` file. All CLI commands (`run`, `test`, `build`, `tokenize`, `parse`) look for `dvala.json` in the current directory. The configuration is minimal:

```json
{
  "name": "my-project",
  "entry": "main.dvala",
  "tests": "**/*.test.dvala",
  "repl": "main.dvala",
  "build": {
    "expandMacros": true,
    "treeShake": true,
    "sourceMap": true
  }
}
```

All fields have sensible defaults so an empty `dvala.json` works:

```json
{}
```

| Field | Default | Description |
|-------|---------|-------------|
| `name` | — | Project name (shown in the REPL prompt) |
| `entry` | `"main.dvala"` | Entry file for `dvala run`, `dvala build`, etc. |
| `tests` | `"**/*.test.dvala"` | Glob pattern for `dvala test` |
| `repl` | — | File to pre-load when starting the REPL |
| `build.expandMacros` | `true` | Expand macros at build time |
| `build.treeShake` | `true` | Remove unused bindings |
| `build.sourceMap` | `true` | Include source maps in the bundle |

When you run commands like `dvala run`, `dvala tokenize`, or `dvala parse` with no arguments, they use the `entry` file from `dvala.json`.

## The Interactive REPL

When you start `dvala` (or `dvala repl`) in a project directory with a `repl` field, the REPL automatically loads that file and makes its exported bindings available:

```sh
$ cd my-project
$ dvala
Welcome to Dvala v0.1.2 — my-project
Type :help for more information.

greet = (name) -> `Hello, ${name}!`
add = (a, b) -> a + b

my-project> greet("World")
"Hello, World!"
```

The project name appears in the prompt, and all bindings from the loaded file are ready to use. This is ideal for library projects where you want to explore your API interactively.

Use `:reload` to re-evaluate the REPL file after editing — no need to restart:

```sh
my-project> :reload
Reloaded main.dvala
```

Other REPL commands: `:help`, `:context`, `:builtins`, `:quit`.

> **Tip:** For app-style projects where the entry file runs side effects, either omit the `repl` field (for a clean REPL) or create a separate `repl.dvala` that imports just the parts you want to explore.

## File Imports

Within a project, files import each other using relative paths:

```dvala no-run
let math = import("./lib/math");
math.add(2, 3)
```

Any path starting with `./`, `../`, or `/` is treated as a file import. Bare names like `import("math")` refer to built-in modules. The `.dvala` extension is optional — `import("./lib/math")` and `import("./lib/math.dvala")` are equivalent.

File imports are resolved at runtime — `dvala run`, `dvala repl`, `dvala test`, and even inline code can import files directly:

```sh
$ dvala run 'let m = import("./lib/math"); m.add(2, 3)'
5
```

Imports are cached: if two files both import the same dependency, it's only evaluated once. Circular imports are detected and reported as errors. Nested imports work naturally — if `lib/math.dvala` imports `./helpers`, the path resolves relative to `lib/`.

A typical project might look like this:

```text
my-project/
├── dvala.json
├── main.dvala
└── lib/
    ├── math.dvala
    └── utils.dvala
```

Where `lib/math.dvala` exports its public API by returning an object from its last expression:

```dvala
let add = (a, b) -> a + b;
let mul = (a, b) -> a * b;

{ add, mul }
```

And `main.dvala` imports it:

```dvala no-run
let math = import("./lib/math");

math.add(10, math.mul(3, 4))
```

## The Build Command

Run `dvala build` from inside your project directory:

```sh
$ dvala build
```

This reads `dvala.json`, starts from the entry file, resolves all file imports recursively, and writes a JSON bundle to stdout. To write to a file instead:

```sh
$ dvala build -o dist/app.json
```

You can also point to a specific project directory:

```sh
$ dvala build ./my-project -o dist/app.json
```

## What the Bundle Contains

The output is a self-contained JSON file — a **DvalaBundle** — with this structure:

```json
{
  "version": 1,
  "ast": {
    "body": [ ... ],
    "sourceMap": { ... }
  }
}
```

Internally, each file module is inlined as a `let` binding. Given the example above, the merged AST is logically equivalent to:

```dvala
let __module_lib_math = do
  let add = (a, b) -> a + b;
  let mul = (a, b) -> a * b;
  { add, mul }
end;

let math = __module_lib_math;
math.add(10, math.mul(3, 4))
```

Built-in module imports (`import("math")`, `import("string")`, etc.) pass through unchanged — they are resolved by the runtime, not the bundler.

## Running a Bundle

`dvala run -f` accepts both source files and bundles. It detects which is which from the file extension:

```sh
$ dvala run -f dist/app.json
```

Running a bundle skips the tokenizer and parser entirely — the AST is loaded directly. This makes startup substantially faster, which matters for CLI tools and short-lived scripts.

## Loading a Bundle from TypeScript

Bundles are plain JSON, so loading them from a TypeScript host is straightforward:

```typescript
import { createDvala } from '@mojir/dvala'
import { deserializeBundle } from '@mojir/dvala'
import fs from 'node:fs'

const dvala = createDvala()
const json = JSON.parse(fs.readFileSync('dist/app.json', 'utf-8'))
const bundle = deserializeBundle(json)

if (bundle) {
  const result = dvala.run(bundle)
  console.log(result)
}
```

`deserializeBundle` validates the structure and reconstructs internal types (source maps use `Map`, which JSON does not support natively). It returns `null` if the file is not a valid bundle.

## File Imports from TypeScript

If your Dvala code uses file imports and you're running it from a TypeScript host (not the CLI), pass a `fileResolver` to `createDvala`:

```typescript
import { createDvala } from '@mojir/dvala'
import fs from 'node:fs'
import path from 'node:path'

const projectDir = './my-project'
const dvala = createDvala({
  fileResolver: (importPath, fromDir) => {
    const resolved = path.resolve(fromDir, importPath)
    if (fs.existsSync(resolved)) return fs.readFileSync(resolved, 'utf-8')
    const withExt = resolved + '.dvala'
    if (fs.existsSync(withExt)) return fs.readFileSync(withExt, 'utf-8')
    throw new Error(`File not found: ${importPath}`)
  },
  fileResolverBaseDir: projectDir,
})

dvala.run(fs.readFileSync('./my-project/main.dvala', 'utf-8'))
```

The resolver receives the import path as written (e.g. `"./lib/math"`) and the directory of the importing file. The `.dvala` extension is optional — try the exact path first, then append `.dvala`. Nested imports resolve relative to their own file, not the project root.

This is also how you'd support file imports in non-Node environments — in a browser, the resolver could fetch from a virtual filesystem or server.

## Build Options

CLI flags override the corresponding `dvala.json` settings:

| Flag | Effect |
|------|--------|
| `--no-sourcemap` | Omit source maps — reduces bundle size |
| `--no-tree-shake` | Keep all bindings, even unused ones |
| `--no-expand-macros` | Skip build-time macro expansion |

Stripping source maps is useful for production deployments where file size matters. Keeping them in development gives you accurate error locations pointing back to the original `.dvala` files.

## Summary

- Create a project with `dvala init` — it generates `dvala.json` and starter files.
- A project is a directory with `dvala.json` specifying the entry file, tests, REPL, and build options.
- File imports use relative paths (`./`, `../`, `/`) and are resolved at runtime — they work in `dvala run`, the REPL, and inline code.
- Imports are cached (diamond-safe) and circular imports are detected.
- `dvala build` bundles all file imports into a single JSON file for production deployment.
- `dvala run -f dist/app.json` runs a bundle directly, skipping the parse step for faster startup.
- The REPL integrates with projects via the `repl` field — use `:reload` to refresh bindings after edits.
- Bundles can be loaded from TypeScript via `deserializeBundle()` and passed to `dvala.run()`.
