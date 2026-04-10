# Suspension & Serializable Continuations

## What Is a Continuation?

In programming language theory, a **continuation** represents "the rest of the computation" — everything that remains to be done after the current expression evaluates. When you write:

```dvala
let x = 2 + 3;
x * 10;
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

Dvala supports **multi-shot continuations** — a continuation captured by a handler can be resumed any number of times (see the [Effects & Handlers](./02-effects.md) chapter for examples). When a program *suspends* for serialization, each serialized snapshot captures a single point-in-time state that can be resumed once from external storage. This is a property of the host-level `suspend()` / `resume()` API, not a limitation of the handler system itself.

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
  if b then `Transferred: ${a}` else "Cancelled" end
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
* **Call stack** — nested function calls, algebraic handler frames, loop state
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
  `Rejected: ${decision.reason}`
end
```

Each `perform` may complete instantly (LLM call), or suspend for days (human approval). The program is the same regardless.

## End-to-End Walkthrough

Here is the complete lifecycle — create, suspend, store, resume, complete — in one place:

```typescript
import { createDvala, resume } from '@mojir/dvala/full'

// --- 1. Write the Dvala workflow ---
const code = `
  let report = perform(@llm.generate, "Q4 summary");
  let approved = perform(@human.approve, report);
  if approved then "Published: " ++ report else "Rejected" end
`

// --- 2. First run: LLM call completes, then suspends for human ---
const dvala = createDvala()
const r1 = await dvala.runAsync(code, {
  effectHandlers: [
    { pattern: 'llm.generate',  handler: async ({ args, resume }) => resume('Q4 was great') },
    { pattern: 'human.approve', handler: async ({ args, suspend }) => suspend({ doc: args[0] }) },
  ],
})
// r1 = { type: 'suspended', snapshot: { continuation: ..., meta: { doc: 'Q4 was great' } } }

// --- 3. Store the snapshot (process can now exit) ---
await db.save('task-1', JSON.stringify(r1.snapshot))

// --- ... hours or days pass ... ---

// --- 4. Resume with the human's decision ---
const snapshot = JSON.parse(await db.load('task-1'))
const r2 = await resume(snapshot, true)
// r2 = { type: 'completed', value: 'Published: Q4 was great' }
```

Key points:
- The Dvala program is a **straight-line script** — no callbacks, no state machine
- Each `perform` is either handled immediately (`llm.generate`) or causes suspension (`human.approve`)
- The `snapshot` is plain JSON — store it anywhere, load it anywhere
- `resume(snapshot, value)` picks up exactly where `perform` was waiting

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

## Host Values and Suspension

Host values are provided via the `@dvala.host` effect (see the [Effects chapter](./02-effects.md)). When a program suspends, any host values already retrieved via `let x = perform(@dvala.host, "x")` are preserved in the continuation as regular `let` bindings. On resume, the host only needs to provide effect handlers for effects the resumed program will perform *after* the suspension point.
