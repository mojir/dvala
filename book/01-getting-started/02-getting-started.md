# Getting Started

## Installation

Install Dvala from npm:

```sh
npm install @mojir/dvala
```

## Using Dvala as a Library

There are two main entry points: **minimal** and **full**.

### Minimal Bundle

The minimal bundle gives you the `createDvala` factory, types, and type guards. No modules or reference data are included — this keeps your bundle size small.

```javascript
import { createDvala } from '@mojir/dvala'

const dvala = createDvala()
dvala.run('10 + 20') // => 30
```

This is the right choice when you want the core language and don't need optional modules like vector math or matrix operations.

### Full Bundle

The full bundle includes everything from the minimal bundle plus all built-in modules, reference data, and API helpers.

```javascript
import { createDvala, allBuiltinModules } from '@mojir/dvala/full'

const dvala = createDvala({ modules: allBuiltinModules })
dvala.run('let la = import("linearAlgebra"); la.dot([1, 2, 3], [4, 5, 6])') // => 32
```

### Individual Modules

You can also import only the modules you need and pass them to the `Dvala` constructor. This gives you fine-grained control over bundle size:

```javascript
import { createDvala } from '@mojir/dvala'
import { vectorModule } from '@mojir/dvala/modules/vector'
import { matrixModule } from '@mojir/dvala/modules/matrix'

const dvala = createDvala({ modules: [vectorModule, matrixModule] })
```

Available modules: `assertion`, `bitwise`, `collection`, `convert`, `functional`, `grid`, `linear-algebra`, `math`, `matrix`, `number-theory`, `sequence`, `string`, and `vector`.

> **TypeScript users:** full TypeScript types are included — `RunResult`, `Snapshot`, `DvalaError`, and all effect handler types are exported from `@mojir/dvala`. No `@types/` package needed.

### Passing Values

You can expose JavaScript values to Dvala code via `bindings`. Bindings must be serializable — plain objects, arrays, strings, numbers, booleans, or `null`. JavaScript functions are not allowed; use the [effects system](tutorial-effects) to call host-side logic from Dvala.

```javascript
import { createDvala } from '@mojir/dvala'

const dvala = createDvala()

// Expose JavaScript values
dvala.run('name ++ " is " ++ str(age)', {
  bindings: { name: 'Alice', age: 30 }
}) // => "Alice is 30"

dvala.run('x * x', {
  bindings: { x: 7 }
}) // => 49
```

## CLI Tool

Install the Dvala CLI globally to use it from the command line:

```sh
npm install --global @mojir/dvala
```

### Initialize a Project

Create a new project with `dvala init`:

```sh
$ dvala init
```

This walks you through creating a `dvala.json`, an entry file, tests, and REPL configuration. See the [Building Projects](tutorial-building-projects) chapter for details.

### Interactive REPL

Start an interactive session by running `dvala` with no arguments:

```sh
$ dvala
```

Inside the REPL, type `:help` to see available commands. In a project directory with a `repl` field in `dvala.json`, the REPL automatically loads that file and makes its bindings available.

### Run Code

`dvala run` handles inline code, files, and project entries:

```sh
$ dvala run "5 + 3"
8

$ dvala run "[1, 2, 3, 4] filter isOdd map inc"
[2, 4]

$ dvala run -f script.dvala

$ dvala run                  # runs the entry file from dvala.json
```

### Other Commands

| Command | Description |
|---|---|
| `dvala run [code]` | Run inline code, a file (`-f`), or the project entry |
| `dvala build [dir]` | Bundle a project into a single JSON file (reads `dvala.json`) |
| `dvala test [file]` | Run tests (single file or project-wide via `dvala.json`) |
| `dvala init` | Initialize a new project |
| `dvala repl` | Start the interactive REPL (default) |
| `dvala doc <name>` | Show documentation for any built-in function or expression |
| `dvala list [module]` | List all available built-in functions |
| `dvala tokenize [code]` | Tokenize code, a file (`-f`), or the project entry |
| `dvala parse [code]` | Parse code, a file (`-f`), or the project entry |

`dvala doc` and `dvala list` are the fastest way to explore the standard library without leaving the terminal:

```sh
$ dvala doc filter
$ dvala list
$ dvala list math
```

## Try It Here

You don't need to install anything to start learning. This playground runs Dvala directly in your browser. Try it:

```dvala
let greet = (name) -> str("Hello, ", name, "!");
greet("World");
```
