# Handler Shorthand Syntax

## Syntax

```
@effect-name(param) -> body
```

## Desugaring

```
@effect(param) -> body
```

becomes:

```
(arg, eff, nxt) ->
  if eff == @effect then
    let param = arg;
    body
  else nxt(eff, arg)
  end
```

When effect name contains `*` (wildcard), use `effect-matcher` instead of `==`:

```
@dvala.*(param) -> body
```

becomes:

```
(arg, eff, nxt) ->
  if effect-matcher("dvala.*")(eff) then
    let param = arg;
    body
  else nxt(eff, arg)
  end
```

## Implementation

Parse-time transformation in `parseOperand.ts`:
- After parsing `EffectName` node, check if next tokens are `(identifier) ->`
- If so, build the desugared lambda AST directly
- The shorthand is a general expression — works anywhere a function value is expected

## Examples

```
handle 0 / 0
with [@dvala.error(msg) -> "caught: " ++ msg]
end

handle perform(@my.eff, 42)
with [@my.eff(val) -> val * 2]
end

;; Wildcard
handle perform(@dvala.io.println, "hi")
with [@dvala.io.*(arg) -> null]
end

;; Stored as value
let my-handler = @my.eff(x) -> x + 1
handle perform(@my.eff, 41) with [my-handler] end
```
