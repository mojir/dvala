# Modules

Dvala provides domain-specific function libraries as opt-in modules. Import them to access specialized functionality beyond the built-in core functions (`map`, `filter`, `reduce`, `sort`, `keys`, etc. need no import — they're always available).

## Available Modules

| Module | Import name | What it adds |
|---|---|---|
| `math` | `"math"` | Trig, logarithms, angle conversion |
| `sequence` | `"sequence"` | `sortBy`, `distinct`, `groupBy`, `zip`, `partition` |
| `collection` | `"collection"` | Deep access (`getIn`, `assocIn`), advanced aggregation |
| `vector` | `"vector"` | Statistics for number arrays: `mean`, `sum`, `cumsum`, `stddev` |
| `linearAlgebra` | `"linearAlgebra"` | Dot product, distance, normalization, matrix-vector ops |
| `matrix` | `"matrix"` | Matrix multiply, determinant, inverse, transpose |
| `string` | `"string"` | Padding, trimming, splitting with regex, case conversion |
| `numberTheory` | `"numberTheory"` | GCD, LCM, primality, divisors |
| `functional` | `"functional"` | `memoize`, `trampoline`, `once`, advanced composition |
| `convert` | `"convert"` | Type coercion and base conversion |
| `bitwise` | `"bitwise"` | Bitwise AND, OR, XOR, shifts |
| `assertion` | `"assertion"` | Test assertions — see the [Testing](../04-design-principles/06-testing.md) chapter |
| `grid` | `"grid"` | 2D grid creation and traversal |

Use `dvala list` in the CLI to browse available functions, or `dvala doc <name>` for details on any function.

## Importing a Module

Use `import` to load a module. It returns an object whose keys are the module's functions:

```dvala
let m = import("math");
m.sin(PI / 2)
```

## Destructured Import

Combine `import` with destructuring to pull out individual functions:

```dvala
let { sin, cos } = import("math");
sin(PI / 6)
```

## Math Module

Trigonometric, logarithmic, and angle-conversion functions:

```dvala
let { ln, log10 } = import("math");
[ln(E), log10(1000)]
```

## Sequence Module

Extended sequence operations — `sortBy`, `distinct`, `groupBy`, and more:

```dvala
let seq = import("sequence");
seq.distinct([1, 2, 2, 3, 3, 3])
```

```dvala
let seq = import("sequence");
seq.sortBy(["banana", "fig", "apple"], count)
```

## Collection Module

Deep access and advanced aggregation:

```dvala
let col = import("collection");
let data = { user: { name: "Alice" } };
col.getIn(data, ["user", "name"])
```

## Vector Module

Statistical functions for number arrays:

```dvala
let vec = import("vector");
vec.cumsum([1, 2, 3, 4])
```

## Linear Algebra Module

Vector math — dot products, distances, normalization:

```dvala
let lin = import("linearAlgebra");
lin.dot([1, 2, 3], [4, 5, 6])
```

## Matrix Module

Matrix operations — multiplication, determinant, inverse:

```dvala
let mat = import("matrix");
mat.det([[1, 2], [3, 4]])
```

## String Module

Additional string utilities:

```dvala
let s = import("string");
s.padLeft("42", 5, "0")
```

## Number Theory Module

GCD, LCM, primality-related functions:

```dvala
let nt = import("numberTheory");
nt.gcd(24, 36)
```
