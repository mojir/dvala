# Trampoline Evaluator Architecture

The Dvala evaluator is a trampoline-style state machine. Instead of recursive evaluation (which consumes the JS call stack), every evaluation step returns a data structure describing "what to do next." A central loop processes these steps until the program completes.

This design enables: suspension/resume, continuation serialization, algebraic effects, tail-call elimination, and parallel/race execution — all without growing the host call stack.

## Core Concept

```mermaid
graph LR
    A[AST Node] -->|stepNode| B[Step]
    B -->|tick| C[Step]
    C -->|tick| D[Step]
    D -->|tick| E["Value + empty k"]
    E --> F[Done]
```

The evaluator has three core functions:
- **`stepNode(node, env, k)`** — Maps an AST node to the next Step (always synchronous)
- **`applyFrame(frame, value, k)`** — Processes a completed sub-result against a frame (may return Promise)
- **`tick(step)`** — Processes one step and returns the next step

The trampoline loop calls `tick()` repeatedly until it gets a `Value` step with an empty continuation stack.

## Step Types

Steps are the "instructions" that flow through the trampoline:

```mermaid
graph TD
    subgraph Steps
        Value["Value — sub-expression produced a result"]
        Eval["Eval — AST node needs evaluation"]
        Apply["Apply — frame received a value"]
        Perform["Perform — effect invoked"]
        Parallel["Parallel — concurrent branches"]
        Race["Race — first-to-complete"]
        ParallelResume["ParallelResume — resume after suspension"]
        Error["Error — async error"]
    end
```

| Step | Purpose | Next action |
|------|---------|-------------|
| **Value** | Sub-expression produced a value | Pop frame from `k`, apply it. If `k` empty → program done. |
| **Eval** | AST node needs evaluation | Call `stepNode(node, env, k)` |
| **Apply** | Frame received a value | Call `applyFrame(frame, value, k)` |
| **Perform** | `perform(eff, arg)` invoked | Search `k` for handler, dispatch |
| **Parallel** | `parallel(...)` encountered | Run branches concurrently |
| **Race** | `race(...)` encountered | First branch to complete wins |
| **ParallelResume** | Resuming parallel after suspension | Resume remaining branches |
| **Error** | Async operation failed | Route to `dvala.error` handler |

## The Main Loop

```mermaid
flowchart TD
    Start([tick]) --> Check{step.type?}

    Check -->|Value| Empty{"k empty?"}
    Empty -->|Yes| Done([Return value])
    Empty -->|No| Pop["Pop frame from k"]
    Pop --> ApplyF["applyFrame(frame, value, rest)"]
    ApplyF --> Next([Next Step])

    Check -->|Eval| StepN["stepNode(node, env, k)"]
    StepN --> Next

    Check -->|Apply| ApplyF2["applyFrame(frame, value, k)"]
    ApplyF2 --> Next

    Check -->|Perform| Dispatch["dispatchPerform(effect, arg, k)"]
    Dispatch --> Next

    Check -->|Parallel| Par["Run branches concurrently"]
    Par --> Next

    Check -->|Race| Rac["Run branches, first wins"]
    Rac --> Next

    Next --> Check
```

The sync trampoline (`runSyncTrampoline`) runs this loop directly. The async trampoline (`runAsyncTrampoline`) awaits when a step returns a Promise.

## The Continuation Stack (`k`)

The continuation stack is an array of frames representing "what to do after the current expression completes."

```mermaid
graph TD
    subgraph "Continuation Stack (k)"
        F1["EvalArgsFrame — evaluate next argument"]
        F2["NanCheckFrame — guard against NaN"]
        F3["LetBindFrame — bind result to variable"]
        F4["SequenceFrame — evaluate next statement"]
    end
    F1 --> F2 --> F3 --> F4

    style F1 fill:#e1f5fe
    style F2 fill:#e1f5fe
    style F3 fill:#e1f5fe
    style F4 fill:#e1f5fe
```

- **Top of stack** is at index 0 (innermost pending work)
- When a `Value` arrives, the top frame is popped and applied
- Frames are plain data objects — no closures — enabling serialization

## Frame Categories

```mermaid
graph TD
    subgraph "Program Flow"
        Seq[SequenceFrame]
    end

    subgraph "Branching"
        If[IfBranchFrame]
        Match[MatchFrame]
        MatchSlot[MatchSlotFrame]
    end

    subgraph "Short-Circuit"
        And[AndFrame]
        Or[OrFrame]
        Qq[QqFrame]
    end

    subgraph "Collection Building"
        Arr[ArrayBuildFrame]
        Obj[ObjectBuildFrame]
        Tpl[TemplateStringBuildFrame]
    end

    subgraph "Binding & Destructuring"
        Let[LetBindFrame]
        LetC[LetBindCompleteFrame]
        Loop[LoopBindFrame]
        LoopC[LoopBindCompleteFrame]
        LoopI[LoopIterateFrame]
        For[ForLoopFrame]
        Bind[BindingSlotFrame]
        FnArg[FnArgBindFrame]
    end

    subgraph "Function Calls"
        Eval[EvalArgsFrame]
        Call[CallFnFrame]
        Body[FnBodyFrame]
        Nan[NanCheckFrame]
    end

    subgraph "Effects"
        Setup[HandleSetupFrame]
        Handle[HandleWithFrame]
        Resume[EffectResumeFrame]
        PerfArgs[PerformArgsFrame]
    end

    subgraph "Compound Functions"
        Comp[CompFrame]
        Juxt[JuxtFrame]
        Compl[ComplementFrame]
        Every[EveryPredFrame]
        Some[SomePredFrame]
    end

    subgraph "Control Flow"
        Recur[RecurFrame]
        RecurRebind[RecurLoopRebindFrame]
    end
```

There are 43 frame types total. Each is a plain object with a `type` discriminator and an `env` reference.

## How `stepNode` Routes by Node Type

```mermaid
flowchart TD
    Node([AST Node]) --> Type{node type?}

    Type -->|Number, String| Leaf["Value(literal)"]
    Type -->|Symbol| Lookup["Value(env.lookup(name))"]
    Type -->|EffectName| Effect["Value(effectRef)"]

    Type -->|NormalExpression| NormExpr["Push EvalArgsFrame + NanCheckFrame
    Eval first argument"]

    Type -->|SpecialExpression| Special{which?}
    Special -->|if| PushIf["Push IfBranchFrame
    Eval condition"]
    Special -->|let| PushLet["Push LetBindFrame
    Eval value"]
    Special -->|do| PushSeq["Push SequenceFrame
    Eval first node"]
    Special -->|loop| PushLoop["Push LoopBindFrame
    Eval first binding"]
    Special -->|for| PushFor["Push ForLoopFrame
    Eval collection"]
    Special -->|match| PushMatch["Push MatchFrame
    Eval target"]
    Special -->|lambda| Lambda["Value(closure)
    Capture environment"]
    Special -->|perform| PushPerf["Push PerformArgsFrame
    Eval effect expr"]
    Special -->|handle...with| PushHandle["Push HandleSetupFrame
    Eval handlers"]
    Special -->|parallel| ParStep["ParallelStep"]
    Special -->|race| RaceStep["RaceStep"]
    Special -->|recur| PushRecur["Push RecurFrame
    Eval first param"]

    Type -->|TemplateString| PushTpl["Push TemplateStringBuildFrame
    Eval first segment"]
```

Leaf nodes (Number, String, Symbol) produce a `Value` immediately. Compound nodes push one or more frames onto `k` and return an `Eval` for the first sub-expression.

## Function Call Flow

A function call like `+(1, 2)` or `map(f, arr)` follows this sequence:

```mermaid
sequenceDiagram
    participant T as Trampoline
    participant S as stepNode
    participant A as applyFrame

    T->>S: Eval(+(1, 2))
    S->>T: Push [EvalArgsFrame, NanCheckFrame]
    Note right of S: Eval(1)

    T->>S: Eval(1)
    S->>T: Value(1)

    T->>A: Apply EvalArgsFrame with 1
    Note right of A: Store param[0]=1, more args
    A->>T: Eval(2)

    T->>S: Eval(2)
    S->>T: Value(2)

    T->>A: Apply EvalArgsFrame with 2
    Note right of A: All args done, dispatch +
    A->>T: Value(3)

    T->>A: Apply NanCheckFrame with 3
    Note right of A: 3 is not NaN, pass through
    A->>T: Value(3)
```

### User-Defined Function Calls

For user-defined functions, after arguments are collected:

```mermaid
flowchart TD
    Dispatch["dispatchCall with function + params"] --> FnType{function type?}

    FnType -->|Builtin| Direct["Call evaluate(params) directly
    Return Value"]

    FnType -->|UserDefined| Setup["setupUserDefinedCall"]
    Setup --> Bind["Push FnArgBindFrame
    Bind parameters via slots"]
    Bind --> Body["Push FnBodyFrame
    Eval first body node"]
    Body --> BodyDone{"More body nodes?"}
    BodyDone -->|Yes| NextBody["Advance index
    Eval next body node"]
    BodyDone -->|No| Return["Return last value"]

    FnType -->|Partial| Fill["Fill placeholders
    Re-dispatch"]
    FnType -->|Comp| Chain["Push CompFrame
    Call rightmost function"]
    FnType -->|Juxt| Multi["Push JuxtFrame
    Call each function"]
    FnType -->|Module| ModLookup["Lookup module.function
    Call evaluate()"]

    FnType -->|Expression| CallFrame["Push CallFnFrame
    Eval the function expression"]
    CallFrame --> Resolved["Function resolved
    dispatchFunction()"]
```

### Tail-Call Elimination (recur)

`recur` does not grow the stack — it rebinds and re-enters:

```mermaid
flowchart TD
    Recur["recur(newArgs...)"] --> Collect["RecurFrame collects args"]
    Collect --> Search["Walk k backward"]
    Search --> Found{"Find FnBodyFrame
    or LoopIterateFrame?"}
    Found -->|FnBodyFrame| Rebind1["Discard frames above it
    Rebind params
    Re-eval body"]
    Found -->|LoopIterateFrame| Rebind2["Discard frames above it
    Rebind loop vars
    Re-eval body"]
```

## Effect Dispatch Flow

When `perform(effect, arg)` is evaluated:

```mermaid
flowchart TD
    Perform["PerformStep(effect, arg, k)"] --> Search["Search k top-to-bottom
    for HandleWithFrame"]

    Search --> Found{"HandleWithFrame
    found?"}

    Found -->|Yes| Local["invokeHandleWithChain()"]
    Local --> Resume["Create EffectResumeFrame
    (bridges handler return to body)"]
    Resume --> Chain["Build HandleNextFunction chain"]
    Chain --> CallHandler["Call handler(arg, eff, nxt)"]

    CallHandler --> HandlerResult{"Handler action?"}
    HandlerResult -->|"Returns value"| ResumeBody["EffectResumeFrame
    redirects to perform site"]
    HandlerResult -->|"Calls nxt()"| NextHandler["Try next handler
    in chain"]
    HandlerResult -->|"Performs effect"| Outer["Walk past EffectResumeFrame
    Dispatch to outer handler"]

    Found -->|No| Host{"Host handler
    matches?"}

    Host -->|Yes| HostHandler["dispatchHostHandler()"]
    HostHandler --> Ctx["Create EffectContext"]
    Ctx --> HostAction{"Host calls..."}
    HostAction -->|"resume(value)"| ValueStep["ValueStep — continue"]
    HostAction -->|"suspend(meta)"| Suspend["SuspensionSignal
    Serialize continuation"]
    HostAction -->|"fail(msg)"| Fail["Route to dvala.error"]
    HostAction -->|"next()"| NextHost["Try next host handler"]

    Host -->|No| Std{"Standard
    handler?"}
    Std -->|Yes| StdHandler["StandardHandler
    (e.g. dvala.io.print)"]
    Std -->|No| Unhandled["Unhandled effect error"]
```

### Handler Search Priority

```mermaid
graph LR
    A["1. Local handlers
    (handle...with in k)"] --> B["2. Host handlers
    (registered via options)"]
    B --> C["3. Standard handlers
    (dvala.io.*, dvala.error)"]
    C --> D["4. Unhandled
    → error"]
```

## Parallel Execution

```mermaid
flowchart TD
    Par["parallel(expr1, expr2, expr3)"] --> Fork["Fork into 3 independent trampolines"]

    Fork --> B1["Branch 1
    Own trampoline"]
    Fork --> B2["Branch 2
    Own trampoline"]
    Fork --> B3["Branch 3
    Own trampoline"]

    B1 --> R1{Result?}
    B2 --> R2{Result?}
    B3 --> R3{Result?}

    R1 -->|Completed| C1[value1]
    R1 -->|Suspended| S1[snapshot1]
    R2 -->|Completed| C2[value2]
    R2 -->|Suspended| S2[snapshot2]
    R3 -->|Completed| C3[value3]
    R3 -->|Suspended| S3[snapshot3]

    C1 & C2 & C3 --> AllDone["All completed →
    Return [value1, value2, value3]"]

    S1 --> AnySuspend["Any suspended →
    Create ParallelResumeFrame
    Throw SuspensionSignal"]

    AnySuspend --> Resume["On resume:
    Resume suspended branches
    one at a time"]
```

All branches run concurrently via `Promise.allSettled`. If any branch suspends, the entire parallel suspends. On resume, suspended branches are resumed sequentially.

## Race Execution

```mermaid
flowchart TD
    Race["race(expr1, expr2, expr3)"] --> Fork["Fork into 3 independent trampolines
    Each with own AbortController"]

    Fork --> B1["Branch 1"]
    Fork --> B2["Branch 2"]
    Fork --> B3["Branch 3"]

    B2 -->|"Completes first"| Winner["Branch 2 wins!"]
    Winner --> Cancel["Cancel Branch 1 & 3
    via AbortController"]
    Cancel --> Return["Return Branch 2 value"]

    B1 -->|"All suspended"| Suspended["No winner →
    Suspend with race meta
    Host provides winner value"]
```

Difference from parallel: race returns a single winner value, not an array. Losing branches are cancelled.

## Evaluation Example: `let x = 1 + 2; x * 3`

```mermaid
sequenceDiagram
    participant L as Loop
    participant SN as stepNode
    participant AF as applyFrame

    Note over L: Start: Eval(do let x=1+2; x*3 end)

    L->>SN: stepNode(do...end)
    SN-->>L: Push SequenceFrame(nodes=[let x=1+2, x*3], idx=0)
    Note right of SN: Eval(let x = 1+2)

    L->>SN: stepNode(let x = 1+2)
    SN-->>L: Push LetBindFrame(target=x)
    Note right of SN: Eval(+(1, 2))

    L->>SN: stepNode(+(1, 2))
    SN-->>L: Push EvalArgsFrame + NanCheckFrame
    Note right of SN: Eval(1)

    L->>SN: stepNode(1)
    SN-->>L: Value(1)

    L->>AF: EvalArgsFrame + value=1
    AF-->>L: Store param[0]=1, Eval(2)

    L->>SN: stepNode(2)
    SN-->>L: Value(2)

    L->>AF: EvalArgsFrame + value=2
    Note right of AF: All args done, dispatch +
    AF-->>L: Value(3)

    L->>AF: NanCheckFrame + value=3
    AF-->>L: Value(3) — pass through

    L->>AF: LetBindFrame + value=3
    Note right of AF: Bind x=3, create new scope
    AF-->>L: Eval(x*3) in env{x:3}

    L->>AF: SequenceFrame + advance index
    Note right of AF: idx=1, Eval(x*3)

    L->>SN: stepNode(*(x, 3))
    SN-->>L: Push EvalArgsFrame + NanCheckFrame
    Note right of SN: Eval(x)

    L->>SN: stepNode(x)
    SN-->>L: Value(3) — from env lookup

    L->>AF: EvalArgsFrame + value=3
    AF-->>L: Eval(3)

    L->>SN: stepNode(3)
    SN-->>L: Value(3)

    L->>AF: EvalArgsFrame + value=3
    Note right of AF: All args done, dispatch *
    AF-->>L: Value(9)

    L->>AF: NanCheckFrame + value=9
    AF-->>L: Value(9)

    L->>AF: SequenceFrame — last node
    AF-->>L: Value(9)

    Note over L: k is empty → return 9
```

## Environment Model

```mermaid
graph TD
    subgraph "ContextStack"
        C0["Context 0 (innermost)
        { x: 3 }"]
        C1["Context 1 (function scope)
        { myFunc: ... }"]
        C2["Context 2 (global)
        { PI: 3.14, print: ... }"]
    end
    C0 --> C1 --> C2

    subgraph "Lookup Order"
        L1["1. Walk contexts (inner → outer)"]
        L2["2. Check host values"]
        L3["3. Not found → error"]
    end
    L1 --> L2 --> L3
```

- `env.create(context)` pushes a new scope (for let, function args, etc.)
- All contexts are plain `Record<string, {value: Any}>` — serializable
- The global context accumulates top-level bindings

## Key Invariants

1. **`stepNode` is always synchronous** — never returns a Promise
2. **`applyFrame` may return a Promise** — when builtins are async
3. **No closures on frames** — all state is plain data (enables serialization)
4. **Frames store environments by reference** — ContextStack is mutable within a scope
5. **Tail-call elimination** — `recur` rebinds and re-enters without growing `k`
6. **Effect handlers form a chain** — each handler's `nxt` passes control to the next

## Suspension & Serialization

At any point, the entire execution state is capturable:

```mermaid
graph LR
    subgraph "Runtime State"
        K["k: Frame[]"]
        CS["ContextStack[]"]
        Meta["meta: Any"]
    end

    K --> Ser["JSON Serialization"]
    CS --> Ser
    Meta --> Ser

    Ser --> Blob["SuspensionBlob (JSON)"]

    Blob --> Deser["Deserialization"]
    Deser --> K2["k: Frame[]"]
    Deser --> CS2["ContextStack[]"]
    Deser --> Meta2["meta: Any"]

    K2 --> Resume["Resume trampoline"]
```

This works because:
- All frames are plain objects (no closures)
- ContextStacks are serialized with `__csRef` markers for circular references
- The trampoline loop doesn't use the JS call stack — there's nothing hidden to capture
