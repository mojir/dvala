# Modules

Dvala provides domain-specific function libraries as opt-in modules. Import them to access specialized functionality.

## Importing a Module

Use `import` to load a module. It returns an object whose keys are the module's functions:

```dvala
let m = import(math);
m.sin(PI / 2)
```

## Destructured Import

Combine `import` with destructuring to pull out individual functions:

```dvala
let { sin, cos } = import(math);
sin(PI / 6)
```

## Math Module

Trigonometric, logarithmic, and angle-conversion functions:

```dvala
let { ln, log10 } = import(math);
[ln(E), log10(1000)]
```

## Sequence Module

Extended sequence operations — `sort-by`, `distinct`, `group-by`, and more:

```dvala
let seq = import(sequence);
seq.distinct([1, 2, 2, 3, 3, 3])
```

```dvala
let seq = import(sequence);
seq.sort-by(["banana", "fig", "apple"], count)
```

## Collection Module

Deep access and advanced aggregation:

```dvala
let col = import(collection);
let data = { user: { name: "Alice" } };
col.get-in(data, ["user", "name"])
```

## Vector Module

Statistical functions for number arrays:

```dvala
let vec = import(vector);
vec.cumsum([1, 2, 3, 4])
```

## Linear Algebra Module

Vector math — dot products, distances, normalization:

```dvala
let lin = import(linear-algebra);
lin.dot([1, 2, 3], [4, 5, 6])
```

## Matrix Module

Matrix operations — multiplication, determinant, inverse:

```dvala
let mat = import(matrix);
mat.det([[1, 2], [3, 4]])
```

## String Module

Additional string utilities:

```dvala
let s = import(string);
s.pad-left("42", 5, "0")
```

## Number Theory Module

GCD, LCM, primality-related functions:

```dvala
let nt = import(number-theory);
nt.gcd(24, 36)
```
