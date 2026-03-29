# Normal vs Special Expressions

## Background: Lisp Special Forms

[John McCarthy](https://en.wikipedia.org/wiki/John_McCarthy_%28computer_scientist%29)'s [original Lisp (1960)](http://www-formal.stanford.edu/jmc/recursive.html) distinguished between **functions** (which evaluate all arguments before applying) and **special forms** (which control evaluation order). This distinction is fundamental: `if` cannot be a normal function because it must **not** evaluate the branch that isn't taken.

Dvala inherits this split. Every expression is either **normal** or **special**, and the difference determines when and whether arguments are evaluated.

## Normal Expressions: Evaluate Everything First

A normal expression evaluates **all** its arguments before executing. This is the standard calling convention — predictable and simple:

```dvala
// + is normal: both 3 and 4 are evaluated, then added
3 + 4
```

```dvala
// map is normal: evaluates the array and the function, then applies
map([1, 2, 3], inc)
```

Most of Dvala's built-in functions are normal expressions: arithmetic, string operations, array functions, predicates. When you see `f(a, b, c)`, all of `a`, `b`, and `c` are computed before `f` runs.

## Special Expressions: Controlled Evaluation

A special expression controls **when** and **whether** each argument is evaluated. This is essential for control flow, binding, and short-circuit logic.

### if — Conditional Evaluation

`if` evaluates the condition, then evaluates **only** the matching branch:

```dvala
if true then
  "this runs"
else
  "this does not"
end
```

If `if` were a normal expression, both branches would be evaluated before the decision — defeating the purpose.

### && / || — Short-Circuit Logic

`&&` stops at the first falsy value. `||` stops at the first truthy value:

```dvala
false && (1 / 0)
```

The division never happens because `&&` short-circuits on `false`.

```dvala
42 || (1 / 0)
```

Similarly, `||` returns 42 without evaluating the second operand.

### let — Creates Bindings

`let` binds names to values in sequence. Each binding is available to subsequent ones:

```dvala
let x = 10;
let y = x + 5;
y * 2
```

This requires special evaluation: `let` must bind `x` before evaluating `x + 5`.

### if/else if — Multi-Branch Conditions

`if/else if` chains evaluate conditions top-to-bottom, stopping at the first true one:

```dvala
let temp = 25;
if temp < 0 then "freezing"
else if temp < 20 then "cold"
else if temp < 30 then "pleasant"
else "hot"
end
```

### loop / recur — Tail-Recursive Iteration

`loop` creates bindings and `recur` jumps back with new values. Both are special because `recur` must be recognized at the tail position:

```dvala
loop (i = 0, total = 0) ->
  if i > 4 then
    total
  else
    recur(i + 1, total + i)
  end
```

### match — Pattern Matching

`match` compares a value against patterns without evaluating all branches:

```dvala
match [1, 2, 3]
  case [a] then "one"
  case [a, b] then "two"
  case [a, b, c] then a + b + c
end
```

### for — Iteration

`for` creates a new array from a comprehension:

```dvala
for (x in [1, 2, 3] when x > 1) -> x * 10
```

### @name / perform — Algebraic Effects

`@name` creates an effect reference. `perform` invokes it:

```dvala
let e = @my.double;
do
  with handler @my.double(arg) -> resume(arg * 2) end;
  perform(e, 21)
end
```

### do / block — Sequencing

`do...end` groups expressions and evaluates them in order, returning the last:

```dvala
do
  let a = 1;
  let b = 2;
  a + b
end
```

## The Complete List

Dvala has **20** special expressions:

* **Logic** — `&&`, `||`, `??`
* **Conditionals** — `if`, `match`
* **Binding** — `let`
* **Iteration** — `loop`, `recur`, `for`
* **Grouping** — `do` (block)
* **Functions** — `->` (lambda)
* **Data** — `array`, `object`
* **Effects** — `@name`, `perform`
* **Concurrency** — `parallel`, `race`
* **Modules** — `import`

Everything else — `+`, `map`, `filter`, `str`, `inc`, `upperCase`, and hundreds more — is a normal expression that evaluates all arguments first.

## Why This Matters

The normal/special distinction explains:

* **Why `if` doesn't evaluate dead branches** — it's special
* **Why `&&` short-circuits** — it's special
* **Why `map(xs, f)` always evaluates both `xs` and `f`** — it's normal
* **Why `let` bindings are sequential** — it's special
* **Why you can't pass `if` as a function** — special expressions are not values

Understanding this split — rooted in [McCarthy's 1960](http://www-formal.stanford.edu/jmc/recursive.html) insight — is key to understanding how Dvala evaluates code.
