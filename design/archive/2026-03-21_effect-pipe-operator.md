# Effect Pipe Operator `||>`

## Semantics

`expr ||> handler` is pure sugar for `handle expr with handler end`.

```
expr ||> h           →  handle expr with h end
expr ||> [h1, h2]    →  handle expr with [h1, h2] end
expr ||> h1 ||> h2   →  handle (handle expr with h1 end) with h2 end
```

## Precedence

- Precedence 1 — below `|>` (2) and above conditional `? :` (shifted to 0.5)
- Below all arithmetic, comparison, logical, and pipe (`|>`) operators
- The handler shorthand body parser stops at `||>`, so chaining works:
  `expr ||> @a(x) -> x * 2 ||> @b(y) -> y + 1` parses as
  `(expr ||> @a(x) -> x * 2) ||> @b(y) -> y + 1`

## Implementation steps

### 1. Tokenizer: add `||>` operator
- Add `'||>'` to the operators list in `src/tokenizer/operators.ts`
- Must be listed before `||` (if it exists) and `|>` to ensure longest match

### 2. Parser: handle `||>` as binary operator
- Add precedence for `||>` in `src/parser/getPrecedence.ts` — very low (e.g., 1)
- In `parseExpression`, `||>` produces a handle node:
  left = body expression, right = handler expression
- Reuse the existing handle AST node structure (HandleNode)

### 3. Shorthand body parser: stop at `||>`
- In `parseHandlerShorthand` (parseOperand.ts), change `ctx.parseExpression()`
  to `ctx.parseExpression(pipePrecedence)` so the body stops at `||>`
- This makes `@a(x) -> body ||> h` parse as `(@a(x) -> body) ||> h`

### 4. Tests
- Basic: `expr ||> handler`
- With shorthand: `expr ||> @eff(x) -> x * 2`
- Chaining: `expr ||> h1 ||> h2`
- Chaining with inline shorthands: `expr ||> @a(x) -> x * 2 ||> @b(y) -> y + 1`
- With list: `expr ||> [h1, h2]`
- With let: `let x = expr ||> h`
- Stored handler: `let h = @eff(x) -> x; expr ||> h`
- Mixed with |>: `expr |> f ||> h` (value pipe then effect pipe)

#### Equivalence tests (from DX discussion)
Assert that these pairs produce identical results:

```
;; Pipe is sugar for handle...with
risky() ||> @dvala.error(msg) -> default-value
handle risky() with @dvala.error(msg) -> default-value end

;; Pipe with list = handle...with list
expr ||> [h1, h2]
handle expr with [h1, h2] end

;; Chaining with named handlers
expr ||> h1 ||> h2
handle (handle expr with h1 end) with h2 end

;; Inline shorthand chaining (no parens needed)
expr ||> @a(x) -> x * 2 ||> @b(y) -> y + 1
(expr ||> @a(x) -> x * 2) ||> @b(y) -> y + 1

;; Middleware chaining
app() ||> authHandler ||> dbHandler ||> logHandler
handle (handle (handle app() with authHandler end) with dbHandler end) with logHandler end

;; Error catching — lightest form
risky() ||> @dvala.error(msg) -> 0
handle risky() with @dvala.error(msg) -> 0 end

;; Reusable handler
let safeDiv = @dvala.error(msg) -> 0; (a / b) ||> safeDiv
let safeDiv = @dvala.error(msg) -> 0; handle a / b with safeDiv end
```

### 5. Documentation
- Update tutorials/05-advanced/02-effects.md with ||> examples
- Update README.md
- Update design/handler-shorthand.md

## AST representation

`expr ||> handler` produces the same AST as `handle expr with handler end`:
```
[NodeTypes.SpecialExpression, [specialExpressionTypes.handle, [bodyNode, handlerNode]]]
```

No new AST node type needed — the parser transforms `||>` into a HandleNode.
