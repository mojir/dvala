# Expression-Oriented Design

## Background: Everything Has a Value

In [denotational semantics](https://en.wikipedia.org/wiki/Denotational_semantics) ([Scott & Strachey, 1971](https://www.cs.ox.ac.uk/files/3228/PRG06.pdf)), every program construct denotes a value. The ML family of languages (ML, OCaml, Haskell, F#) embraced this: `if` returns a value, pattern matching returns a value, blocks return a value. There is no distinction between **expressions** (which produce values) and **statements** (which don't).

Dvala is purely expression-oriented. Every construct — without exception — evaluates to a value.

## if Returns a Value

In statement-oriented languages, `if` controls flow. In Dvala, `if` **is** a value:

```dvala
let status = if 10 > 5 then "big" else "small" end;
status
```

No need for a separate ternary operator (though Dvala has one for convenience):

```dvala
let x = 7;
x > 0 ? "positive" : "non-positive"
```

## Blocks Return Their Last Expression

A `do...end` block is an expression whose value is its last sub-expression:

```dvala
let result = do
  let a = 10;
  let b = 20;
  a + b
end;
result
```

This eliminates the need for explicit `return` statements. The value flows naturally.

## match Returns a Value

Pattern matching produces a value directly:

```dvala
let describe = (n) ->
  match n % 2
    case 0 then "even"
    case 1 then "odd"
  end;
describe(7)
```

## cond Returns a Value

Multi-branch conditionals are also expressions:

```dvala
let grade = (score) ->
  cond
    case score >= 90 then "A"
    case score >= 80 then "B"
    case score >= 70 then "C"
    case true then "F"
  end;
grade(85)
```

## loop Returns a Value

Even iteration produces a value — the body's value when `recur` is not called:

```dvala
let gcd = (a, b) ->
  loop (x = a, y = b) ->
    if y == 0 then x
    else recur(y, x % y)
    end;
gcd(48, 18)
```

## for Returns an Array

Comprehensions are expressions that produce arrays:

```dvala
let squares = for (x in range(6)) -> x * x;
squares
```

## Effects Return Values

Even `do...with` error handling returns a value:

```dvala
let safe-sqrt = (x) ->
  do
    sqrt(x)
  with
    case effect(dvala.error) then ([msg]) -> null
  end;
[safe-sqrt(16), safe-sqrt(-1)]
```

## No Statements, No Void

In Dvala:

* There is no `void` type — everything returns something
* There is no `return` keyword — the last expression is the value
* There are no statement separators that discard values (`;` sequences expressions, and the last one is the result)

## Composing Expressions

Because everything is an expression, constructs compose freely. You can nest any expression inside any other:

```dvala
map(
  [1, 2, 3, 4, 5],
  x -> if odd?(x) then x * x else x end
)
```

```dvala
let classify = (xs) ->
  for (x in xs) ->
    cond
      case x < 0 then "negative"
      case x == 0 then "zero"
      case true then "positive"
    end;
classify([-3, 0, 5, -1, 7])
```

## Practical Benefits

* **No early return bugs** — there is no `return`, so you can't accidentally skip cleanup
* **Declarative style** — code reads as "the value is..." rather than "do this, then do that"
* **Refactoring safety** — any expression can be extracted into a `let` binding or inlined without changing semantics
* **Uniform composition** — `|>`, `map`, `comp` work with everything because everything produces a value

## Summary

Dvala's expression-oriented design, rooted in the ML tradition and denotational semantics, means every construct in the language produces a value. This eliminates the expression/statement divide found in most languages and enables uniform composition: any piece of code can be used anywhere a value is expected.
