# Dvala Language Reference

You are generating code in **Dvala** — a pure functional programming language that runs in JavaScript environments. Every piece of syntax produces a value (there are no statements). All data is immutable. Functions are first-class values.

---

## Critical Rules (Read Before Writing Any Code)

1. **Identifiers follow JavaScript rules:** letters, digits, `_`, `$`. No hyphens, `?`, or `!` in names. Use camelCase: `isArray`, `dropWhile`, `mergeWith`.
2. **Unary minus works:** `-x`, `-3`, `-PI` all work. But `-(a, b)` is still a prefix function call (subtraction).
3. **Semicolons are separators, not terminators.** In a sequence of expressions, `;` goes *between* them. The last expression in a block is its return value — no trailing semicolon needed.
4. **`let` bindings are immutable.** You cannot reassign a variable. Build new values instead.
5. **Use `self` to recurse inside a lambda.** `self(args)` calls the immediately enclosing function.
6. **Comments:** `// single line` or `/* multi-line */`.

---

## Data Types

| Type | Literal examples |
|------|-----------------|
| number | `42`, `3.14`, `-2.3e-2`, `0xFF`, `0b1010`, `0o77` |
| string | `"hello"`, `"line\nbreak"` |
| boolean | `true`, `false` |
| null | `null` |
| array | `[1, "two", true]`, `[]` |
| object | `{ name: "Alice", age: 30 }`, `{}` |
| function | `(x, y) -> x + y` |
| regexp | `#"[a-z]+"` or `#"pattern"ig` |

**Spread in arrays:** `[1, 2, ...[3, 4], 5]` → `[1, 2, 3, 4, 5]`
**Spread in objects:** `{ ...defaults, name: "Lisa" }`

---

## Global Constants (Always Available)

| Constant | Aliases | Value |
|----------|---------|-------|
| `PI` | `π` | `Math.PI` |
| `E` | `ε` | `Math.E` |
| `PHI` | `φ` | Golden ratio |
| `POSITIVE_INFINITY` | `∞` | `Infinity` |
| `NEGATIVE_INFINITY` | `-∞` | `-Infinity` |
| `NaN` | | `NaN` |
| `MAX_SAFE_INTEGER` | | `9007199254740991` |
| `MIN_SAFE_INTEGER` | | `-9007199254740991` |
| `MAX_VALUE` | | `Number.MAX_VALUE` |
| `MIN_VALUE` | | `Number.MIN_VALUE` |

---

## Variables and Definitions

```dvala
// Local binding (immutable, block-scoped)
let x = 42;
let greeting = "Hello, " ++ name;

// Destructuring — object
let { name, age } = person;
let { name as userName = "Guest" } = person;   // rename + default
let { profile: { age } } = person;             // nested

// Destructuring — array
let [head, ...tail] = [1, 2, 3, 4];            // head=1, tail=[2,3,4]
let [, , third] = [1, 2, 3, 4];                // skip elements
```

---

## Functions

```dvala
// Full form
let add = (x, y) -> x + y;

// Single argument (parens optional)
let square = x -> x * x;

// Short lambda: $ = first arg, $2 = second, etc.
let double = -> $ * 2;
let hyp    = -> $ ^ 2 + $2 ^ 2;

// Rest parameters
let sumAll = (...nums) -> reduce(nums, +, 0);

// Default parameter values
let greet = (name = "World") -> "Hello, " ++ name;

// Destructuring parameters
let greet = ({ name, age }) -> name ++ " is " ++ str(age);

// Recursion — use `self` inside a lambda
let factorial = n -> if n <= 1 then 1 else n * self(n - 1) end;

// Calling functions
add(3, 4)           // => 7
square(5)           // => 25

// apply: call with an array of arguments
apply(add, [3, 4])  // => 7
```

### Data as Functions

Arrays, objects, strings, and numbers can be used as accessor functions:

```dvala
let arr = [10, 20, 30];
arr(1)          // => 20  (array as function, 0-based index)
1(arr)          // => 20  (number as function)

let obj = { name: "Alice" };
obj("name")     // => "Alice"  (object as function)
"name"(obj)     // => "Alice"  (string as function)

// Useful with map:
let people = [{ name: "Alice" }, { name: "Bob" }];
people map "name"    // => ["Alice", "Bob"]
```

---

## Operators

### Binary operators (all support both infix and prefix/function form)

| Operator | Description | Infix | Prefix form |
|----------|-------------|-------|-------------|
| `^` | Exponentiation (right-assoc) | `2 ^ 10` | `^(2, 10)` |
| `*` | Multiplication | `3 * 4` | `*(3, 4)` |
| `/` | Division | `10 / 2` | `/(10, 2)` |
| `%` | Remainder (sign of dividend) | `7 % 3` | `%(7, 3)` |
| `+` | Addition (variadic) | `1 + 2` | `+(1, 2, 3)` |
| `-` | Subtraction / negation | `5 - 3` | `-(5, 3)` |
| `<<` | Left bit shift | `1 << 4` | `<<(1, 4)` |
| `>>` | Signed right shift | `16 >> 2` | `>>(16, 2)` |
| `>>>` | Unsigned right shift | `16 >>> 2` | `>>>(16, 2)` |
| `++` | String / sequence concat | `"a" ++ "b"` | `++("a", "b")` |
| `<` | Less than | `a < b` | `<(a, b)` |
| `<=` / `≤` | Less than or equal | `a <= b` | |
| `>` | Greater than | `a > b` | `>(a, b)` |
| `>=` / `≥` | Greater than or equal | `a >= b` | |
| `==` | Structural equality | `a == b` | `==(a, b)` |
| `!=` / `!=` | Not equal | `a != b` | `!=(a, b)` |
| `&` | Bitwise AND (variadic) | `a & b` | `&(a, b)` |
| `xor` | Bitwise XOR (variadic) | `a xor b` | `xor(a, b)` |
| `\|` | Bitwise OR (variadic) | `a \| b` | `\|(a, b)` |
| `&&` | Logical AND (short-circuit) | `a && b` | `&&(a, b)` |
| `\|\|` | Logical OR (short-circuit) | `a \|\| b` | `\|\|(a, b)` |
| `??` | Nullish coalescing | `a ?? b` | `??(a, b)` |
| `\|>` | Pipe | `x \|> f` | |

### Operator precedence (high → low)

`^` → `* / %` → `+ -` → `<< >> >>>` → `++` → `< <= > >=` → `== !=` → `& xor |` → `&& || ??` → `|>`

### Pipe operator with placeholder `_`

`_` marks where the left-hand value is inserted:

```dvala
[1, 2, 3]
  |> map(_, -> $ ^ 2)
  |> filter(_, isOdd)
  |> reduce(_, +, 0)
```

### Partial application with `_`

```dvala
let add5 = +(5, _);   // partial: add5(3) => 8
let gt0  = <(0, _);   // partial: gt0(5) => true
```

---

## Special Expressions (Control Flow)

### `if`

```dvala
if condition then
  expr
else
  expr
end

if condition then expr end          // no else: returns null when false

if not(condition) then expr end     // negated condition
```

### `if/else if` (multi-branch)

```dvala
if condition1 then expr1
else if condition2 then expr2
else default-expr
end
// returns null if no branch matches and no else
```

### `match` (pattern matching)

```dvala
match value
  case 1 then "one"
  case 2 then "two"
end
// returns null if no case matches
```

### `let` (local binding block)

```dvala
let x = 10;
let y = x * 2;
x + y              // => 30  (last expression is the value)
```

### `do` (block)

Group multiple expressions; returns the last one:

```dvala
do
  let temp = compute(x);
  transform(temp)
end
```

### `for` (comprehension — returns array)

```dvala
for (x in [1, 2, 3]) -> x * 2
// => [2, 4, 6]

// With modifiers:
for (
  i in range(10)
  let sq = i ^ 2
  when sq % 3 == 0
  while sq < 50
) -> sq
```

Binding modifiers (all optional, in this order):
- `let name = expr` — local binding per iteration
- `when condition` — skip this iteration if false
- `while condition` — stop entirely if false

Multiple bindings produce a cartesian product:

```dvala
for (i in [1, 2], j in [10, 20]) -> i + j
// => [11, 21, 12, 22]
```

### `loop` / `recur` (tail-recursive loop)

```dvala
loop (n = 5, acc = 1) ->
  if n <= 1 then
    acc
  else
    recur(n - 1, acc * n)
  end
// => 120
```

### `do` / `with` / error handling

```dvala
do
  riskyOperation()
with
  case effect(dvala.error) then ([msg]) -> "Failed: " ++ msg
end

do expr with case effect(dvala.error) then (args) -> "fallback" end

perform(effect(dvala.error), "Something went wrong")
```

### `and` / `or` / `??`

```dvala
a && b && c       // short-circuit AND; returns last truthy or first falsy
a || b || c       // short-circuit OR; returns first truthy or last falsy
a ?? b            // returns a if a != null, else b
```

### `recur` (tail call in any enclosing function/loop)

```dvala
let countdown = n -> do
  perform(effect(dvala.io.print), n);
  if !(isZero(n)) then recur(n - 1) end
end;
countdown(3)
```

---

## Accessor Shorthands

```dvala
obj.key               // property access (same as obj("key"))
arr[0]                // index access (same as arr(0))
data.users[0].name    // chaining
```

---

## Lambda Shorthand

`-> expression` with positional arguments:

```dvala
-> $ * 2         // single arg: $
-> $ + $2        // two args
-> $ * $2 + $3   // three args

// Examples:
[1, 2, 3] map (-> $ ^ 2)     // => [4, 9, 16] — wait, map takes (coll, fn)
map([1, 2, 3], -> $ ^ 2)     // => [1, 4, 9]
```

---

## Regexp Shorthand

```dvala
#"pattern"        // same as regexp("pattern")
#"pattern"ig      // with flags (i = case-insensitive, g = global)

// No need to escape backslashes:
#"\d+"            // matches one or more digits
```

---

## Built-in Functions

### Math

| Function | Description |
|----------|-------------|
| `inc(x)` | x + 1 (also works on vectors/matrices element-wise) |
| `dec(x)` | x - 1 |
| `+(a, b, ...)` | Addition (variadic) |
| `-(a, b)` / `-(a)` | Subtraction / negation |
| `*(a, b, ...)` | Multiplication |
| `/(a, b)` | Division |
| `%(a, b)` | Remainder (sign of dividend) |
| `mod(a, b)` | Modulo (sign of divisor) |
| `quot(a, b)` | Integer division truncated toward zero |
| `^(a, b)` | Exponentiation |
| `sqrt(x)` | Square root |
| `cbrt(x)` | Cube root |
| `abs(x)` | Absolute value |
| `sign(x)` | -1, 0, or 1 |
| `round(x, decimals?)` | Round to nearest (or to N decimals) |
| `floor(x)` | Largest integer ≤ x |
| `ceil(x)` | Smallest integer ≥ x |
| `trunc(x)` | Truncate toward zero |
| `min(a, b, ...)` / `min(vector)` | Minimum value |
| `max(a, b, ...)` / `max(vector)` | Maximum value |

### Comparison / Logic

| Function | Description |
|----------|-------------|
| `==(a, b, ...)` | Structural equality (deep) |
| `!=(a, b)` / `!=(a, b)` | Not equal |
| `<(a, b, ...)` | Strictly increasing |
| `<=(a, b, ...)` | Non-decreasing |
| `>(a, b, ...)` | Strictly decreasing |
| `>=(a, b, ...)` | Non-increasing |
| `not(x)` | Logical NOT |
| `boolean(x)` | Coerce to boolean |
| `compare(a, b)` | Returns -1, 0, or 1 |

### String

| Function | Description |
|----------|-------------|
| `str(a, b, ...)` | Concatenate to string (null → "") |
| `number(s)` | Parse string to number |
| `lowerCase(s)` | Lowercase |
| `upperCase(s)` | Uppercase |
| `trim(s)` | Remove leading/trailing whitespace |
| `split(s, delimiter, limit?)` | Split into array |
| `join(arr, delimiter)` | Join array into string |
| `isBlank(s)` | True if null or whitespace-only |

### Sequence (arrays and strings)

| Function | Description |
|----------|-------------|
| `first(seq)` | First element (null if empty) |
| `second(seq)` | Second element |
| `last(seq)` | Last element |
| `rest(seq)` | All but first (empty array if ≤1) |
| `next(seq)` | All but first, or null if ≤1 |
| `nth(seq, n, not-found?)` | Element at index n |
| `slice(seq, start?, stop?)` | Subsequence (exclusive stop) |
| `push(seq, ...values)` | Add to end (returns new) |
| `pop(seq)` | Remove last (returns new) |
| `reverse(seq)` | Reversed sequence |
| `sort(seq, comparator?)` | Sorted (default: `compare`) |
| `indexOf(seq, value)` | Index of value, or null |
| `some(seq, fn)` | First element passing fn, or null |

### Array-specific

| Function | Description |
|----------|-------------|
| `range(b)` / `range(a, b, step?)` | Array of numbers a..b (exclusive) |
| `repeat(value, n)` | Array of value repeated n times |
| `flatten(arr, depth?)` | Flatten nested arrays |

### Collection (arrays, objects, and strings)

| Function | Description |
|----------|-------------|
| `map(coll, fn)` / `map(coll1, coll2, fn)` | Transform elements |
| `filter(coll, fn)` | Keep elements passing fn |
| `reduce(coll, fn, initial)` | Fold to single value |
| `count(coll)` | Number of elements |
| `isEmpty(coll)` | True if empty or null |
| `isNotEmpty(coll)` | True if not empty and not null |
| `contains(coll, key)` | True if key/index/substring exists |
| `get(coll, key, not-found?)` | Value at key (with optional default) |
| `assoc(coll, key, value, ...)` | Set key to value (returns new) |
| `++(a, b, ...)` | Concatenate collections |

### Object

| Function | Description |
|----------|-------------|
| `keys(obj)` | Array of keys |
| `vals(obj)` | Array of values |
| `entries(obj)` | Array of [key, value] pairs |
| `find(obj, key)` | [key, value] pair or null |
| `dissoc(obj, key)` | Copy without key |
| `merge(obj, ...)` | Merge objects (right wins) |
| `mergeWith(obj, ..., fn)` | Merge with conflict resolver fn |
| `zipmap(keys, vals)` | Build object from two arrays |
| `selectKeys(obj, keys)` | Keep only specified keys |

### Functional

| Function | Description |
|----------|-------------|
| `apply(fn, args-array)` | Call fn with array as args |
| `identity(x)` | Returns x |
| `comp(fn, ...)` | Compose functions (right-to-left) |
| `constantly(x)` | Returns function that always returns x |

### Predicates

| Function | Description |
|----------|-------------|
| `isNumber(x)` | Is x a isNumber |
| `isInteger(x)` | Is x an isInteger |
| `isString(x)` | Is x a isString |
| `isBoolean(x)` | Is x a isBoolean |
| `isNull(x)` | Is x isNull |
| `isFunction(x)` | Is x a isFunction |
| `isArray(x)` | Is x an isArray |
| `isObject(x)` | Is x an object (map)? |
| `isSequence(x)` | Is x an array or isString |
| `isCollection(x)` | Is x an array, object, or isString |
| `isRegexp(x)` | Is x a isRegexp |
| `isVector(x)` | Is x a vector (array of numbers)? |
| `isMatrix(x)` | Is x a matrix (2D array of numbers)? |
| `isGrid(x)` | Is x a grid (2D array, uniform row lengths)? |
| `isEmpty(x)` | Is x empty or isNull |
| `isNotEmpty(x)` | Is x non-empty and non-null? |
| `isZero(x)` | Is x isZero |
| `isPos(x)` | Is x > 0? |
| `isNeg(x)` | Is x < 0? |
| `isEven(x)` | Is x isEven |
| `isOdd(x)` | Is x isOdd |
| `isFinite(x)` | Is x isFinite |
| `isTrue(x)` | Is x exactly isTrue |
| `isFalse(x)` | Is x exactly isFalse |
| `isPositiveInfinity(x)` | Is x +Infinity? |
| `isNegativeInfinity(x)` | Is x -Infinity? |

### Regular Expressions

| Function | Description |
|----------|-------------|
| `regexp(pattern, flags?)` | Create regexp |
| `reMatch(text, regexp)` | Returns match array or null |
| `replace(s, regexp, replacement)` | Replace first match |
| `replaceAll(s, regexp, replacement)` | Replace all matches |

### Misc

| Function | Description |
|----------|-------------|
| `jsonParse(s)` | Parse JSON string |
| `jsonStringify(x, indent?)` | Serialize to JSON string |
| `epochToIso-date(ms)` | Milliseconds to ISO date string |
| `iso-dateToEpoch(s)` | ISO date string to milliseconds |
| `import(path)` | Import module or function (see Modules) |
| `doc(fn)` | Return documentation string |
| `arity(fn)` | Return `{min, max}` arity object |

### Assertion (core)

| Function | Description |
|----------|-------------|
| `assert(value, message?)` | Assert value is truthy, error on failure |

### Bitwise (core)

| Function | Description |
|----------|-------------|
| `&(a, b, ...)` | Bitwise AND |
| `\|(a, b, ...)` | Bitwise OR |
| `xor(a, b, ...)` | Bitwise XOR |
| `<<(a, b)` | Left shift |
| `>>(a, b)` | Signed right shift |
| `>>>(a, b)` | Unsigned right shift |

---

## Modules

Modules must be explicitly imported before use:

```dvala
// Import entire module as an object
let m = import(math);
m.sin(PI)

// Import with destructuring
let { sin, cos } = import(math);
sin(PI)
```

### Available Modules

**math**: `sin`, `asin`, `sinh`, `asinh`, `cos`, `acos`, `cosh`, `acosh`, `tan`, `atan`, `tanh`, `atanh`, `ln`, `log2`, `log10`, `toRad`, `toDeg`

**vector**: `movingFn`, `runningFn`, `isMonotonic`, `isStrictlyMonotonic`, `isIncreasing`, `isDecreasing`, `isStrictlyIncreasing`, `isStrictlyDecreasing`, `mode`, `minIndex`, `maxIndex`, `sortIndices`, `countValues`, `linspace`, `ones`, `zeros`, `fill`, `generate`, `cumsum`, `cumprod`, `quartiles`, `percentile`, `quantile`, `histogram`, `ecdf`, `isOutliers`, `outliers`, `bincount`, `winsorize`, `mse`, `rmse`, `mae`, `smape`

**sequence**: `mapcat`, `position`, `lastIndexOf`, `shift`, `splice`, `sortBy`, `take`, `takeLast`, `takeWhile`, `drop`, `dropLast`, `dropWhile`, `unshift`, `distinct`, `remove`, `removeAt`, `splitAt`, `splitWith`, `frequencies`, `groupBy`, `partition`, `partitionAll`, `partitionBy`, `isEndsWith`, `isStartsWith`, `interleave`, `interpose`

**collection**: `getIn`, `assocIn`, `update`, `updateIn`, `filteri`, `mapi`, `reducei`, `reduceRight`, `reduceiRight`, `reductions`, `reductionsi`, `notEmpty`, `isEvery`, `isAny`, `notAny`, `notEvery`

**functional**: `juxt`, `complement`, `everyPred`, `somePred`, `fnull`

**string**: `stringRepeat`, `fromCharCode`, `toCharCode`, `trimLeft`, `trimRight`, `splitLines`, `padLeft`, `padRight`, `template`, `encodeBase64`, `decodeBase64`, `encodeUriComponent`, `decodeUriComponent`, `capitalize`

**bitwise**: `bitNot`, `bitAndNot`, `bitFlip`, `bitSet`, `bitClear`, `bitTest`

**grid**: `isEvery`, `isSome`, `isEveryRow`, `isSomeRow`, `isEveryCol`, `isSomeCol`, `row`, `col`, `shape`, `fill`, `generate`, `reshape`, `transpose`, `flipH`, `flipV`, `rotate`, `reverse-rows`, `reverse-cols`, `slice`, `sliceRows`, `sliceCols`, `spliceRows`, `spliceCols`, `concatRows`, `concatCols`, `map`, `mapi`, `reduce`, `reducei`, `pushRows`, `unshiftRows`, `popRow`, `shiftRow`, `pushCols`, `unshiftCols`, `popCol`, `shiftCol`, `fromArray`

**matrix**: `mul`, `det`, `inv`, `adj`, `cofactor`, `minor`, `trace`, `isSymmetric`, `isTriangular`, `isUpperTriangular`, `isLowerTriangular`, `isDiagonal`, `isSquare`, `isOrthogonal`, `isIdentity`, `isInvertible`, `hilbert`, `vandermonde`, `band`, `isBanded`, `rank`, `frobeniusNorm`, `oneNorm`, `infNorm`, `maxNorm`

**linear-algebra**: `rotate2d`, `rotate3d`, `reflect`, `refract`, `lerp`, `dot`, `cross`, `normalizeMinmax`, `normalizeRobust`, `normalizeZscore`, `normalizeL1`, `normalizeL2`, `normalizeLog`, `angle`, `projection`, `isOrthogonal`, `isParallel`, `isCollinear`, `cosineSimilarity`, `euclideanDistance`, `euclideanNorm`, `manhattanDistance`, `manhattanNorm`, `hammingDistance`, `hammingNorm`, `chebyshevDistance`, `chebyshevNorm`, `minkowskiDistance`, `minkowskiNorm`, `cov`, `corr`, `spearmanCorr`, `pearsonCorr`, `kendallTau`, `autocorrelation`, `crossCorrelation`, `rref`, `solve`, `toPolar`, `fromPolar`

**number-theory**: `isCoprime`, `isDivisibleBy`, `gcd`, `lcm`, `multinomial`, `isAmicable`, `eulerTotient`, `mobius`, `mertens`, `sigma`, `carmichaelLambda`, `cartesianProduct`, `perfectPower`, `modExp`, `modInv`, `extendedGcd`, `chineseRemainder`, `stirlingFirst`, `stirlingSecond`

**assertion**: `assertEqual`, `assertNotEqual`, `assertGt`, `assertGte`, `assertLt`, `assertLte`, `assertTrue`, `assertFalse`, `assertTruthy`, `assertFalsy`, `assertNull`, `assertFails`, `assertFailsWith`, `assertSucceeds`, `assertArray`, `assertBoolean`, `assertCollection`, `assertFunction`, `assertGrid`, `assertInteger`, `assertMatrix`, `assertNumber`, `assertObject`, `assertRegexp`, `assertSequence`, `assertString`, `assertVector`

---

## Common Patterns

### Factorial (recursion with `self`)

```dvala
let factorial = n ->
  if n <= 1 then 1 else n * self(n - 1) end;

factorial(5)   // => 120
```

### Tail-recursive loop with `loop` / `recur`

```dvala
loop (n = 5, acc = 1) ->
  if n <= 1 then
    acc
  else
    recur(n - 1, acc * n)
  end
// => 120
```

### Pipeline with `|>` and `_`

```dvala
range(10)
  |> map(_, -> $ ^ 2)
  |> filter(_, isOdd)
  |> reduce(_, +, 0)
// => 1 + 9 + 25 + 49 + 81 = 165
```

### Immutable state update with `assoc`

```dvala
let state = { score: 0, level: 1 };
let next-state = assoc(state, "score", state.score + 10);
// state is unchanged; next-state has score: 10
```

### Nested update

```dvala
let user = { profile: { age: 30 } };
let older = assoc(user, "profile", assoc(user.profile, "age", 31));
```

### For comprehension

```dvala
for (i in range(1, 4), j in range(1, 4) when i != j) ->
  [i, j]
// => [[1,2],[1,3],[2,1],[2,3],[3,1],[3,2]]
```

### Destructuring in a function

```dvala
let distance = ({ x: x1, y: y1 }, { x: x2, y: y2 }) ->
  sqrt((x2 - x1) ^ 2 + (y2 - y1) ^ 2);

distance({ x: 0, y: 0 }, { x: 3, y: 4 })  // => 5
```

### Error handling

```dvala
let safe-divide = (a, b) ->
  do
    if b == 0 then perform(effect(dvala.error), "Division by zero") end;
    a / b
  with
    case effect(dvala.error) then ([msg]) -> msg
  end;

safe-divide(10, 2)   // => 5
safe-divide(10, 0)   // => "Division by zero"
```

### Using a module

```dvala
let { sin, cos } = import(math);

let unit-circle-point = theta ->
  { x: cos(theta), y: sin(theta) };

unit-circle-point(PI / 4)
```

### `reduce` for aggregation

```dvala
let words = ["the", "quick", "brown", "fox"];
let freq = reduce(
  words,
  (acc, word) -> assoc(acc, word, (acc[word] ?? 0) + 1),
  {}
);
```

### Higher-order composition

```dvala
let pipeline = comp(
  -> $ * 2,
  -> $ + 1,
  -> $ ^ 2
);
// comp is right-to-left: square, then +1, then *2
pipeline(3)   // => (3^2 + 1) * 2 = 20
```
