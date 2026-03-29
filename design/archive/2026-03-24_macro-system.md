  # Dvala Macro System

## Vision

Macros are functions that receive AST and return AST. They use the same call syntax, pipe syntax, and effect system as everything else in Dvala. No special annotation syntax. No separate macro phase. The language gains one keyword (`macro`) and one code template syntax (triple backticks). Everything else already exists.

## Motivation

- **Auto-wrapping functions** — memoization, logging, tracing, validation
- **Code generation** — boilerplate reduction from schemas, configs, runtime data
- **DSLs** — domain-specific abstractions built on Dvala
- **Language extension** — core operators like `&&`, `||`, `??` can be macros
- **Tooling** — the bundler itself is a macro (AST in → transformed AST out) — see [bundler plan](2026-03-27_bundler.md)

## Design Principles

1. **Macros are just functions** — defined with `macro` keyword, called with normal syntax
2. **AST is just Dvala data** — arrays and primitives, pattern-matchable
3. **Macro expansion is an effect** — the evaluator performs `@dvala.macro.expand`, the host decides how
4. **Zero new application syntax** — call syntax and `|>` pipe work unchanged
5. **Hygienic by default** — macro-generated bindings are auto-gensymed
6. **Parsed at parse time** — code templates are parsed by the JS parser, runtime only manipulates pre-parsed AST

---

## Part 1: Macro Definition

### The `macro` keyword

The only new keyword. Tells the evaluator: when this function is called, pass arguments as AST instead of evaluating them.

```dvala
let memoize = macro@mylib.memoize (ast) -> do
  // ast is the AST of the argument, not its evaluated value
  // returns new AST
end;
```

The first argument to `macro` is a **qualified name** — a dotted DNS-style identifier that uniquely identifies the macro across platforms and serialization boundaries. This is the same naming convention used by effects (see [QualifiedName design](2026-03-25_qualified-name.md)).

The qualified name is required for macros that need to be identifiable by host-level handlers. Anonymous macros (without a qualified name) are also allowed for local/throwaway use:

```dvala
// Named macro — identifiable by host handlers
let memoize = macro@mylib.memoize (ast) -> ...;

// Anonymous macro — local use only
let id = macro (ast) -> ast;
```

### Named vs anonymous macro expansion

Named macros (with a qualified name) emit `@dvala.macro.expand` when called — the host can intercept, log, cache, or sandbox the expansion. Anonymous macros are called directly with no effect — they're invisible to the host and skip the effect overhead entirely.

| Macro type | Expansion mechanism | Host visible | Effect overhead |
|---|---|---|---|
| Named: `macro@name (ast) -> ...` | `perform(@dvala.macro.expand, { fn, args })` | Yes | Yes |
| Anonymous: `macro (ast) -> ...` | Direct call (no effect) | No | None |

Giving a macro a qualified name is an explicit opt-in to host observability. Anonymous macros are local, fast, and private.

A macro is a distinct type:

```dvala
typeOf(memoize)           // → "macro"
isMacro(memoize)          // → true
isFunction(memoize)       // → false
qualifiedName(memoize)    // → "mylib.memoize"
qualifiedName(id)         // → null (anonymous)
doc(memoize)              // → { type: "macro", description: "...", ... }
```

### Core operators as macros

`&&`, `||`, `??` need short-circuit evaluation — they must not evaluate all arguments. This is exactly what macros do.

```dvala
let && = macro (a, b) -> ```if ${a} then ${b} else false end```;
let || = macro (a, b) -> ```if ${a} then true else ${b} end```;
let ?? = macro (a, b) -> ```do let v = ${a}; if v != null then v else ${b} end end```;
```

Users write `a && b`. They don't know it's a macro. The parser expands core macros at parse time — zero runtime cost.

---

## Part 2: Macro Application

### No new syntax

Macros are called like functions. The evaluator resolves the callee, sees it's a macro, and passes arguments as AST instead of evaluating them.

```dvala
// Direct call — looks like a function call
memoize(let fib = (n) -> if n <= 1 then n else fib(n - 1) + fib(n - 2) end)

// With runtime arguments — evaluated args first, AST target last
model({ name: "string", age: "number" }, let User = null)

// Block
saga({ compensate: { debit: creditBack } }, do
  perform(@bank.debit, { from: from, amount: amount });
  perform(@bank.credit, { to: to, amount: amount })
end)
```

### Pipe syntax

`|>` is desugared at parse time: `a |> b` → `b(a)`. This makes it work with both functions and macros.

```dvala
// Value pipe (function on right — existing behavior)
5 |> add1 |> mul2           // → mul2(add1(5))

// Macro pipe (macro on right — works for free)
(let fib = (n) -> ...) |> memoize

// Chaining macros
((n) -> ...) |> memoize |> trace
```

No `~>` operator needed. `|>` handles both because the desugaring happens before the evaluator distinguishes functions from macros.

### `let` as a macro argument

Dvala already parses `let` inside parentheses as an expression:

```dvala
memoize(let fib = (n) -> n + 1)   // parses fine — let is an expression
```

This means macros that transform bindings need no special syntax.

---

## Part 3: Code Templates — Triple Backticks

### Syntax

Triple backticks delimit a code template. The content is parsed as Dvala code at parse time. The result is AST data, not evaluated code.

````dvala
// Simple — single expression
let && = macro (a, b) -> ```if ${a} then ${b} else false end```;

// Multi-line
let memoize = macro (ast) -> do
  let name = getName(ast);
  let value = getValue(ast);

  ```
    let ${name} = do
      let cache = {};
      let fn = ${value};
      (...args) -> do
        let key = str(args);
        get(cache, key) ?? do
          let r = apply(fn, args);
          set(cache, key, r);
          r
        end
      end
    end
  ```
end;
````

### Interpolation: `${expr}`

Inside a code template, `${expr}` is an AST splice. The expression is evaluated at runtime, and the resulting AST node is inserted into the template.

- `${expr}` evaluates to a **single AST node** → inserted at that position
- `${expr}` evaluates to an **array of AST nodes** → all spliced in (implicit spread)
- Works in **any position** — bindings, parameters, expressions, operators — because the parser knows it's inside a code template

The detection is unambiguous: AST nodes are arrays starting with a string tag (`["Number", 42, 0]`). An array of AST nodes starts with an array (`[["Number", ...], ...]`).

### Nesting

Triple backticks can nest. Use 4+ backticks for the outer level:

`````dvala
let makeOperator = macro (ast) -> do
  let name = getOperatorName(ast);
  let impl = getImpl(ast);
  ````
    let ${name} = macro (a, b) -> ```${impl}(${a}, ${b})```
  ````
end;
`````

Rule: opening delimiter is N backticks (N ≥ 3). Closing delimiter must be exactly N. Inner code can freely contain fewer backticks.

### Parse-time processing

The content between triple backticks is parsed as Dvala code **at parse time** by the JS parser. The parser produces an AST node representing the template, with splice markers where `${expr}` appears. At runtime, the evaluator:

1. Evaluates each splice expression in the current scope
2. Inserts results into the pre-parsed AST structure
3. Returns the assembled AST data

**KMP never parses code templates.** It receives pre-parsed AST and just fills in the splice values. This keeps the parser JS-only.

---

## Part 4: AST Representation

Dvala's AST is built solely from arrays and primitives — no objects, no special wrapper types. Like Lisp's S-expressions, the AST is just Dvala data.

### Position Handling

Positions (source locations) are **separated from the AST structure**. The AST that macros see and produce is clean data with no position noise.

**Three layers:**

**1. Wire/serialized format** — position at index 0, tag at index 1, data from index 2:
```json
[10, "if",
  [12, "bool", true],
  [15, "num", 1],
  [20, "num", 2]
]
```
Index 0 is always a number (position) or null. Index 1 is always a string (tag). Data starts at index 2. Unambiguous — no need to know node arity. Compact — no extra nesting. Format detection: `typeof node[0] === "number"` → serialized, `typeof node[0] === "string"` → runtime. This is the contract between parser output, bundles, and platform runtimes.

**2. JS runtime** — clean arrays + Symbol property:
```js
const POS = Symbol.for('dvala:pos');

// After unwrapping serialized format:
let node = ["if", cond, then, else];
node[POS] = { line: 5, col: 3 };
```
The Symbol property is invisible to: `JSON.stringify`, Dvala array operations, `match` pattern matching, spread/iteration. Position travels with the node (same reference survives macro splicing) but never appears in the data. Macro-generated nodes simply have no Symbol — no position, as expected.

**3. KMP runtime** — receives serialized format, stores positions however Kotlin needs (data class, HashMap, etc.). Decided later — the wire format is the contract.

**Why this design:**
- **Macros see clean arrays** — `["if", cond, then, else]`, no position to skip
- **Pattern matching is clean** — `case ["if", c, t, e] then ...`, no `_` placeholder
- **Spliced nodes keep positions** — same array reference, Symbol property survives
- **Generated nodes have no positions** — correct by default, MacroEvalFrame handles error attribution
- **Wire format is platform-agnostic** — position at index 0 works everywhere
- **Format detection** — `typeof [0] === "number"` → serialized; `typeof [0] === "string"` → runtime
- **Simple unwrap** — `node.slice(1)` strips position, `node[0]` reads it

### AST Node Types (Runtime — Clean Arrays)

Position-free. This is what macros see and produce.

```
// Literals
["num", <value>]
["str", <value>]
["bool", <value>]
["null"]

// Identifiers
["sym", <name>]
["builtin", <name>]
["effect", <name>]

// Function call
["call", <fn-node>, [<arg-nodes>...]]

// Fundamental special expressions (12 irreducible primitives)
["let", <pattern>, <value>]
["if", <cond>, <then>, <else>]
["fn", [<params>], [<body-exprs>]]
["block", [<statements>...]]
["perform", <effect-expr>, <payload>]
["handle", [<body-stmts>], <handlers-expr>]
["recur", [<args>...]]
["array", [<elements>...]]
["object", [[<key>, <val>], ...]]
["parallel", [<branches>...]]
["race", [<branches>...]]

// Macro call (before expansion)
["macro-call", <fn-node>, [<arg-nodes>...]]
```

### Serialized Format (Wire)

Position at index 0, tag at index 1, data from index 2. Position is an integer (token index) or null.

```json
[10, "if",
  [12, "bool", true],
  [15, "num", 1],
  [20, "num", 2]
]
```

Unwrap to runtime: strip index 0 from each node recursively → `["if", ["bool", true], ["num", 1], ["num", 2]]`

### Macro-Derivable Expressions

The following are NOT in the core AST. They are macros that expand to the primitives above:

- `&&` → expands to `["if", a, b, ["bool", false]]`
- `||` → expands to `["if", a, ["bool", true], b]`
- `??` → expands to `["block", [["let", "v", a], ["if", ["call", ["builtin", "!="], [["sym", "v"], ["null"]]], ["sym", "v"], b]]]`
- `loop` → expands to immediately-invoked function with `recur`
- `for` → expands to loop + array accumulation
- `match` → expands to nested if + let destructuring

### AST Module

`import("ast")` provides constructors, predicates, and accessors:

```dvala
let { node, isLet, isFunction, getName, getBody, getParams, getValue, prettyPrint } = import("ast");

// Constructors — produce clean runtime AST
node.number(42)                    // → ["num", 42]
node.string("hello")              // → ["str", "hello"]
node.boolean(true)                // → ["bool", true]
node.symbol("x")                  // → ["sym", "x"]
node.builtin("+")                 // → ["builtin", "+"]
node.effect("dvala.io.print")     // → ["effect", "dvala.io.print"]
node.call(fn, args)               // → ["call", fn, args]
node.let(name, value)             // → ["let", name, value]
node.if(cond, then, else_)        // → ["if", cond, then, else_]
node.fn(params, body)             // → ["fn", params, body]
node.block(statements)            // → ["block", statements]

// Predicates
isLet(ast)                         // → true/false
isFunction(ast)                    // → true/false

// Accessors
getName(letNode)                   // → "x"
getValue(letNode)                  // → value AST node
getBody(fnNode)                    // → body AST nodes
getParams(fnNode)                  // → parameter nodes

// Debugging
prettyPrint(ast)                   // → readable Dvala source string
```

Code templates (triple backticks) are the ergonomic way to build AST. The `ast` module is for programmatic tree analysis and construction when templates aren't enough.

### Pattern Matching on AST

Dvala's `match` with array destructuring works naturally on AST tuples:

```dvala
let myMacro = macro (ast) ->
  match ast
    case ["let", pattern, value] then
      transformLet(pattern, value)
    case ["call", fn, args] then
      transformCall(fn, args)
    case _ then
      throw("myMacro: unsupported AST shape")
  end;
```

---

## Part 5: Macro Expansion as an Effect

### Core Mechanism

When the evaluator encounters a call to a macro, it performs an effect:

```
┌──────────────────────────────────────────────────────┐
│ evaluator encounters: memoize(let fib = ...)         │
├──────────────────────────────────────────────────────┤
│ 1. Resolve "memoize" in scope → sees it's a macro    │
│ 2. Collect arguments as AST (don't evaluate)         │
│ 3. perform(@dvala.macro.expand, {                    │
│      fn: memoize,                                    │
│      args: [targetAst]                               │
│    })                                                │
│    → host returns expanded AST                       │
│ 4. Evaluate the returned AST in the calling scope    │
└──────────────────────────────────────────────────────┘
```

The evaluator doesn't know how to expand macros. It asks the host via an effect. The host has full control.

The payload `{ fn, args }` contains the macro function (with its qualified name accessible via `qualifiedName(fn)`) and the raw AST arguments. Host handlers can dispatch on the macro's qualified name to apply different strategies per macro — caching, logging, sandboxing, or custom expansion.

### Host Strategies

The host provides a handler function `(arg, eff, nxt) -> value` for `@dvala.macro.expand`. The `arg` is `{ fn, args }` where `fn` is the macro function and `args` is the list of AST arguments.

```dvala
// Default: just call the function
let defaultMacroHandler = (arg, eff, nxt) ->
  if eff == @dvala.macro.expand then apply(get(arg, "fn"), get(arg, "args"))
  else nxt(eff, arg)
  end;

// Caching: expand once, reuse
let cachingMacroHandler = (arg, eff, nxt) ->
  if eff == @dvala.macro.expand then do
    let key = hash(get(arg, "fn"), get(arg, "args"));
    get(cache, key) ?? do let r = apply(get(arg, "fn"), get(arg, "args")); set(cache, key, r); r end
  end
  else nxt(eff, arg)
  end;

// Logging: inspect every expansion
let loggingMacroHandler = (arg, eff, nxt) ->
  if eff == @dvala.macro.expand then do
    let r = apply(get(arg, "fn"), get(arg, "args"));
    perform(@dvala.io.print, prettyPrint(r));
    r
  end
  else nxt(eff, arg)
  end;

// Sandboxed: whitelist by qualified name
let sandboxedMacroHandler = (arg, eff, nxt) ->
  if eff == @dvala.macro.expand then do
    let matcher = qualifiedMatcher("mylib.*");
    if not(matcher(get(arg, "fn"))) then throw("macro not permitted") end;
    apply(get(arg, "fn"), get(arg, "args"))
  end
  else nxt(eff, arg)
  end;
```

### Three Expansion Tiers

| Tier | Expanded by | `@dvala.macro.expand` | Runtime cost |
|------|------------|-----------------|-------------|
| Core macros (`&&`, `\|\|`, `??`) | Parser (parse time) | No | Zero |
| Anonymous macros (`macro (ast) -> ...`) | Evaluator, direct call | No | Function call only |
| Named macros (`macro@name (ast) -> ...`) | Evaluator via effect | Yes | Effect + function call |

The bundler can pre-expand user macros, promoting them to the zero-cost tier in bundled output.

### Macros Can Perform Effects During Expansion

Since expansion is an effect handled by the host, the macro function runs in the host's effect context. Macros can fetch data, read config, or consult external services:

```dvala
let fromSchema = macro (schemaUrl, ast) -> do
  let schema = perform(@http.get, { url: schemaUrl });
  // generate code from runtime schema data
end;

fromSchema("https://api.example.com/schema.json", let Client = null)
```

---

## Part 6: The Bundler as a Macro

The bundler is a macro — AST in, transformed AST out:

1. Walks the AST, finds `import()` → performs `@import.resolve` → inlines module AST
2. Finds user macro calls → performs `@macro.expand` → inlines expanded AST
3. Removes unused bindings
4. Returns self-contained AST

The build pipeline is composable:

```dvala
(entryAst) |> bundle({ target: "kmp" }) |> treeShake |> minify
```

Custom bundler plugins are macros. The bundler host provides `@macro.expand`, `@import.resolve`, and `@bundler.emitAsset` handlers.

The bundler can selectively expand: eager-expand macros without runtime dependencies, leave runtime-dependent macros in the output for the runtime host to handle.

---

## Part 7: Hygiene

### The Problem

Macros generate code evaluated in the caller's scope. Name collisions are possible:

```dvala
let result = 100;
addLogging(let f = (x) -> x + result)   // macro introduces its own "result"
```

### Solution: Automatic Gensym

Bindings introduced inside code templates (triple backticks) are automatically renamed to unique symbols:

````dvala
let addLogging = macro (ast) -> do
  let name = getName(ast);
  let value = getValue(ast);
  ```
    let ${name} = (...args) -> do
      let result = apply(${value}, args);   // "result" is auto-gensymed
      perform(@dvala.io.print, str(result));
      result                                 // same gensymed name
    end
  ```
end;
````

**Rule:** Literal names written in the template body are auto-gensymed. Spliced values from `${expr}` retain their original identity (caller's names or AST from input).

No `gensym` function needed for the common case. The template handles it.

---

## Part 8: Debugging

### `macroexpand`

`macroexpand` is itself a macro. It performs the expansion but returns the AST instead of evaluating it:

```dvala
macroexpand(memoize(let fib = (n) -> n * 2))
// → returns the expanded AST data

macroexpand(memoize(let fib = (n) -> n * 2)) |> prettyPrint
// → prints readable Dvala source of the expansion
```

How it works:

```
1. Resolve memoize                         ✓
2. Collect arguments as AST                ✓
3. perform(@macro.expand, { fn, args })    ✓ → gets expanded AST
4. Evaluate the expanded AST               ✗ ← macroexpand stops here
                                               returns AST as data
```

### Error Attribution

When macro-generated code throws, the stack trace shows both the generated code and the macro call site:

```
Error: division by zero
  at <macro-generated>: let x = 1 / 0
  expanded from line 5: myMacro(let y = 42)
```

The `MacroEvalFrame` stays on the evaluator's frame stack during evaluation of expanded code. It carries the source location of the original macro call. Generated code has position 0 — the error reporter walks up and finds the macro origin.

---

## Part 9: Continuations and Wire Format

### Unexpanded Macros in Continuations

If a suspension occurs before the evaluator reaches a macro call later in the code, that call is still raw AST in the continuation:

```dvala
memoize(let f = (x) -> x + 1);   // expanded before suspension
perform(@suspend);                 // continuation captured here
memoize(let g = (x) -> x * 2);   // still unexpanded in the continuation
```

This means:
- The `macroApply` AST node type must be part of the wire format
- KMP must handle `@macro.expand` when resuming continuations that contain unexpanded macros
- The macro function must be serializable (it's a closure in scope)

### Active Macro Frames Never Serialize

Macro expansion via `@macro.expand` is synchronous — the effect completes before the expanded code begins evaluating. The `MacroEvalFrame` is transient. A suspension can only occur during evaluation of already-expanded code, so macro-internal frames never appear in serialized continuations.

---

## Part 10: KMP Considerations

### What KMP Needs

- Recognize macro calls → perform `@macro.expand` effect
- Evaluate code template nodes (walk pre-parsed AST, fill in splice values)
- `ast` module (constructors, predicates, accessors)
- Hygiene (gensym during template evaluation)
- Default `@macro.expand` handler (call the function, return the result)

### What KMP Does NOT Need

- Parser — code templates are pre-parsed AST
- Build-time expansion — that's the bundler's job
- Any macro-specific frame serialization — macro frames don't survive suspension

### Cross-Platform

- JS bundles for KMP: bundler pre-expands macros → KMP never sees them
- Continuation with macros crosses platforms: KMP handles `@macro.expand` on resume
- KMP host can delegate to JS for complex macros requiring the parser

---

## Part 11: `|>` Parse-Time Desugaring

`|>` is desugared at parse time: `a |> b` → `b(a)`.

```dvala
5 |> add1 |> mul2
// desugars to: mul2(add1(5))

(let fib = (n) -> ...) |> memoize
// desugars to: memoize(let fib = (n) -> ...)

((n) -> ...) |> memoize |> trace
// desugars to: trace(memoize((n) -> ...))
```

For normal functions: identical to current runtime behavior.
For macros: works for free — the evaluator sees `memoize(expr)` and handles it as a macro call.

Partial application continues to work:

```dvala
5 |> add(_, 10)
// desugars to: add(_, 10)(5)
// partial application produces a function, called with 5
```

---

## Part 12: Interaction with Existing Features

### Effects

Macro-generated code performs effects. The caller controls handling:

```dvala
// Macro generates @dvala.io.print effects
trace(let fib = (n) -> ...)

// Caller silences them
handle
  fib(5)
with [(arg, eff, nxt) ->
  if eff == @dvala.io.print then null
  else nxt(eff, arg)
  end
] end

// Caller captures them
let log = [];
handle
  fib(5)
with [(arg, eff, nxt) ->
  if eff == @dvala.io.print then set(log, count(log), arg)
  else nxt(eff, arg)
  end
] end
```

### Modules

Macros can be defined in modules and imported:

```dvala
let { memoize, trace, saga } = import("macros");
memoize(let fib = (n) -> ...)
```

### Pattern Matching

Dvala's `match` with array destructuring is natural for pattern-matching on AST nodes. The tuple-based AST format and pattern matching work together — similar to Lisp's list destructuring.

---

## Part 13: Implementation Plan

### Phase 1 — Foundation ✅ DONE

1. ✅ `macro` keyword in parser — `parseMacro.ts` produces `Macro` AST nodes
2. ✅ Evaluator: when calling a macro, pass arguments as AST (not evaluated)
3. ✅ `@dvala.macro.expand` effect — `callMacro` emits `PerformStep` for named macros, default handler in `dispatchPerform` calls the macro directly.
4. ✅ `typeOf(macro)` → `"macro"`, `isMacro()` predicate, `isFunction()` excludes macros
5. ✅ Tests: 10 tests in `__tests__/macro.test.ts` covering definition, invocation, type checks
6. ✅ Qualified name for macros — `macro@qualified.name (ast) -> ...` syntax. See [QualifiedName design](2026-03-25_qualified-name.md). Also added `qualifiedName()` builtin.

**Implementation notes:**
- `MacroFunction` type added to `parser/types.ts` (functionType: `'Macro'`)
- `NodeTypes.Macro` in `constants.ts`
- Macro check in `stepNormalExpression()` — resolves callee, checks `isMacroFunction`, branches
- `MacroEvalFrame` evaluates returned AST in calling scope
- `parseLambdaFunction` rejects `(singleParam) ->` — `parseMacro` uses `parseFunctionArguments` directly
- Macros only intercept named calls to `UserDefinedSymbol`. Expression-based callees go through normal eval.
- `callMacro` emits `perform(@dvala.macro.expand, { fn, args })` — effect payload contains the macro function (with qualified name) and raw AST arguments.

### Phase 2 — Code Templates ✅ DONE

1. ✅ Triple backtick syntax in tokenizer (`CodeTemplate` token) and parser (`CodeTmpl` + `Splice` node types)
2. ✅ `${expr}` splice markers in code templates — parsed as `Splice` nodes, evaluated at runtime
3. ✅ N-backtick nesting (3+ backticks, match count)
4. ✅ Evaluator: `CodeTemplateBuildFrame` evaluates splices sequentially, `astToData` walks AST replacing Splice nodes
5. ✅ Implicit spread detection — `isSpliceSpread` checks if value starts with array (array of nodes) vs string (single node)
6. ✅ Tests: 17 tests in `__tests__/code-template.test.ts` — basic syntax, splicing, implicit spread, macro integration, N-backtick nesting

**Implementation notes:**
- Tokenizer: `tokenizeCodeTemplate` in `tokenizers.ts` — detects 3+ backticks, scans with `${...}` interpolation, closes on matching count
- Parser: `parseCodeTemplate.ts` — replaces `${expr}` with placeholder symbols, parses combined source, walks AST to replace placeholders with `Splice` nodes
- Evaluator: `CodeTemplateBuildFrame` collects splice values, `astToData` converts AST to data with splices filled in, `convertArrayPayload` handles implicit spread
- `${expr}` currently works in expression positions only — binding-position splicing deferred to hygiene phase

**Key design decisions (from earlier discussion):**
- Triple backticks (`\`\`\`...\`\`\``) — visually distinct from template strings, no conflict with future tagged templates
- `${expr}` reuses existing interpolation syntax — zero new splice syntax
- Parser switches to "code template mode" inside triple backticks — `${expr}` allowed in any position (bindings, params, operators)
- Pre-parsed at parse time: the JS parser parses the content as Dvala code with splice markers. KMP receives pre-parsed AST.
- N-backtick nesting: outer uses more backticks than inner (like markdown code fences)

### Phase 3 — AST Module ✅ DONE

1. ✅ `import("ast")` — constructors (`num`, `strNode`, `bool`, `nil`, `sym`, `builtin`, `effectNode`, `call`, `ifNode`, `block`), predicates (`isNum`, `isStr`, `isSym`, `isBuiltin`, `isCall`, `isIf`, `isBlock`, `isLet`, `isFn`, `isBool`, `isNil`, `isEffectNode`, `isAstNode`), accessors (`nodeType`, `payload`)
2. ✅ `prettyPrint` — AST data → readable Dvala source (numbers, strings, booleans, symbols, infix operators, function calls, if, block, let, function, perform, array, effect)
3. ✅ Tests: 27 tests in `__tests__/ast-module.test.ts` — constructors, predicates, accessors, prettyPrint, macro round-trip

**Implementation notes:**
- Module: `src/builtin/modules/ast/index.ts`
- Some names suffixed to avoid clashing with core builtins: `strNode` (vs `str`), `effectNode` (vs `effect`), `isEffectNode` (vs `isEffect`)
- Registered in `allModules.ts`, `reference/index.ts`, `reference/api.ts`
- Category `'ast'` added to `interface.ts`

### Phase 4 — Hygiene ✅ DONE

1. ✅ Auto-gensym for bindings inside code templates — `buildRenameMap` collects literal binding names, `gensym` generates unique names
2. ✅ Spliced values retain original identity — Splice nodes bypass the rename map
3. ✅ Tests: 4 hygiene tests in `__tests__/code-template.test.ts` — param capture, let binding collision, spliced identity, multiple bindings

**Implementation notes:**
- `buildRenameMap` walks template AST collecting symbol names from Let targets and Function/Macro params, skipping Splice nodes
- `gensym(name)` generates `__gensym_<name>_<counter>__` — unique per template evaluation
- `astToData` and `convertArrayPayload` accept optional `renameMap` — literal Sym nodes matching the map are renamed
- `CodeTemplateBuildFrame` carries the `renameMap` so it persists across splice evaluations

### Phase 5 — `|>` Desugaring ✅ DONE

1. ✅ Parser: `a |> b` now produces `["Call", [b, [a]], id]` instead of `["Call", ["|>", [a, b]]]`
2. ✅ All existing `|>` usage produces identical results (32499 tests pass)
3. ✅ Prefix form `|>(a, b)` removed — `|>` is now purely a parser construct

**Implementation notes:**
- One-line change in `fromBinaryOperatorToNode` in `helpers.ts` — `|>` case now emits `["Call", [right, [left]]]`
- Removed `|>` dvalaImpl from `functional.dvala` — no longer needed
- `|>` builtin evaluate stub remains for docs/reference but throws if called directly

### Phase 6 — Core Macros (partial)

1. ⏳ Implement `&&`, `||`, `??` as macros — deferred (performance concern)
2. ✅ `macroexpand` builtin — calls macro body directly, returns expanded AST as data
3. ⏳ Expansion depth limit — deferred
4. ✅ Tests: 4 macroexpand tests in `__tests__/macro.test.ts`

**Implementation notes:**
- `macroexpand` is a core builtin handled in the evaluator's `dispatchCall`
- Calls `setupUserDefinedCall` on the macro's `evaluatedfunction` without `MacroEvalFrame`
- Result is the expanded AST as data, not evaluated code

### Phase 7 — Bundler Integration

Extracted to separate plan: [2026-03-27_bundler.md](2026-03-27_bundler.md)

### Phase 8 — Standard Macro Library

Extracted to separate plan: [2026-03-27_standard-macro-library.md](2026-03-27_standard-macro-library.md)

---

## New Syntax Summary

| Syntax | Purpose |
|--------|---------|
| `macro` keyword | Macro function definition |
| ` ``` ` ... ` ``` ` | Code template (AST literal with splicing) |
| `${expr}` inside ` ``` ` | AST splice (single node or implicit spread) |

Everything else — call syntax, `|>` pipe, `@macro.expand` effect, pattern matching on AST — uses existing Dvala features.

---

## Use Cases

### Automatic Parallelization

A macro that analyzes data dependencies in a block and rewrites independent operations to run in parallel:

````dvala
autoParallel(do
  let users = perform(@http.get, { url: "/api/users" });
  let products = perform(@http.get, { url: "/api/products" });
  let config = perform(@http.get, { url: "/api/config" });
  let recommendations = recommend(users, products);
  let dashboard = buildDashboard(recommendations, config);
  dashboard
end)
````

The macro builds a dependency graph from variable references, groups independent operations, and wraps them in `parallel()`. Effect handlers apply uniformly — retry, auth, rate limiting.

### Suspendable Workflow DSL

A macro that turns declarative step definitions into continuation-aware code:

````dvala
workflow(do
  step("review", -> perform(@approval.request, doc));
  step("sign", -> perform(@signature.request, { doc: doc, signer: signer }));
  step("archive", -> perform(@storage.put, { target: "archive", doc: doc }))
end)
````

Each step becomes a suspension point. The host serializes continuations to a database. Resume days later on a different server.

### Schema-Driven Code Generation

Runtime macro with arguments — generates validators, accessors, and constructors from a schema:

````dvala
let schema = perform(@config.load, "user-schema.json");

model(schema, let User = null)

// Generates: createUser(), validateUser(), getName(), getAge(), getEmail()
// Validation performs @validation.error effects — caller controls handling
````

### Protocol State Machine

A macro that generates a state machine from a declarative definition. Each state is a `match` case, each transition is a `recur`, each event wait is a `perform` that can suspend:

````dvala
let orderStates = {
  initial: "pending",
  states: {
    pending: { on: { pay: "paid", cancel: "cancelled" } },
    paid: { on: { ship: "shipped", refund: "refunded" } },
    shipped: { on: { deliver: "delivered" } },
    refunded: { final: true },
    cancelled: { final: true }
  }
};

stateMachine(orderStates, let processOrder = null)
````

### Contract Programming

A macro that injects precondition, postcondition, and invariant checks as effects:

````dvala
contract({
  pre: (amount, account) -> amount > 0 && account.balance >= amount,
  post: (result, amount, account) -> result.balance == account.balance - amount
}, let withdraw = (amount, account) -> do
  { ...account, balance: account.balance - amount }
end)
````

Violations perform `@contract.violation` — the caller decides: throw, log, or collect.

### Saga / Compensation

A macro that rewrites a function body so each effect is independently tracked with compensation on failure:

````dvala
saga({
  compensate: {
    debit: (p) -> perform(@bank.credit, p),
    credit: (p) -> perform(@bank.debit, p)
  }
}, let transfer = (from, to, amount) -> do
  perform(@bank.debit, { from: from, amount: amount });
  perform(@bank.credit, { to: to, amount: amount });
  perform(@notify, { to: to, msg: `Received ${amount}` })
end)
````

### Reactive Dataflow

A macro that analyzes variable dependencies and rewrites them into a reactive graph:

````dvala
reactive(do
  let width = 10;
  let height = 20;
  let area = width * height;
  let perimeter = 2 * (width + height);
  let summary = `${area}m² (${perimeter}m perimeter)`;
end)
````

### Time-Travel Debugging

A macro that records every binding as a continuation snapshot:

````dvala
timeTravel(do
  let x = 1;
  let y = x + 1;
  let x = x * 10;
  let z = x + y;
  z
end)
````

Each snapshot IS a continuation. "Go back to step 3" = deserialize that continuation and resume.

### Probabilistic Programming

A macro that rewrites `sample()` calls into effects, enabling both simulation and inference:

````dvala
probabilistic(do
  let temp = sample(gaussian(20, 5));
  let sunny = sample(bernoulli(if temp > 25 then 0.8 else 0.3));
  let sales = if sunny then sample(gaussian(200, 30)) else sample(gaussian(80, 20));
  sales
end)
````

Same model code, different handler → simulation vs inference.

### Musical Score DSL

A macro that turns declarative notation into timed effect events:

````dvala
music({ bpm: 120 }, do
  let melody = seq(note(C4, quarter), note(E4, quarter), note(G4, half));
  let bass = seq(note(C2, whole), note(G2, whole));
  parallel(melody, bass)
end)
````

Handler decides output: Web Audio, MIDI, sheet music SVG, or WAV.

---

## Common Thread

All use cases share one insight: **macros generate effects, not side effects.** The macro author decides *what* happens. The caller decides *how* it's handled. This composability is what makes Dvala macros more powerful than macros in non-effect languages.

---

## Value Proposition: Lisp's Power, Without Lisp's Problems

### The Goal

Dvala's macro system aims to be **as expressive as Lisp macros** — the gold standard for metaprogramming — while eliminating the known pain points that have plagued Lisp macro systems for decades.

### What Lisp Gets Right (and Dvala Matches)

| Capability | Lisp | Dvala |
|---|---|---|
| Code is data | S-expressions (lists) | AST tuples (arrays) |
| Code templating | Quasiquote `` ` `` + unquote `,` | Triple backticks + `${expr}` |
| Splice lists | `,@expr` | Implicit spread (array detection) |
| Full language during expansion | Yes (`defmacro` body is Lisp) | Yes (`macro` body is Dvala) |
| Define new control flow | `and`, `or`, `when`, `unless` | `&&`, `\|\|`, `??` |
| Define new operators | Yes | Yes |
| Transparent call syntax | `(memoize (defun ...))` | `memoize(let fib = ...)` |
| Debug expansions | `macroexpand` | `macroexpand` (also a macro) |
| Pattern match on code | `car`/`cdr`/`destructuring-bind` | `match` with array destructuring |

Full expressiveness parity. Anything you can write as a Lisp macro, you can write as a Dvala macro.

### What Lisp Gets Wrong (and Dvala Fixes)

**1. Unhygienic by default**

Lisp (Common Lisp): macros can accidentally capture or shadow variables in the caller's scope. The fix is manual `gensym` calls — tedious and easy to forget.

Dvala: bindings inside code templates are **auto-gensymed**. Spliced symbols from input AST keep the caller's names. Hygiene is the default. No `gensym` needed for the common case.

**2. Expansion is a black box**

Lisp: macro expansion happens inside the compiler. You can't intercept it, log it, cache it, sandbox it, or redirect it. `macroexpand` is the only window in.

Dvala: expansion is an **effect** (`@macro.expand`). The host can intercept, log, cache, sandbox, deny, or delegate expansion. The same effect system that handles I/O handles macros. Expansion is first-class, observable, and controllable.

**3. Compile-time only**

Lisp: macros run at compile time. They cannot access runtime values. A macro that generates code from a database schema must read the schema at compile time or punt to runtime functions.

Dvala: macros run at **evaluation time** (via `@macro.expand`). They have full access to runtime values. `model(schema, let User = null)` works even when `schema` was loaded from a config file moments ago. The bundler can still pre-expand macros that don't need runtime context.

**4. Composition reads inside-out**

Lisp: `(trace (memoize (defun fib ...)))` — you read from inside out. Stacking multiple macros means deeper nesting.

Dvala: `(let fib = (n) -> ...) |> memoize |> trace` — left-to-right pipeline. The same `|>` pipe used for regular functions. Chaining is flat, not nested.

**5. Errors are cryptic**

Lisp: when a macro generates bad code, the error points deep into expanded code with no connection to the source. Debugging means manually running `macroexpand` and reading the output.

Dvala: error attribution shows **both** the generated code and the macro call site. The `MacroEvalFrame` tracks where the macro was invoked, so the stack trace always connects back to the user's code.

**6. No input validation**

Lisp: a macro receives any form. If you pass the wrong shape, you get a confusing error mid-expansion. There's no standard way to declare "this macro expects a function definition."

Dvala: macros can pattern-match their input AST and throw clear errors immediately:
```dvala
let memoize = macro (ast) -> do
  if not(isLet(ast) && isFunction(getValue(ast))) then
    throw("memoize expects a function binding")
  end;
  // ...
end;
```

**7. Generated code bakes in behavior**

Lisp: a tracing macro that calls `format t "..."` hardcodes output to stdout. There's no clean way for the caller to redirect, suppress, or capture the trace.

Dvala: macros generate **effects**, not side effects. A trace macro generates `perform(@dvala.io.print, msg)`. The caller decides what to do with it — print, capture, suppress, forward. The macro author and the macro user each control their half of the contract.

### What Dvala Adds Beyond Lisp

These capabilities don't exist in any Lisp:

**Suspendable macro expansion.** A macro can `perform(@http.get, ...)` during expansion. If the host suspends, the entire expansion pauses, serializes to JSON, and resumes later — possibly on a different machine.

**Cross-platform macros.** Macros are expanded by the host via effects. The JS bundler expands at build time. The KMP runtime expands at evaluation time. Same macro, different platforms, same behavior.

**Macro-generated code survives serialization.** Code produced by macros participates in Dvala's continuation system. Suspend mid-execution of macro-generated code, serialize to JSON, resume on another machine. The macro is invisible in the continuation — only its output remains.

**The bundler is a macro.** The build pipeline is expressed using the same macro system it processes. No separate plugin API, no configuration language. Bundler plugins are macros composed with `|>`.

### Have We Achieved the Goal?

**Expressiveness**: yes. Every Lisp macro pattern has a direct Dvala equivalent. Code-as-data, quasiquote, splice, full-language expansion, transparent syntax, new control flow, new operators — all present.

**Cleaner DX**: yes.
- Hygienic by default (Lisp: opt-in via `gensym`)
- Observable expansion via effects (Lisp: black box)
- Runtime context access (Lisp: compile-time only)
- Left-to-right composition (Lisp: inside-out nesting)
- Structured error attribution (Lisp: cryptic expansion errors)
- Input validation via pattern matching (Lisp: fail mid-expansion)
- Effect-based generated code (Lisp: hardcoded side effects)

**Strictly better**: yes, with one caveat. Lisp's homoiconicity (code is literally lists) means splicing works uniformly everywhere with zero friction. Dvala's AST is richer (typed tuples, not flat lists), which means code templates need a parser (JS-only, parse-time) and the `ast` module for programmatic construction. This is a small ergonomic tax for a large structural gain — the typed AST enables pattern matching, validation, and tooling that Lisp's flat lists don't support.

The macro system is not bolted onto Dvala. It emerges from three things that already exist: functions, effects, and data. One keyword (`macro`) and one template syntax (triple backticks) complete it.
