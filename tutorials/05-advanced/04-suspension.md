# Suspension & Serializable Continuations

## What Is a Continuation?

In programming language theory, a **continuation** represents "the rest of the computation" — everything that remains to be done after the current expression evaluates. When you write:

```dvala
let x = 2 + 3;
x * 10
```

At the point where `2 + 3` is being evaluated, the continuation is: "take the result, bind it to `x`, then compute `x * 10`."

Continuations have a long history in computer science. [Scheme](https://en.wikipedia.org/wiki/Scheme_%28programming_language%29) (1975) introduced [`call/cc`](https://en.wikipedia.org/wiki/Call-with-current-continuation) — first-class continuations that let a program capture its own execution state and jump back to it later. Languages like Standard ML, Haskell, and OCaml explored [delimited continuations](https://en.wikipedia.org/wiki/Delimited_continuation), and Plotkin & Pretnar's [algebraic effect handlers (2009)](https://homepages.inf.ed.ac.uk/gdp/publications/Effect_Handlers.pdf) gave continuations a structured, composable form.

## Serializable Continuations

Most continuation systems are **in-memory only** — the captured state lives as a runtime object that cannot leave the process. If the process crashes, the continuation is lost.

Dvala takes a different approach: continuations are **serializable**. When a program suspends, its entire execution state — call stack, local variables, closures — is captured as a `Snapshot` object. This snapshot can be:

* Stored in a database or file
* Sent over a network to another machine
* Resumed hours, days, or weeks later
* Resumed in a completely different process

This is possible because Dvala is designed for it from the ground up. The evaluator uses a trampoline with explicit continuation frames (no native call stack), all values are JSON-compatible, and closures capture only serializable data.

The trade-off: Dvala restricts to **single-shot continuations** — a continuation can be resumed exactly once. Multi-shot continuations (resuming the same point multiple times) are fundamentally incompatible with serializable state, since you cannot meaningfully serialize a fork of mutable execution. Languages like Koka and Effekt support multi-shot but sacrifice serializability.

## How It Works

Suspension is triggered by a **host handler** calling `suspend()`. The Dvala program itself does not know it will be suspended — it simply performs an effect and waits for a result.

### Step 1: Program Performs an Effect

The Dvala program calls `perform` with a custom effect. From the program's perspective, this is just a function call that will eventually return a value:

```dvala no-run
let decision = perform(@human.approve, "Q4 Report");
if decision then "Approved" else "Rejected" end
```

### Step 2: Host Handler Suspends

The host (JavaScript/TypeScript) registers a handler that calls `suspend()` instead of `resume()`:

```typescript
import { createDvala } from '@mojir/dvala/full'

const dvala = createDvala()
const result = await dvala.runAsync(`
  let decision = perform(@human.approve, "Q4 Report");
  if decision then "Approved" else "Rejected" end
`, {
  effectHandlers: [
    { pattern: 'human.approve', handler: async ({ args, suspend }) => {
      // Store metadata for the external system
      suspend({ document: args[0], assignee: 'finance-team' })
    } },
  ],
})

// result.type === 'suspended'
// result.snapshot — a Snapshot object containing the serialized continuation
// result.snapshot.meta — { document: 'Q4 Report', assignee: 'finance-team' }
```

The `snapshot` is a self-contained capture of the program's state. `snapshot.meta` is passed through for the host's convenience — use it to carry domain context like who should act, what they're deciding on, deadlines, etc. `snapshot.continuation` is opaque — do not inspect or modify it.

### Step 3: Store the Snapshot

The snapshot can be serialized and stored however you like:

```typescript
// In a database
await db.tasks.insert({
  id: taskId,
  snapshot: result.snapshot,
  createdAt: new Date(),
})
```

### Step 4: Resume Later

When the human (or external system) provides a response, load the snapshot and resume:

```typescript
import { resume } from '@mojir/dvala/full'

// Load from database
const task = await db.tasks.findById(taskId)

// Resume with the human's decision
const final = await resume(task.snapshot, true)
// final = { type: 'completed', value: 'Approved' }
```

The program continues from exactly where it left off. The value passed to `resume()` becomes the return value of the original `perform()` call.

### Multiple Suspensions

A program can suspend multiple times. Each resume may hit another `perform` that suspends again:

```typescript
const effectHandlers = [
  { pattern: 'human.step', handler: async ({ args, suspend }) => {
    suspend({ step: args[0] })
  } },
]

const r1 = await dvala.runAsync(`
  let a = perform(@human.step, "Step 1: Enter amount");
  let b = perform(@human.step, "Step 2: Confirm");
  if b then "Transferred: " ++ str(a) else "Cancelled" end
`, { effectHandlers })

// r1.type === 'suspended', r1.snapshot.meta.step === 'Step 1: Enter amount'

const r2 = await resume(r1.snapshot, 500, { handlers: effectHandlers })
// r2.type === 'suspended', r2.snapshot.meta.step === 'Step 2: Confirm'

const r3 = await resume(r2.snapshot, true)
// r3 = { type: 'completed', value: 'Transferred: 500' }
```

Each suspension captures the full state accumulated so far — the variable `a = 500` is preserved across the second suspension.

## What State Is Preserved?

Everything the program needs to continue:

* **Local variables** — all `let` bindings in scope at the point of suspension
* **Closures** — functions that capture variables from outer scopes
* **Call stack** — nested function calls, `handle...with` handler frames, loop state
* **Partially evaluated expressions** — the exact position within a complex expression

```typescript
const r1 = await dvala.runAsync(`
  let multiplier = 3;
  let scale = (x) -> x * multiplier;
  let value = perform(@my.wait);
  scale(value)
`, {
  effectHandlers: [
    { pattern: 'my.wait', handler: async ({ suspend }) => { suspend() } },
  ],
})

const r2 = await resume(r1.snapshot, 14)
// r2 = { type: 'completed', value: 42 }
// The closure 'scale' and its captured 'multiplier = 3' survived serialization
```

## Problems It Solves

### Long-Running Workflows

Traditional approach: break the workflow into steps, store state in a database between steps, rebuild context on each step, handle failures at each transition.

With Dvala: write the workflow as a straight-line program. Each `perform` that needs external input suspends automatically. The snapshot **is** your state — no schema to design, no state machine to maintain.

### Human-in-the-Loop

Traditional approach: expose a webhook endpoint, store request context in a database, match the callback to the original request, reconstruct enough context to continue.

With Dvala: `perform(@human.approve, doc)`. The handler suspends, stores the snapshot, and resumes when the human responds. The program doesn't know or care that days passed.

### Crash Recovery

Traditional approach: design idempotent operations, implement retry logic, save checkpoints manually.

With Dvala: save the snapshot after each suspension. If the process crashes, load the snapshot and resume. The program continues from the last suspension point with all state intact.

### Multi-Step AI Agent Workflows

Traditional approach: orchestration frameworks (LangChain, Temporal, Step Functions) with separate state management, retry logic, and human-approval infrastructure.

With Dvala: the agent workflow is just a program:

```dvala no-run
let report = perform(@llm.complete, "Generate Q4 report");
let decision = perform(@human.approve, report);
if decision.approved then
  perform(@email.send, report)
else
  "Rejected: " ++ decision.reason
end
```

Each `perform` may complete instantly (LLM call), or suspend for days (human approval). The program is the same regardless.

## The RunResult Type

Every call to `runAsync()` or `resume()` returns a `RunResult`:

```typescript
type RunResult =
  | { type: 'completed', value: Any }
  | { type: 'suspended', snapshot: Snapshot }
  | { type: 'error', error: DvalaError }
```

* **completed** — the program finished normally
* **suspended** — the program paused; `snapshot` contains the continuation and domain metadata
* **error** — an unhandled error occurred

The host never has to catch exceptions. All outcomes are data.
