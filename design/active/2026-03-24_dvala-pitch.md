# Dvala: Code That Stops, Moves, and Resumes

## The Elevator Pitch

Dvala is a functional language where **programs can pause mid-sentence, serialize their entire state to JSON, and resume later — on a different machine, in a different country, weeks later.** Effects make all I/O pluggable. Macros rewrite code at the AST level through the same effect system. Together, these three features create something new: programs that are portable across time and space, where every behavior is composable and every side effect is a choice.

---

## Three Primitives, Infinite Combinations

### 1. Suspension — Programs That Pause

A Dvala program can suspend at any point. Not "save to a checkpoint file." The language captures the *entire continuation* — every stack frame, every local variable, every partially-evaluated expression — as a JSON blob.

```dvala
let order = perform(@db.read, "orders", orderId);

// This perform suspends execution. The entire program state —
// including `order` and everything computed before it —
// becomes a JSON blob stored in a database.
let approval = perform(@approval.request, order);

// Days later, a human approves. The host deserializes the JSON,
// resumes from exactly this point, and `approval` gets its value.
perform(@db.write, "orders", orderId, { ...order, status: approval });
```

This isn't async/await. Async/await suspends within a single process lifetime. Dvala suspends **across processes, machines, and time**:

- Suspend on a server in Frankfurt → resume on a phone in Tokyo
- Suspend on Monday → resume on Thursday when a human finishes reviewing
- Suspend in Node.js → resume in Kotlin on Android

The continuation is JSON. Anything that can read JSON can resume the program.

### 2. Effects — Side Effects as a Protocol

Every interaction with the outside world is an **effect** — a message the program sends to its host. The host decides what happens.

```dvala
let data = perform(@http.get, "/api/users");
perform(@dvala.io.print, "loaded users");
perform(@db.write, "cache", "users", data);
```

The program doesn't know how HTTP works. It doesn't know where print goes. It doesn't know what database it's talking to. It performs effects and receives answers. The host provides all the implementations:

```dvala
// Production host
with @http.get(url) -> actualHttpRequest(url) end
with @db.write(table, key, val) -> postgres.insert(table, key, val) end

// Test host — no network, no database
with @http.get(url) -> testFixtures[url] end
with @db.write(table, key, val) -> set(testDb, key, val) end

// Replay host — deterministic reproduction from recorded effects
with @http.get(url) -> recordedResponses.next() end
```

**Same program, three completely different behaviors. Zero code changes.**

This makes Dvala programs:
- **Testable** — swap the host, no mocks needed
- **Portable** — the program runs anywhere that provides effect handlers
- **Auditable** — log every effect, replay any execution
- **Sandboxable** — restrict what effects a program can perform

### 3. Macros — Code That Rewrites Code

Macros are functions that receive AST (the program's syntax tree) and return new AST. Macro expansion itself is an effect — the host controls how and when macros expand.

```dvala
~memoize
let fib = (n) -> if n <= 1 then n else fib(n - 1) + fib(n - 2) end;
```

The `~memoize` annotation tells the evaluator: "before evaluating this, perform `@macro.expand` with the AST of the next expression." The macro function rewrites it into a cached version.

Because expansion is an effect, macros have access to runtime values:

```dvala
let schema = perform(@config.load, "user-schema.json");

~model(schema)
let User = null;

// The macro reads the schema at runtime and generates:
// createUser(), validateUser(), getName(), getAge(), getEmail()
// All with validation that performs @validation.error effects.
```

Macros generate effects, not side effects. The generated code participates in the same effect protocol as hand-written code. The caller controls every behavior.

---

## What This Combination Enables

Each feature is useful alone. Together, they create capabilities that don't exist elsewhere.

### Workflows That Span Months

A business process isn't a function call that returns in milliseconds. It's a series of steps that involve human decisions, external systems, and waiting. Dvala models this naturally:

```dvala
let processLoan = (application) -> do
  // Step 1: Automated credit check (milliseconds)
  let creditScore = perform(@credit.check, application.ssn);

  // Step 2: Human review (days)
  let review = perform(@review.request, {
    application: application,
    creditScore: creditScore
  });
  // ↑ Program suspends here. Continuation stored in database.
  //   Reviewer gets a task in their queue. Days pass.
  //   Reviewer submits decision. Host resumes the program.

  if review.decision == "denied" then
    perform(@notify, application.email, "Denied");
    { status: "denied", reason: review.reason }
  else do
    // Step 3: Document signing (days)
    let signed = perform(@docusign.request, application.loanDoc);
    // ↑ Suspends again. Waiting for signature.

    // Step 4: Disbursement (seconds)
    perform(@banking.transfer, application.account, review.approvedAmount);
    perform(@notify, application.email, "Funds disbursed");
    { status: "complete", amount: review.approvedAmount }
  end
end;
```

This reads like a simple function. It executes over weeks. Each `perform` that requires external input becomes a suspension point. The continuation — including `creditScore`, `review`, and every local variable — survives across restarts, deployments, and infrastructure changes.

No workflow engine. No state machine framework. No DAG builder. Just a function that happens to take weeks to finish.

### Programs You Can Replay, Fork, and Rewind

A continuation is JSON. JSON can be copied.

```dvala
// Capture a checkpoint
let snapshot = perform(@checkpoint);

// ... more computation ...

// Something goes wrong. Resume from the checkpoint.
// Not "undo" — literally re-enter the program at that exact point.
perform(@restore, snapshot);
```

But it goes further. A continuation is just data, so you can:

- **Fork**: Copy the continuation, resume both copies with different inputs. Run "what-if" scenarios on a live workflow.
- **Replay**: Record all effect inputs. Feed them into a fresh execution. Reproduce any bug deterministically.
- **Rewind**: Store checkpoints at key points. Roll back to any previous state.
- **Inspect**: The continuation is JSON — parse it, query it, visualize it. See exactly what the program was doing when it suspended.

```dvala
// Fork a workflow to test two strategies
let checkpoint = perform(@checkpoint);

// Path A: aggressive pricing
let resultA = handle
  perform(@restore, checkpoint)
with @pricing.strategy() -> "aggressive" end;

// Path B: conservative pricing
let resultB = handle
  perform(@restore, checkpoint)
with @pricing.strategy() -> "conservative" end;

// Compare outcomes
perform(@report, { aggressive: resultA, conservative: resultB });
```

### Portable Across Every Platform

A Dvala program doesn't import `http`, `fs`, or `postgres`. It performs effects. This means the same program runs on any host that handles those effects:

| Platform | `@http.get` handler | `@db.write` handler |
|----------|---------------------|---------------------|
| Node.js | `fetch()` | `pg.query()` |
| Android (KMP) | `OkHttp` | `Room` |
| iOS (KMP) | `URLSession` | `CoreData` |
| Browser | `fetch()` | `IndexedDB` |
| Edge worker | `fetch()` | `KV store` |
| Test harness | Fixture data | In-memory map |

**One program. Six platforms. Zero `#ifdef`.**

And because continuations are JSON, a program can **move between platforms mid-execution**:

1. Start on a server (crunch data with server resources)
2. Suspend → JSON → send to mobile
3. Resume on phone (show results in native UI)
4. Suspend → JSON → send back to server
5. Resume on server (store results)

The program doesn't know it moved. It just performed effects and got answers.

### Macros That Understand Your Code

Because macros operate on AST and expansion is an effect, macros can generate sophisticated code that integrates with the effect system:

```dvala
// A saga macro rewrites your function body so each effect
// is independently tracked with compensation logic.
// If step 3 fails, steps 2 and 1 are automatically rolled back.
~saga({
  compensate: {
    debit: (from, amount) -> perform(@bank.credit, from, amount),
    credit: (to, amount) -> perform(@bank.debit, to, amount)
  }
})
let transfer = (from, to, amount) -> do
  perform(@bank.debit, from, amount);
  perform(@bank.credit, to, amount);
  perform(@notify, to, `Received ${amount}`)
end;
```

The macro reads the compensation map (runtime data), walks the function body's AST to find each `perform` call, matches them against the map, and generates bookkeeping code that tracks success/failure and unwinds in reverse order on failure.

This is AST analysis + runtime data + effect generation. A higher-order function can't do this — it can't see inside the function body. A traditional macro can't do this — it doesn't have access to runtime values. Dvala macros can, because expansion is an effect that runs in the full evaluation context.

---

## The Mental Model

A Dvala program is a **pure computation that communicates with the outside world through effects**. The host provides all external capabilities. The program can be stopped, serialized, moved, resumed, forked, and replayed — because its state is data, and its I/O is a protocol.

Macros extend this model to the syntax level — code transformations are also effects, also controlled by the host, also composable.

The result: programs that are simultaneously **simple to write** (they read like sequential code), **powerful to deploy** (they survive across time and machines), and **safe to run** (every external interaction is explicit, interceptable, and replaceable).

---

## Who Is This For

**Backend developers** building long-running workflows, approval chains, orchestration pipelines. Replace your state machines and workflow engines with functions that just happen to take weeks to finish.

**Platform engineers** building multi-platform systems. Write business logic once. Run it on server, mobile, browser, and edge. Move execution between platforms mid-flight.

**Teams that need auditability**. Every effect is a log entry. Every execution is replayable. Every decision point is inspectable. Compliance isn't an afterthought — it's structural.

**Anyone tired of the accidental complexity** of distributed systems. Dvala doesn't eliminate distributed systems — it makes them look like simple programs.
