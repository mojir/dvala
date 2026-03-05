# DVALA API CONTRACT v7

## Effects, Suspensions & Serializable Continuations

---

## Package Structure

- `@mojir/dvala` — core runtime, minimal, no debug overhead
- `@mojir/dvala/debug` — time-travel debugger built on core primitives

---

# Relation to Plotkin & Pretnar (2009)

## "Handlers of Algebraic Effects"

Dvala implements algebraic effects in the spirit of P&P but makes
deliberate deviations to support serializable continuations.

### What Dvala preserves

- ✓ Effects as algebraic operations — `perform(eff, ...args)`
- ✓ Handlers as first-class effect interpreters — `do/with`
- ✓ Lexically scoped handlers — innermost `with` wins
- ✓ Deep handlers — effects inside handlers delegate to outer scope
- ✓ Error is an effect — `effect(dvala.error)` replaces try/catch

### Deliberate deviations

- ✗ **No return-clause**
  P&P handlers have a 'return' clause that transforms the final
  value of the body. Dvala omits this — the same transformation
  can always be expressed by wrapping the `do/with` block.

- ✗ **No multi-shot continuations**
  In P&P, resume is first-class and can be called multiple times.
  Dvala restricts to single-shot — resume is implicit via handler
  return value, and can only be called once.

  Reason: multi-shot continuations are fundamentally incompatible
  with serializable continuations.

  | | Serializable | Not Serializable |
  |---|---|---|
  | Multi-shot | impossible | academic languages (Koka, Effekt) |
  | Single-shot | **Dvala** | — |
  |

- ✗ **No static effect types**
  Dvala is dynamically typed. Effects are identified by interned
  values via `effect(name)` rather than static types.

---

# Dvala Language — Effect System

## `effect(name)` — special expression

Returns the unique effect value for the given name. The runtime guarantees that calling `effect` with the same name always returns the exact same reference, so effects can be compared with `==`.
Dot notation is only valid inside `effect(...)` — never as property access.

```dvala
// Dvala code

effect(dvala.log)                  // standard effect
effect(llm.complete)              // domain-specific
effect(com.myco.human.approve)    // namespaced

effect(llm.complete) == effect(llm.complete)  // always true
```

Effect values are serializable — stored as their name string.
When a continuation is restored, the name is used to look up
the unique effect reference in the new runtime, so `==`
comparisons and handler matching continue to work correctly.

**Automatic binding** — `effect(name)` binds to:

1. JS handler registered in `run()` — highest priority
2. Standard default implementation — if `dvala.*` effect
3. "unhandled" — throws `DvalaError` — if nothing found

**Standard effects** (pre-declared, always visible):

- `effect(dvala.log)` — write to stdout/console
- `effect(dvala.now)` — current timestamp in ms
- `effect(dvala.random)` — random float 0–1
- `effect(dvala.prompt)` — ask user for input
- `effect(dvala.sleep)` — wait N milliseconds
- `effect(dvala.debug.step)` — injected by runtime in debug mode

**Naming convention:**

- `dvala.*` — standard library, default implementation provided
- `com.mydomain.*` — domain-specific, host must provide JS handler

## `perform` — special expression

```dvala
// Dvala code

perform(eff)
perform(eff, arg1)
perform(eff, arg1, arg2, ...)
```

`eff` is any expression that evaluates to an effect value.
Effect values are first-class — can be stored, passed, returned.

## `do` / `with` / `end`

**Valid forms:**

- `do ... with case effect(dvala.error) then ... end` — error handling (errors are effects)
- `do ... with ... end` — effects only
- `do ... with ... case effect(dvala.error) then ... end` — effects and error handling

`with` uses `case/then` syntax — consistent with `cond` and `match`.

### Handler semantics

Handler return value IS the resume value — no explicit resume needed.
Handler is a plain Dvala function: `(args) -> value`
`args` is always an array — destructure as needed.
`self()` available for recursive handlers.

### Matching semantics

Matching is by value/reference — not by name.
`effect(llm.complete)` always returns the same unique reference.
First matching case wins.
Dead handlers (same reference, later position) should warn in tooling.

```dvala
// Dvala code

let llm = effect(llm.complete)
let alias = effect(llm.complete)   // same reference as llm

do ... with
  case llm   then ...              // matches effect(llm.complete)
  case alias then ...              // never reached — same reference
end
```

### Scope semantics

- **do-body** sees overridden scope — with-handlers are active
- **with-handlers** see outer scope — original bindings, not overrides

### Error handling semantics

Errors are handled via `effect(dvala.error)` — a standard effect like any other.
`case effect(dvala.error)` in a `with` block only handles errors from the do-body.
Errors performed inside a with-handler propagate to the nearest
enclosing `do/with` outside the current `do/with/end` block.

### Effect lookup order

```
perform(eff, ...)
  → matching case in nearest enclosing do/with?    yes → use it
  → matching case in outer do/with?                yes → use it
  → JS handler registered in run()?                yes → use it
  → standard effect with default implementation?   yes → use it
  → DvalaError: No handler for effect 'llm.complete'
```

## `parallel` / `race`

```dvala
// Dvala code

let [a, b] = parallel(
  perform(llm, "p1"),
  perform(llm, "p2")
)

let fastest = race(
  perform(effect(llm.gpt4),   prompt),
  perform(effect(llm.claude), prompt)
)
```

---

## Dvala Syntax Examples

```dvala
// Dvala code

// Declare effect values
let llm     = effect(llm.complete)
let approve = effect(com.myco.human.approve)

// perform — eff is any expression evaluating to an effect value
let result = perform(llm, "Summarize this")

// Inline
perform(effect(dvala.log), "hello")

// do/with — case/then syntax, handler return value is resume value
do
  perform(llm, "prompt")
with
  case llm then ([prompt]) -> upper-case(prompt)
end

// do/with — error handling via dvala.error effect
do
  risky-operation()
with
  case effect(dvala.error) then ([msg]) -> "failed: " ++ msg
end

// do/with — body errors caught, handler errors propagate upward
do
  perform(llm, "prompt")
with
  case llm then ([prompt]) ->
    if empty?(prompt) then
      perform(effect(dvala.error), "Empty prompt")  // propagates to OUTER do/with
    else
      upper-case(prompt)
    end
  case effect(dvala.error) then ([msg]) -> "Body failed: " ++ msg // only sees errors from body, not handlers
end

// Destructuring args
do
  perform(effect(state.set), "key", 42)
with
  case effect(state.set) then ([key, value]) -> do
    perform(effect(dvala.log), "Setting " ++ key)
    null
  end
end

// Delegating to outer handler — enriches the effect
do
  perform(llm, "prompt")
with
  case llm then ([prompt]) ->
    perform(llm, prompt ++ " — be concise")  // reaches next handler in chain
end

// Effects are first-class — pass as arguments
let with-retry = (eff, max-attempts, body) ->
  do
    body()
  with
    case eff then ([...args]) ->
      loop (attempt = 0) ->
        do
          perform(eff, ...args)
        with
          case effect(dvala.error) then ([msg]) ->
            if attempt < max-attempts then
              recur(attempt + 1)
            else
              perform(effect(dvala.error), "Max retries exceeded")
            end
        end
      end
  end

with-retry(llm, 3, () ->
  perform(llm, "critical task")
)

// Recursive handler via self
let llm = effect(llm.complete)
do
  perform(llm, "a very long prompt that needs shortening")
with
  case llm then ([prompt]) ->
    if count(prompt) > 100 then
      self([shorten(prompt)])   // recursive — calls this handler again
    else
      perform(llm, prompt)      // delegate to outer handler
    end
end

// Conditional suspension via effect
let charge   = effect(payment.charge)
let requires = effect(payment.approval-required)

let with-approval-policy = (threshold, body) ->
  do
    body()
  with
    case charge then ([amount, account]) ->
      if amount > threshold then
        perform(requires, { amount: amount, account: account })
      else
        perform(charge, amount, account)
      end
  end

with-approval-policy(10000, () ->
  perform(charge, 50000, "ACC-123")
)

// Package that declares and exports an effect
// llm-package.dvala
let llm = effect(llm.complete)

let summarize = (doc) -> perform(llm, "Summarize: " ++ doc)
let critique  = (doc) -> perform(llm, "Critique: " ++ doc)

{ summarize: summarize, critique: critique, llm: llm }

// Consumer — override via do/with or JS handler in run()
let pkg = import(llm-package)

do
  pkg.summarize("document")
with
  case effect(llm.complete) then ([p]) -> "mocked: " ++ p
end

// parallel and race
let [summary, critique] = parallel(
  perform(llm, "Summarize: " ++ doc),
  perform(llm, "Critique: " ++ doc)
)

let fastest = race(
  perform(effect(llm.gpt4),   prompt),
  perform(effect(llm.claude), prompt)
)
```

---

# `@mojir/dvala` — Core JS API

```typescript
type DvalaValue = string | number | boolean | null | DvalaValue[] | { [key: string]: DvalaValue }

type RunResult =
  | { type: 'completed'; value: DvalaValue }
  | { type: 'suspended'; snapshot: Snapshot }
  | { type: 'error';     error: DvalaError }

interface DvalaError {
  message: string
  source?: string
  cause?:  unknown
}

interface Snapshot {
  /** Opaque serialized continuation. Do not inspect or modify. */
  readonly continuation: unknown
  /** Wall-clock timestamp (Date.now()) when snapshot was taken. */
  readonly timestamp: number
  /** Stable sequence number (0-based, never reused within an execution lineage). */
  readonly index: number
  /** UUID identifying the run() or resume() call that created this snapshot. */
  readonly runId: string
  /** Optional domain metadata from the suspend() call. */
  readonly meta?: DvalaValue
}

interface EffectContext {
  // Full dotted name of the performed effect (useful for wildcard handlers)
  effectName: string

  args:    DvalaValue[]

  // Aborted when: race() branch loses, or runtime is disposed.
  // Combine with timeout: AbortSignal.any([signal, AbortSignal.timeout(ms)])
  signal:  AbortSignal

  // Resume with value (sync) or promise (async) — Dvala detects which
  resume:  (value: DvalaValue | Promise<DvalaValue>) => void

  // Propagate as a Dvala-level error — flows through dvala.error handlers
  fail:    (msg?: string) => void

  // Suspend — meta passed through to RunResult
  suspend: (meta?: DvalaValue) => void

  // Pass to the next registered handler whose pattern matches this effect
  next:    () => void

  // All snapshots taken so far, oldest first. Read-only view.
  snapshots: readonly Snapshot[]

  // Explicitly capture a snapshot at the current continuation point.
  // Returns the new Snapshot. Host-side equivalent of perform(effect(dvala.checkpoint)).
  checkpoint: (meta?: DvalaValue) => Snapshot

  // Abandon current execution and resume from a previous snapshot.
  // All snapshots after the target are discarded.
  resumeFrom: (snapshot: Snapshot, value: DvalaValue) => void
}

type EffectHandler = (ctx: EffectContext) => Promise<void>
type Handlers = Record<string, EffectHandler>   // key is effect name e.g. 'llm.complete'
```

### `runSync` — Level 1: Pure computation

Sync JS functions allowed in bindings.
Throws `DvalaSyncError` if async effect encountered.

```typescript
declare function runSync(
  source: string,
  options?: {
    bindings?: Record<string, DvalaValue | ((...args: DvalaValue[]) => DvalaValue)>
  }
): DvalaValue
```

### `run` — Level 2 & 3: Full execution with effect support

No JS functions in bindings — all async interaction via handlers.
Always resolves — never rejects. Errors in `RunResult`.

```typescript
declare function run(
  source: string,
  options?: {
    bindings?: Record<string, DvalaValue>
    handlers?: Handlers
  }
): Promise<RunResult>
```

### `resume` — Resume a suspended continuation

`snapshot` comes from `RunResult` of type `'suspended'`.

```typescript
declare function resume(
  snapshot: Snapshot,
  value: DvalaValue,
  options?: {
    handlers?: Handlers
  }
): Promise<RunResult>
```

---

# `@mojir/dvala/debug` — Debugger

```typescript
interface StepInfo {
  expression: string
  value:      DvalaValue
  location:   { line: number; col: number }
  env:        Record<string, DvalaValue>
}

interface HistoryEntry {
  snapshot:  Snapshot           // for resume — contains opaque continuation
  step:      StepInfo           // for UI — expression, value, location, env
  timestamp: number             // ms since epoch — enables performance profiling
}

interface DvalaDebugger {
  run(source: string): Promise<RunResult>

  // Navigation — uses saved snapshots, no external value needed
  stepForward():                                        Promise<RunResult>
  stepBackward():                                       Promise<RunResult>
  jumpTo(index: number):                                Promise<RunResult>

  // Rerun from a step with a different effect return value
  // Discards history after index — creates a new timeline
  rerunFrom(index: number, alternateValue: DvalaValue):  Promise<RunResult>

  readonly history:     HistoryEntry[]
  readonly currentStep: number
  readonly current:     HistoryEntry
}

declare function createDebugger(options: {
  handlers?: Handlers
}): DvalaDebugger
```

---

# JS Host Usage Examples

```typescript
import { run, resume, runSync } from '@mojir/dvala'
import { createDebugger }       from '@mojir/dvala/debug'
```

## Level 1: Pure computation with sync JS functions

```typescript
const value = runSync(`
  [1, 2, 3, 4, 5]
    |> filter(_, odd?)
    |> map(_, -> $ * $)
    |> reduce(_, +, 0)
`)
// => 35

const value2 = runSync(`
  // dvala.now has a sync default — safe in runSync
  let formatted = formatDate(perform(effect(dvala.now)))  
  "Today is: " ++ formatted
`, {
  bindings: {
    formatDate: (ts: number) => new Date(ts).toISOString().split('T')[0]
  }
})
```

## Level 2: Async effects — always runs to completion

```typescript
const result1 = await run(`
  let llm = effect(llm.complete)
  perform(effect(dvala.log), "Starting...")
  let summary  = perform(llm, "Summarize: " ++ topic)
  let critique = perform(llm, "Critique: " ++ summary)
  { summary: summary, critique: critique }
`, {
  bindings: { topic: 'quantum computing' },
  handlers: {
    'llm.complete': async ({ args, signal, resume }) => {
      resume(callLLM(args[0] as string, signal))
    }
  }
})

if (result1.type === 'completed') {
  console.log(result1.value)
}
```

## Level 2B: Standard effects overridden for deterministic testing

```typescript
const testResult = await run(`
  let t = perform(effect(dvala.now))
  let x = perform(effect(dvala.random))
  { time: t, random: x }
`, {
  handlers: {
    'dvala.now':    async ({ resume }) => resume(new Date('2024-01-01').getTime()),
    'dvala.random': async ({ resume }) => resume(0.42),
  }
})
```

## Level 2C: Effect with host-controlled timeout

```typescript
await run(`
  let llm = effect(llm.complete)
  perform(llm, prompt)
`, {
  values: { prompt: 'Explain recursion' },
  handlers: {
    'llm.complete': async ({ args, signal, resume }) => {
      const combined = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
      resume(callLLM(args[0] as string, combined))
    }
  }
})
```

## Level 3A: Suspend — human in the loop

```typescript
const result3 = await run(`
  let llm     = effect(llm.complete)
  let approve = effect(com.myco.human.approve)

  let report   = perform(llm, "Generate Q4 report")
  let decision = perform(approve, report)

  if decision.approved then
    perform(llm, "Finalize: " ++ report)
  else
    "Rejected: " ++ decision.reason
  end
`, {
  handlers: {
    'llm.complete': async ({ args, signal, resume }) => {
      resume(callLLM(args[0] as string, signal))
    },
    'com.myco.human.approve': async ({ args, suspend }) => {
      suspend({
        assignedTo: 'finance-team',
        payload:    args[0],
        deadline:   new Date(Date.now() + days(3)).toISOString(),
      })
    },
  }
})

if (result3.type === 'suspended') {
  await db.save({ snapshot: result3.snapshot })
  sendSlackMessage(`Approval needed`, result3.snapshot.meta)
}
```

Resume — days later, new process:

```typescript
async function handleApprovalWebhook(id: string, approved: boolean, reason?: string) {
  const { snapshot } = await db.load(id)
  const result = await resume(snapshot, { approved, reason: reason ?? null }, {
    handlers: {
      'llm.complete':           async ({ args, signal, resume: r }) => r(callLLM(args[0] as string, signal)),
      'com.myco.human.approve': async ({ args, suspend })           => suspend({ assignedTo: 'finance-team', payload: args[0] }),
    }
  })

  if (result.type === 'completed') {
    console.log('Workflow done:', result.value)
  } else if (result.type === 'suspended') {
    await db.save({ snapshot: result.snapshot })
  }
}
```

## Level 3B: Parallel effects

```typescript
await run(`
  let llm = effect(llm.complete)
  let [summary, critique, keywords] = parallel(
    perform(llm, "Summarize: " ++ doc),
    perform(llm, "Critique: " ++ doc),
    perform(llm, "Extract keywords: " ++ doc)
  )
  { summary: summary, critique: critique, keywords: keywords }
`, {
  values: { doc: 'Long document...' },
  handlers: {
    'llm.complete': async ({ args, signal, resume }) => {
      resume(callLLM(args[0] as string, signal))
    }
  }
})
```

## Level 3C: Race — first wins, rest cancelled via signal

```typescript
await run(`
  let fastest = race(
    perform(effect(llm.gpt4),   prompt),
    perform(effect(llm.claude), prompt),
    perform(effect(llm.gemini), prompt)
  )
  fastest
`, {
  values: { prompt: 'Explain recursion' },
  handlers: {
    'llm.gpt4':   async ({ args, signal, resume }) => resume(callGPT4(args[0]   as string, signal)),
    'llm.claude': async ({ args, signal, resume }) => resume(callClaude(args[0] as string, signal)),
    'llm.gemini': async ({ args, signal, resume }) => resume(callGemini(args[0] as string, signal)),
  }
})
```

## Level 3D: Crash recovery via checkpointing

```typescript
function makeHandlers(workflowId: string): Handlers {
  return {
    'llm.complete': async ({ args, signal, resume, checkpoint }) => {
      const value = await callLLM(args[0] as string, signal)
      checkpoint({ workflowId })
      resume(value)
    },
    'com.myco.human.approve': async ({ args, suspend }) => {
      suspend({ workflowId, payload: args[0] })
    },
  }
}

async function runWithRecovery(source: string, workflowId: string) {
  const checkpoint = await db.loadCheckpoint(workflowId)
  if (checkpoint) {
    return resume(checkpoint.snapshot, checkpoint.lastValue, { handlers: makeHandlers(workflowId) })
  }
  return run(source, { handlers: makeHandlers(workflowId) })
}
```

## Level 4: Time-travel debugger

```typescript
const dbg = createDebugger({
  handlers: {
    'llm.complete': async ({ args, signal, resume }) => {
      resume(callLLM(args[0] as string, signal))
    }
  }
})

await dbg.run(`
  let llm = effect(llm.complete)
  let x   = perform(effect(dvala.random))
  let y   = perform(llm, "Compute something with " ++ str(x))
  { x: x, result: y }
`)

await dbg.stepForward()
await dbg.stepBackward()
await dbg.jumpTo(5)

// "What if dvala.random had returned 0.3 instead?"
const randomStep = dbg.history.findIndex(e => e.step.expression.includes('dvala.random'))
await dbg.rerunFrom(randomStep, 0.3)

// Performance profiling via timestamps
dbg.history.forEach((entry, i) => {
  const duration = i > 0 ? entry.timestamp - dbg.history[i - 1].timestamp : 0
  console.log(`Step ${i}: ${entry.step.expression} — ${duration}ms`)
})
```

---

## Stubs

```typescript
declare function callLLM(prompt: string, signal?: AbortSignal): Promise<string>
declare function callGPT4(prompt: string, signal?: AbortSignal): Promise<string>
declare function callClaude(prompt: string, signal?: AbortSignal): Promise<string>
declare function callGemini(prompt: string, signal?: AbortSignal): Promise<string>
declare function sendSlackMessage(msg: string, meta?: unknown): void
declare function days(n: number): number
declare const db: {
  save(record: object): Promise<void>
  load(id: string): Promise<{ snapshot: Snapshot }>
  saveCheckpoint(id: string, data: object): Promise<void>
  loadCheckpoint(id: string): Promise<{ snapshot: Snapshot; lastValue: DvalaValue } | null>
}
```
