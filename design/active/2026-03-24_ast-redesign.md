# AST Redesign: The 12 Fundamental Nodes

## Principles

1. **Arrays only** — no objects, no special wrapper types. AST is Dvala data.
2. **Flat** — no `SpecialExpression`/`NormalExpression`/`Binding` wrappers. Tag at index 0 is the discriminator.
3. **Lowercase short tags** — `"let"`, `"if"`, `"fn"`, `"call"`, `"num"`, `"str"`, `"sym"`.
4. **Positions separated** — runtime AST is position-free. Serialized format has position at index 0.
5. **Patterns are a sub-language** — bare strings are binding names in pattern context. `["sym", "x"]` is only for expression context.

## Position Convention

**Runtime** (what macros see):
```
["if", cond, then, else]
```

**Serialized** (wire format):
```
[pos, "if", cond, then, else]
```

Unwrap: `node.slice(1)`. JS runtime stores position via `Symbol.for('dvala:pos')`.

## Value Nodes

All values are tagged. No raw primitives in the AST — every node is self-describing regardless of context.

```
["num", 42]
["str", "hello"]
["bool", true]
["null"]
```

## Identifier Nodes

```
["sym", "x"]              // variable reference (expression context)
["builtin", "+"]          // built-in function reference
["effect", "dvala.io.print"]  // effect reference
```

---

## 1. `let`

### Syntax

```dvala
let x = 42;
let [a, b, ...rest] = [1, 2, 3, 4];
let [a = 0, b = 99] = [7];
let { name, age } = person;
let { name as n } = person;
let { user: { name, tags: [first] } } = data;
let { ...rest } = obj;
```

### Runtime AST

**Simple binding** — `let x = 42`:
```
["let", "x", ["num", 42]]
```

**Array destructuring** — `let [a, b] = arr`:
```
["let",
  ["array-pat", ["a", "b"]],
  ["sym", "arr"]]
```

**Array with rest** — `let [a, ...rest] = arr`:
```
["let",
  ["array-pat", ["a", ["rest", "rest"]]],
  ["sym", "arr"]]
```

**Array with defaults** — `let [a = 0, b = 99] = [7]`:
```
["let",
  ["array-pat",
    [["default", "a", ["num", 0]],
     ["default", "b", ["num", 99]]]],
  ["array", [["num", 7]]]]
```

**Object destructuring** — `let { name, age } = person`:
```
["let",
  ["object-pat", ["name", "age"]],
  ["sym", "person"]]
```

**Object with alias** — `let { name as n } = person`:
```
["let",
  ["object-pat", [["name", "n"]]],
  ["sym", "person"]]
```

**Object with rest** — `let { ...rest } = obj`:
```
["let",
  ["object-pat", [["rest", "rest"]]],
  ["sym", "obj"]]
```

**Nested destructuring** — `let { user: { name, tags: [first] } } = data`:
```
["let",
  ["object-pat",
    [["user",
      ["object-pat",
        ["name",
         ["tags",
          ["array-pat", ["first"]]]]]]]],
  ["sym", "data"]]
```

### Pattern Sub-Language

Patterns appear only on the left side of `let`. The evaluator is always in "pattern mode" when processing the second element of a `["let", pattern, value]` node.

| Pattern | AST |
|---------|-----|
| Simple name | `"x"` (bare string) |
| Array destructure | `["array-pat", [...patterns]]` |
| Object destructure | `["object-pat", [...entries]]` |
| Rest | `["rest", "name"]` |
| Default | `["default", "name", expr]` |
| Alias (object) | `["key", "bindingName"]` (2-element array) |
| Shorthand (object) | `"name"` (bare string = key and binding are same) |
| Nested | Patterns nest recursively |

Note: `"array-pat"` and `"object-pat"` are distinct from `"array"` and `"object"` (value nodes). This prevents ambiguity — a macro can always tell whether it's looking at a destructuring pattern or a value constructor, regardless of context.

### Comparison with Current AST

**Current:**
```
["SpecialExpression",
  ["let",
    ["Binding",
      [["symbol",
         [["UserDefinedSymbol", "x", 0], null],
         0],
       ["Number", 42, 0]],
      0]],
  0]
```

**Proposed:**
```
["let", "x", ["num", 42]]
```

5 levels of nesting → 1. No `SpecialExpression`, `Binding`, `symbol`, `UserDefinedSymbol` wrappers.

---

## 2. `if`

### Syntax

```dvala
if true then 1 else 2 end
if x > 0 then "pos" else if x < 0 then "neg" else "zero" end
if x > 0 then "pos" end
```

### Runtime AST

**Shape:** `["if", cond, then, else]` — always 4 elements.

**Simple** — `if true then 1 else 2 end`:
```
["if",
  ["bool", true],
  ["num", 1],
  ["num", 2]]
```

**Else-if chain** — `if x > 0 then "pos" else if x < 0 then "neg" else "zero" end`:
```
["if",
  ["call", ["builtin", ">"], [["sym", "x"], ["num", 0]]],
  ["str", "pos"],
  ["if",
    ["call", ["builtin", "<"], [["sym", "x"], ["num", 0]]],
    ["str", "neg"],
    ["str", "zero"]]]
```

Else-if is not a special node — it's a nested `["if", ...]` in the else position.

**No else** — `if x > 0 then "pos" end`:
```
["if",
  ["call", ["builtin", ">"], [["sym", "x"], ["num", 0]]],
  ["str", "pos"],
  ["null"]]
```

No else → `["null"]` in the else position. Always 4 elements, no exceptions.

### Comparison with Current AST

**Current:**
```
["SpecialExpression",
  ["if",
    [cond, then, else]],
  pos]
```

**Proposed:**
```
["if", cond, then, else]
```

Children are direct elements, not wrapped in an inner array.

## 3. `function`

### Syntax

```dvala
(a, b) -> a + b
-> $ + 1
(a, b = 10) -> a + b
(first, ...rest) -> rest
(n) -> do let x = n * 2; x + 1 end
```

### Runtime AST

**Shape:** `["fn", [params], [body-exprs]]`

Parameters reuse the same sub-language as `let` patterns — bare strings for names, `["default", ...]` for defaults, `["rest", ...]` for rest. Body is always an array of expressions (last one is the return value).

**Basic** — `(a, b) -> a + b`:
```
["fn",
  ["a", "b"],
  [["call", ["builtin", "+"], [["sym", "a"], ["sym", "b"]]]]]
```

**Shorthand** — `-> $ + 1` (parser desugars `$` to a param):
```
["fn",
  ["$"],
  [["call", ["builtin", "+"], [["sym", "$"], ["num", 1]]]]]
```

**Default param** — `(a, b = 10) -> a + b`:
```
["fn",
  ["a", ["default", "b", ["num", 10]]],
  [["call", ["builtin", "+"], [["sym", "a"], ["sym", "b"]]]]]
```

**Rest param** — `(first, ...rest) -> rest`:
```
["fn",
  ["first", ["rest", "rest"]],
  [["sym", "rest"]]]
```

**Multi-expression body** — `(n) -> do let x = n * 2; x + 1 end`:
```
["fn",
  ["n"],
  [["let", "x", ["call", ["builtin", "*"], [["sym", "n"], ["num", 2]]]],
   ["call", ["builtin", "+"], [["sym", "x"], ["num", 1]]]]]
```

### Comparison with Current AST

**Current:**
```
["SpecialExpression",
  ["function",
    [[["symbol", [["UserDefinedSymbol", "a", pos], null], pos],
      ["symbol", [["UserDefinedSymbol", "b", pos], null], pos]],
     [body]]],
  pos]
```

**Proposed:**
```
["fn", ["a", "b"], [body]]
```

No `symbol`/`UserDefinedSymbol` wrappers. Params are bare strings.

---

## Also: `call` (function call)

Not one of the 12 special expressions, but fundamental to the AST.

### Runtime AST

**Shape:** `["call", fn-expr, [arg-exprs]]`

**User function** — `foo(1)`:
```
["call", ["sym", "foo"], [["num", 1]]]
```

**Builtin operator** — `x + 1`:
```
["call", ["builtin", "+"], [["sym", "x"], ["num", 1]]]
```

**Chained** — `f(g(x))`:
```
["call",
  ["sym", "f"],
  [["call", ["sym", "g"], [["sym", "x"]]]]]
```

**No args** — `foo()`:
```
["call", ["sym", "foo"], []]
```

All function application uses `["call", ...]` — builtins and user functions alike. The fn-expr is any expression that evaluates to a callable.

---

## 4. `block`

### Syntax

```dvala
do let x = 1; let y = 2; x + y end
```

### Runtime AST

**Shape:** `["block", [statements]]`

`do let x = 1; let y = 2; x + y end`:
```
["block",
  [["let", "x", ["num", 1]],
   ["let", "y", ["num", 2]],
   ["call", ["builtin", "+"], [["sym", "x"], ["sym", "y"]]]]]
```

Statements is an array of expressions. Last expression is the return value.

### Comparison with Current AST

**Current:** `["SpecialExpression", ["block", [stmts], null], pos]`
**Proposed:** `["block", [stmts]]`

The trailing `null` (label) in the current AST is dropped — no label feature exists.

## 5. `perform`

### Syntax

```dvala
perform(@dvala.io.print, "hello")
perform(@suspend)
```

### Runtime AST

**Shape:** `["perform", effect-expr, payload]` — always 3 elements.

`perform(@dvala.io.print, "hello")`:
```
["perform",
  ["effect", "dvala.io.print"],
  ["str", "hello"]]
```

`perform(@suspend)` (no payload):
```
["perform",
  ["effect", "suspend"],
  ["null"]]
```

No payload → `["null"]`. The effect expression can be any expression that evaluates to an effect value.

### Comparison with Current AST

**Current:** `["SpecialExpression", ["perform", effectNode, payload], pos]`
**Proposed:** `["perform", effect-expr, payload]`

Same structure, just unwrapped.

---

## 6. `handle...with`

### Syntax

```dvala
handle
  perform(@dvala.io.print, "hello")
with [(arg, eff, nxt) ->
  if eff == @dvala.io.print then null
  else nxt(eff, arg)
  end
] end
```

### Runtime AST

**Shape:** `["handle", [body-stmts], handlers-expr]`

```
["handle",
  [["perform",
    ["effect", "dvala.io.print"],
    ["str", "hello"]]],
  ["array",
    [["fn",
      ["arg", "eff", "nxt"],
      [["if",
        ["call", ["builtin", "=="],
          [["sym", "eff"], ["effect", "dvala.io.print"]]],
        ["null"],
        ["call", ["sym", "nxt"],
          [["sym", "eff"], ["sym", "arg"]]]]]]]]]
```

Body is an array of statements. Handlers is an expression evaluating to an array of handler functions.

### Comparison with Current AST

**Current:** `["SpecialExpression", ["handle", [body], handlers], pos]`
**Proposed:** `["handle", [body], handlers]`

Same shape, unwrapped.

---

## 7. `recur`

### Syntax

```dvala
loop (i = 0, acc = 0) ->
  if i >= 10 then acc
  else recur(i + 1, acc + i)
  end
```

### Runtime AST

**Shape:** `["recur", [arg-exprs]]`

`recur(i + 1, acc + i)`:
```
["recur",
  [["call", ["builtin", "+"], [["sym", "i"], ["num", 1]]],
   ["call", ["builtin", "+"], [["sym", "acc"], ["sym", "i"]]]]]
```

### Comparison with Current AST

**Current:** `["SpecialExpression", ["recur", [args]], pos]`
**Proposed:** `["recur", [args]]`

Identical shape, unwrapped.

---

## 8. `effect`

### Syntax

```dvala
@dvala.io.print
@suspend
@my.custom.effect
```

### Runtime AST

**Shape:** `["effect", name-string]`

```
["effect", "dvala.io.print"]
["effect", "suspend"]
["effect", "my.custom.effect"]
```

### Comparison with Current AST

**Current:** `["EffectName", "dvala.io.print", pos]`
**Proposed:** `["effect", "dvala.io.print"]`

Renamed from `EffectName` to `effect` for consistency with lowercase tag convention.

---

## 9. `array`

### Syntax

```dvala
[1, 2, 3]
[1, ...rest, 4]
```

### Runtime AST

**Shape:** `["array", [element-exprs]]`

`[1, 2, 3]`:
```
["array",
  [["num", 1],
   ["num", 2],
   ["num", 3]]]
```

`[1, ...rest, 4]` (spread):
```
["array",
  [["num", 1],
   ["spread", ["sym", "rest"]],
   ["num", 4]]]
```

### Comparison with Current AST

**Current:** `["SpecialExpression", ["array", [elements]], pos]`
**Proposed:** `["array", [elements]]`

Unwrapped. Spread elements use `["spread", expr]` instead of `["Spread", expr, pos]`.

---

## 10. `object`

### Syntax

```dvala
{ name: "alice", age: 30 }
{ ...base, name: "bob" }
```

### Runtime AST

**Shape:** `["object", [[key, value], ...]]` — array of key-value pairs.

`{ name: "alice", age: 30 }`:
```
["object",
  [["name", ["str", "alice"]],
   ["age", ["num", 30]]]]
```

`{ ...base, name: "bob" }` (spread):
```
["object",
  [["spread", ["sym", "base"]],
   ["name", ["str", "bob"]]]]
```

Keys are bare strings. Spread entries use `["spread", expr]` inline.

### Comparison with Current AST

**Current:** `["SpecialExpression", ["object", [key, val, key, val, ...]], pos]`
**Proposed:** `["object", [[key, val], [key, val], ...]]`

Flat interleaved key-value → paired. No more counting by twos. Current AST also uses a JS object for object destructuring patterns — replaced by `["object-pat", ...]`.

---

## 11. `parallel`

### Syntax

```dvala
parallel(fetchUsers(), fetchProducts(), fetchConfig())
```

### Runtime AST

**Shape:** `["parallel", [branch-exprs]]`

```
["parallel",
  [["call", ["sym", "fetchUsers"], []],
   ["call", ["sym", "fetchProducts"], []],
   ["call", ["sym", "fetchConfig"], []]]]
```

Branches are unevaluated expressions. The evaluator runs them concurrently.

### Comparison with Current AST

**Current:** `["SpecialExpression", ["parallel", [branches]], pos]`
**Proposed:** `["parallel", [branches]]`

Unwrapped.

---

## 12. `race`

### Syntax

```dvala
race(perform(@timeout, 5000), perform(@http.get, { url: url }))
```

### Runtime AST

**Shape:** `["race", [branch-exprs]]`

```
["race",
  [["perform", ["effect", "timeout"], ["num", 5000]],
   ["perform", ["effect", "http.get"],
     ["object", [["url", ["sym", "url"]]]]]]]
```

Same shape as `parallel`. Branches are unevaluated expressions. First to complete wins.

### Comparison with Current AST

**Current:** `["SpecialExpression", ["race", [branches]], pos]`
**Proposed:** `["race", [branches]]`

Unwrapped.

---

## Macro-Derivable Expressions

These are currently special expressions but could become macros in the future. The AST is cleaned up to match the same conventions — future-proof regardless of whether they stay as special expressions or become macros.

---

### `&&`

**Shape:** `["&&", left, right]`

`a && b`:
```
["&&", ["sym", "a"], ["sym", "b"]]
```

**If implemented as macro, expands to:**
```
["if", ["sym", "a"], ["sym", "b"], ["bool", false]]
```

---

### `||`

**Shape:** `["||", left, right]`

`a || b`:
```
["||", ["sym", "a"], ["sym", "b"]]
```

**If implemented as macro, expands to:**
```
["if", ["sym", "a"], ["bool", true], ["sym", "b"]]
```

---

### `??`

**Shape:** `["??", left, right]`

`a ?? b`:
```
["??", ["sym", "a"], ["sym", "b"]]
```

**If implemented as macro, expands to:**
```
["block",
  [["let", "v", ["sym", "a"]],
   ["if",
     ["call", ["builtin", "!="], [["sym", "v"], ["null"]]],
     ["sym", "v"],
     ["sym", "b"]]]]
```

---

### `loop`

**Shape:** `["loop", [[name, init-expr], ...], body]`

`loop (i = 0, acc = 0) -> if i >= 10 then acc else recur(i + 1, acc + i) end`:
```
["loop",
  [["i", ["num", 0]],
   ["acc", ["num", 0]]],
  ["if",
    ["call", ["builtin", ">="], [["sym", "i"], ["num", 10]]],
    ["sym", "acc"],
    ["recur",
      [["call", ["builtin", "+"], [["sym", "i"], ["num", 1]]],
       ["call", ["builtin", "+"], [["sym", "acc"], ["sym", "i"]]]]]]]
```

**If implemented as macro, expands to** immediately-invoked function:
```
["call",
  ["fn",
    ["i", "acc"],
    [["if",
      ["call", ["builtin", ">="], [["sym", "i"], ["num", 10]]],
      ["sym", "acc"],
      ["recur",
        [["call", ["builtin", "+"], [["sym", "i"], ["num", 1]]],
         ["call", ["builtin", "+"], [["sym", "acc"], ["sym", "i"]]]]]]]],
  [["num", 0], ["num", 0]]]
```

---

### `for`

**Shape:** `["for", [clauses], body]`

Each clause is one of:
- Binding: `["bind", name, collection]`
- Let: `["let", name, expr]`
- When (filter): `["when", expr]`
- While (stop): `["while", expr]`

`for (x in [1, 2, 3]) -> x * 2`:
```
["for",
  [["bind", "x", ["array", [["num", 1], ["num", 2], ["num", 3]]]]],
  ["call", ["builtin", "*"], [["sym", "x"], ["num", 2]]]]
```

`for (x in range(10) let sq = x ^ 2 when isOdd(x) while sq < 100) -> sq`:
```
["for",
  [["bind", "x", ["call", ["builtin", "range"], [["num", 10]]]],
   ["let", "sq", ["call", ["builtin", "^"], [["sym", "x"], ["num", 2]]]],
   ["when", ["call", ["builtin", "isOdd"], [["sym", "x"]]]],
   ["while", ["call", ["builtin", "<"], [["sym", "sq"], ["num", 100]]]]],
  ["sym", "sq"]]
```

Nested for (`for (x in xs, y in ys)`) produces multiple `"bind"` clauses.

---

### `match`

**Shape:** `["match", expr, [[pattern, body, guard-or-null], ...]]`

`match x case 0 then "zero" case _ then "other" end`:
```
["match",
  ["sym", "x"],
  [[["literal", ["num", 0]], ["str", "zero"], null],
   [["wildcard"], ["str", "other"], null]]]
```

`match value case x when x < 0 then "negative" case _ then "other" end`:
```
["match",
  ["sym", "value"],
  [[["bind", "x"],
    ["str", "negative"],
    ["call", ["builtin", "<"], [["sym", "x"], ["num", 0]]]],
   [["wildcard"], ["str", "other"], null]]]
```

Match patterns:
- `["literal", value-node]` — matches a literal value
- `["wildcard"]` — matches anything
- `["bind", name]` — matches anything, binds to name
- `["array-pat", [...patterns]]` — matches array structure
- `["object-pat", [...entries]]` — matches object structure

Same pattern sub-language as `let` destructuring, plus `["literal", ...]`, `["wildcard"]`, and `["bind", ...]`.

Each case is `[pattern, body, guard]` — guard is an expression or `null`.
