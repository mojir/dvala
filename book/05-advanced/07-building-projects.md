# Building Projects

When a program grows beyond a single file you need a way to split it into modules, manage dependencies, and produce a deployable artifact. Dvala handles this with **projects** — a directory with a `dvala.json` configuration file — and the `dvala build` command, which bundles everything into a single portable JSON file.

## Projects and dvala.json

A project is any directory that contains a `dvala.json` file. The configuration is minimal:

```json
{
  "entry": "main.dvala",
  "tests": "**/*.test.dvala",
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
| `entry` | `"main.dvala"` | Entry file for `dvala build` |
| `tests` | `"**/*.test.dvala"` | Glob pattern for `dvala test` |
| `build.expandMacros` | `true` | Expand macros at build time |
| `build.treeShake` | `true` | Remove unused bindings |
| `build.sourceMap` | `true` | Include source maps in the bundle |

`dvala build` walks up from the current directory until it finds `dvala.json`, so you can run the command from anywhere inside the project.

## File Imports

Within a project, files import each other using relative paths:

```dvala no-run
let math = import("./lib/math.dvala");
math.add(2, 3)
```

Any path starting with `./`, `../`, or `/` is treated as a file import. Bare names like `import("math")` refer to built-in modules and are resolved at runtime, not by the bundler.

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
let math = import("./lib/math.dvala");

math.add(10, math.mul(3, 4))
```

Circular dependencies are detected and reported as errors at build time. Diamond imports — where two files both import a third — are handled correctly: the shared dependency is included only once.

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

`dvala run` accepts both source files and bundles. It detects which is which from the file extension:

```sh
$ dvala run dist/app.json
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

## Build Options

CLI flags override the corresponding `dvala.json` settings:

| Flag | Effect |
|------|--------|
| `--no-sourcemap` | Omit source maps — reduces bundle size |
| `--no-tree-shake` | Keep all bindings, even unused ones |
| `--no-expand-macros` | Skip build-time macro expansion |

Stripping source maps is useful for production deployments where file size matters. Keeping them in development gives you accurate error locations pointing back to the original `.dvala` files.

## Summary

- A project is a directory with `dvala.json` specifying the entry file and build options.
- File imports use relative paths (`./`, `../`, `/`); built-in module names are untouched by the bundler.
- `dvala build` resolves all file imports, deduplicates shared dependencies, and produces a self-contained JSON bundle.
- `dvala run dist/app.json` runs a bundle directly, skipping the parse step for faster startup.
- Bundles can be loaded from TypeScript via `deserializeBundle()` and passed to `dvala.run()`.
