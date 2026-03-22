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
dvala.run('let v = import(vector); v.dot([1, 2, 3], [4, 5, 6])') // => 32
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

### Interactive REPL

Start an interactive session by running `dvala` with no arguments:

```sh
$ dvala
```

### Evaluate Expressions

```sh
$ dvala eval "5 + 3"
8

$ dvala eval "[1, 2, 3, 4] filter isOdd map inc"
[2, 4]
```

### Run Files

```sh
$ dvala run script.dvala
```

### Other Commands

| Command | Description |
|---|---|
| `dvala eval <expr>` | Evaluate a Dvala expression |
| `dvala run <file>` | Run a `.dvala` source file |
| `dvala bundle <entry>` | Bundle a multi-file project into a single JSON file |
| `dvala run-bundle <file>` | Run a bundled `.json` file |
| `dvala test <file>` | Run a `.test.dvala` test file |
| `dvala repl` | Start the interactive REPL (default) |

## Try It Here

You don't need to install anything to start learning. This playground runs Dvala directly in your browser. Try it:

```dvala
let greet = name -> str("Hello, ", name, "!");
greet("World")
```
