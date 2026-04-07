# Purity & Side-Effect Discipline

## Background: The Awkward Squad

[Simon Peyton Jones](https://en.wikipedia.org/wiki/Simon_Peyton_Jones)' ["Tackling the Awkward Squad" (2001)](https://www.microsoft.com/en-us/research/publication/tackling-awkward-squad-monadic-inputoutput-concurrency-exceptions-foreign-language-calls-haskell/) laid out the fundamental tension: useful programs need side effects (I/O, mutation, randomness), but reasoning about programs requires purity. Haskell solved this with the `IO` monad — a type-level barrier between pure and impure code.

Dvala takes a different approach: **runtime enforcement**. The result is practical purity without a type system.

## Pure Mode

Dvala can enforce purity at runtime. Pass `{ pure: true }` to the host API to run code in pure mode. Any attempt to `perform` an effect will throw:

```typescript
import { createDvala } from '@mojir/dvala/full'

const dvala = createDvala()
const result = dvala.run('1 + 1', { pure: true })
// result.value === 2

dvala.run('perform(@dvala.io.print, "hello")', { pure: true })
// throws: "Cannot perform effect 'dvala.io.print' in pure mode"
```

From inside Dvala, pure mode is transparent — the program simply cannot reach any `perform`. The error is thrown immediately when the `perform` is evaluated:

```dvala no-run
// Running this with { pure: true } throws at runtime:
//   RuntimeError: Cannot perform effect 'dvala.io.print' in pure mode
perform(@dvala.io.print, "Hello, anybody out there?")
```

An impure program is easy to identify, it is a program that does `perform`. E.g. `perform(@dvala.io.print)`

## Effects: The Pure Way to Do I/O

Instead of calling impure functions directly, Dvala programs **perform effects** — pure descriptions of side effects that are handled externally:

```dvala
perform(@dvala.io.print, "This is a pure description of a side effect");
```

An effect call is pure in the sense that it describes **what** should happen without **doing** it directly. The handler gives the effect its meaning. This is the algebraic effects approach ([Plotkin & Pretnar, 2009](https://homepages.inf.ed.ac.uk/gdp/publications/Effect_Handlers.pdf)) — effects are operations, handlers are interpreters.

## Why Purity Matters

Pure functions have powerful properties:

```dvala
// Referential transparency: f(x) always returns the same result for the same x
let f = (x) -> x * 2 + 1;
[f(3), f(3), f(3)];
```

Because `f` is pure, every call with the same argument produces the same result. This enables:

* **Testing** — no setup or teardown needed
* **Caching** — results can be memoized safely
* **Parallelism** — pure functions can run concurrently without locks
* **Serialization** — Dvala's suspend/resume works because pure computations are reproducible

## First-Class Functions Stay Pure

Higher-order functions preserve purity. When you pass a pure function to `map`, the entire pipeline remains pure:

```dvala
let transform = (xs) -> reduce(_, +, 0)(map(_, -> $ * $)(filter(_, isEven)(xs)));
transform([1, 2, 3, 4, 5, 6]);
```

## Dead Code Is Not Checked

Pure mode only blocks impure calls that actually execute. Unreachable code is fine:

```dvala
// This works in pure mode — the effect branch never runs
if false then perform(@dvala.io.print, "never happens") else 42 end;
```

## File Modules Are Pure

When using Dvala's bundler, file modules are **always** evaluated in pure mode. This ensures that importing a module never causes side effects — a deliberate design choice that makes the module system predictable. (File modules and the bundler are covered in the [Modules](../05-advanced/01-modules.md) chapter.)

```dvala no-run
// File modules can define impure functions, but cannot call them
// This would be valid in a file module:
{ greet: (name) -> `hello ${name}` }
```

## Summary

Dvala follows the principle that side effects should be **explicit, controlled, and separable** from pure computation.
