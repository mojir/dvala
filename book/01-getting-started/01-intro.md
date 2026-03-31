# Intro

Dvala is a suspendable runtime that embeds directly in JavaScript applications. Programs run in a secure sandbox and can be **suspended, serialized, and resumed** — across processes, machines, and time. The Dvala language is pure functional with algebraic effects and hygienic macros.

## The Big Idea: Programs That Wait

Most embedded scripting languages treat code as a black box: start it, wait for it to finish, get a result. Dvala goes further. A Dvala program can **pause mid-execution**, hand control back to the host, and be picked up later — even by a completely different process.

This is possible because Dvala is built on **serializable continuations**: when a program suspends, its entire state — call stack, local variables, closures — is captured as a plain JSON snapshot. That snapshot can be stored in a database, sent over the network, or archived indefinitely. When the time comes, `resume(snapshot)` picks up exactly where the program left off.

```typescript
// First run — program suspends waiting for human approval
const r1 = await dvala.runAsync(`
  let report = perform(@llm.complete, "Generate Q4 report");
  let approved = perform(@human.approve, report);
  if approved then "Published" else "Rejected" end
`, { effectHandlers })

// r1.type === 'suspended'
await db.save(r1.snapshot)  // Store to database; process can exit

// ... days later, human clicks "Approve" ...
const snapshot = await db.load()
const r2 = await resume(snapshot, true)
// r2 = { type: 'completed', value: 'Published' }
```

The program is a straight-line script. Each `perform` either completes immediately (LLM call) or suspends for days (human approval). The program doesn't know or care which.

## Why This Matters

**Long-running workflows** — Write the workflow as a normal program instead of a state machine. The snapshot *is* your state — no schema to design, no context to reconstruct.

**Human-in-the-loop** — Need a human to approve, review, or decide? Perform an effect, suspend, and resume when they respond. No webhooks, no callback hell.

**Crash recovery** — Save the snapshot after each suspension. If the process crashes, load the snapshot and resume. The program continues from the last known point.

**AI agent workflows** — Orchestrate LLM calls, tool use, and human approvals in a single script. Each step may return instantly or pause for days.

## Safe by Design

Dvala code runs in a complete sandbox — no file system, no network, no host state — unless the host explicitly grants it. Users can script freely without the power to break things. The effect system is the only way out of the sandbox, and the host controls every effect handler.

## Pure Functional

All data is immutable and all functions are pure. No side effects, no surprises. Pure code is also why serialization works: there is no mutable state to capture — only values.

```dvala
let original = [1, 2, 3];
let extended = push(original, 4);
original // => [1, 2, 3] — unchanged
```

## Expression-Oriented

There are no statements. Everything — `if`, `let`, `loop`, `match` — is an expression that returns a value.

```dvala
let label = if 42 >= 0 then "positive" else "negative" end;
label
```

## Extensible with Macros

Macros receive unevaluated code (AST) and return transformed code. Code templates make this ergonomic:

```dvala
let unless = macro (cond, body) ->
  quote if not($^{cond}) then $^{body} else null end end;

unless(false, "this runs!")
```

Macro bindings are automatically gensymed — no accidental name collisions with the caller's scope. See the [Macros](#macros) chapter for the full story.

## JavaScript Interoperability

JavaScript values and functions can be exposed to Dvala, and Dvala results are plain JavaScript values. Integration is a single `run()` call with a string of code.

## A Taste of the Language

```dvala
let people = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
  { name: "Carol", age: 35 },
];

people
  |> _ filter (-> $.age >= 30)
  |> _ map "name"
```

```dvala
let factorial = n ->
  if n <= 1
    then 1
    else n * factorial(n - 1)
  end;

factorial(10)
```

Ready to dive in? Continue to the next page to get Dvala installed.
