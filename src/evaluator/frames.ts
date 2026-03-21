/**
 * Frame types for the trampoline evaluator.
 *
 * Each frame type represents a continuation — "what to do with the result of a
 * sub-evaluation." When the trampoline evaluates a sub-expression, it pushes a
 * frame onto the continuation stack (k). When the sub-expression produces a
 * value, the trampoline pops the frame and calls `applyFrame(frame, value, k)`
 * to determine the next step.
 *
 * All frame types are plain serializable objects — no functions, no closures.
 * This enables continuation serialization in Phase 4 (suspension & resume).
 *
 * The `env` field uses `ContextStack` for Phase 1 runtime use. In Phase 4,
 * this will be replaced with a serializable representation (the `Context[]`
 * chain without host bindings, which are re-injected on resume).
 */

import type { Any, Arr, Obj } from '../interface'
import type { DvalaModule } from '../builtin/modules/interface'
import type { BindingSlot } from '../builtin/bindingSlot'
import type { MatchSlot } from '../builtin/matchSlot'
import type { AstNode, BindingNode, BindingTarget, EffectRef, FunctionLike, NormalExpressionNode, UserDefinedFunction } from '../parser/types'
import type { MatchCase } from '../builtin/specialExpressions/match'
import type { LoopBindingNode } from '../builtin/specialExpressions/loops'
import type { SourceCodeInfo } from '../tokenizer/token'
import type { ContextStack } from './ContextStack'
import type { Snapshot } from './effectTypes'
import type { Context } from './interface'

// ---------------------------------------------------------------------------
// Program flow
// ---------------------------------------------------------------------------

/**
 * Evaluate a sequence of AST nodes in order, returning the last value.
 *
 * Used by: `do...end` (block), top-level program evaluation, function body.
 *
 * The trampoline evaluates `nodes[index]`. When the value comes back it
 * advances `index`. When all nodes are done, the last value propagates up.
 */
export interface SequenceFrame {
  type: 'Sequence'
  nodes: AstNode[]
  index: number // next node to evaluate (0-based)
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

// ---------------------------------------------------------------------------
// Special expressions — branching
// ---------------------------------------------------------------------------

/**
 * Conditional branch (`if`).
 *
 * Pushed when the condition expression is being evaluated. When the condition
 * value arrives, the trampoline picks `thenNode` or `elseNode` (or returns
 * `null` if there is no else branch).
 */
export interface IfBranchFrame {
  type: 'IfBranch'
  thenNode: AstNode
  elseNode: AstNode | undefined
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Pattern matching (`match`).
 *
 * Phase `'matchValue'`: the match-value expression is being evaluated.
 * Phase `'guard'`: a pattern matched and boundary bindings were created;
 *   the guard expression is being evaluated.
 * Phase `'body'`: the body for the matched case is being evaluated.
 *
 * `matchValue` is `null` during the `'matchValue'` phase and set once known.
 * `bindings` holds the names captured by `tryMatch` (empty until a pattern
 * matches).
 */
export interface MatchFrame {
  type: 'Match'
  phase: 'matchValue' | 'guard' | 'body'
  matchValue: Any | null
  cases: MatchCase[]
  index: number // current case (0-based)
  bindings: Record<string, Any>
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

// ---------------------------------------------------------------------------
// Special expressions — short-circuit sequential
// ---------------------------------------------------------------------------

/**
 * Short-circuit `&&` — evaluates nodes sequentially, returning the first
 * falsy value or the last value if all are truthy.
 */
export interface AndFrame {
  type: 'And'
  nodes: AstNode[]
  index: number // next node to evaluate
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Short-circuit `||` — evaluates nodes sequentially, returning the first
 * truthy value or the last value if all are falsy.
 */
export interface OrFrame {
  type: 'Or'
  nodes: AstNode[]
  index: number // next node to evaluate
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Nullish coalescing `??` — evaluates nodes sequentially, returning the
 * first non-null value. Undefined user-defined symbols are treated as null
 * (skipped without throwing `UndefinedSymbolError`).
 */
export interface QqFrame {
  type: 'Qq'
  nodes: AstNode[]
  index: number // next node to evaluate
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

// ---------------------------------------------------------------------------
// Special expressions — collection construction
// ---------------------------------------------------------------------------

/**
 * Template string construction — evaluates interpolated segments sequentially
 * and concatenates them into a string result.
 *
 * Structurally identical to ArrayBuildFrame but accumulates a string
 * via String() coercion instead of an array.
 */
export interface TemplateStringBuildFrame {
  type: 'TemplateStringBuild'
  segments: AstNode[] // all segment nodes (StringNodes and expression AstNodes)
  index: number // next segment to evaluate
  result: string // accumulated string so far
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Array literal construction (`[]` / `array`).
 *
 * Evaluates elements sequentially. Spread nodes (`...expr`) evaluate the
 * inner expression and flatten the resulting array into `result`.
 */
export interface ArrayBuildFrame {
  type: 'ArrayBuild'
  nodes: AstNode[]
  index: number // next element to evaluate
  result: Arr // accumulated array
  isSpread: boolean // whether the current node is a spread
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Object literal construction (`{}` / `object`).
 *
 * Evaluates key-value pairs sequentially. For normal entries, evaluates
 * key then value (stepping by 2). For spread entries, evaluates the spread
 * expression and merges the result into `result`.
 *
 * `currentKey` holds the evaluated key string when we're between key and
 * value evaluation (null otherwise).
 */
export interface ObjectBuildFrame {
  type: 'ObjectBuild'
  nodes: AstNode[]
  index: number // current position in nodes array
  result: Obj // accumulated object
  currentKey: string | null // evaluated key awaiting its value
  isSpread: boolean // whether current node is a spread
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

// ---------------------------------------------------------------------------
// Special expressions — binding
// ---------------------------------------------------------------------------

/**
 * `let` binding — evaluate the value expression, then process destructuring.
 *
 * The trampoline evaluates the value expression. When it completes,
 * `applyFrame` processes `evaluateBindingNodeValues(target, value, ...)`
 * and adds the resulting bindings to the context. The result of the let
 * expression is the evaluated value itself.
 */
export interface LetBindFrame {
  type: 'LetBind'
  target: BindingTarget
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * `let` binding completion — receive destructured record and add to env.
 *
 * After `BindingSlotFrame` completes processing all slots, this frame
 * receives the resulting record, adds it to the environment, and returns
 * the original value (the RHS of the let expression).
 */
export interface LetBindCompleteFrame {
  type: 'LetBindComplete'
  originalValue: Any // The RHS value to return
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * `loop` binding setup — evaluate binding values sequentially.
 *
 * Each binding's value expression is evaluated in a context that includes
 * all previously bound values (bindings can depend on earlier bindings).
 *
 * Phase `'value'`: evaluating a binding's value expression.
 * Phase `'destructure'`: value evaluated, processing destructuring defaults.
 */
export interface LoopBindFrame {
  type: 'LoopBind'
  phase: 'value' | 'destructure'
  bindingNodes: BindingNode[]
  index: number // current binding (0-based)
  context: Context // accumulated bindings so far
  body: AstNode // loop body (stored for LoopIterateFrame creation)
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * `loop` body iteration — evaluate body with `recur` handling.
 *
 * In the trampoline, `recur` does NOT throw `RecurSignal`. Instead, when
 * recur args are collected, the trampoline pops back to this frame, rebinds
 * the variables, and re-evaluates the body. This gives proper tail-call
 * elimination without stack growth.
 */
export interface LoopIterateFrame {
  type: 'LoopIterate'
  bindingNodes: BindingNode[]
  bindingContext: Context // mutable context with loop bindings
  body: AstNode
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * `loop` binding completion — receive destructured record and add to context.
 *
 * After `BindingSlotFrame` completes processing all slots, this frame
 * receives the resulting record, adds it to the loop context, and either
 * continues to the next binding or starts the loop body.
 */
export interface LoopBindCompleteFrame {
  type: 'LoopBindComplete'
  bindingNodes: BindingNode[]
  index: number // current binding (0-based)
  context: Context // accumulated bindings so far
  body: AstNode
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * State for a single binding level in a `for` loop.
 *
 * Each level iterates over a `collection`. Inner-level collections are
 * re-evaluated when outer-level bindings change.
 */
export interface ForBindingLevelState {
  collection: Arr // evaluated collection for this level
  index: number // current element index
}

/**
 * `for` multi-binding nested iteration.
 *
 * Multi-level nested loop with optional let-bindings, when-guards, and
 * while-guards at each binding level. Collects body results into an array.
 *
 * Phase describes what sub-expression is currently being evaluated:
 * - `'evalCollection'`: evaluating the collection expression for a level
 * - `'evalWhen'`: evaluating the when-guard
 * - `'evalWhile'`: evaluating the while-guard
 * - `'evalBody'`: evaluating the loop body
 */
export interface ForLoopFrame {
  type: 'ForLoop'
  bindingNodes: LoopBindingNode[]
  body: AstNode
  result: Arr // accumulated results (for `for`)
  phase: 'evalCollection' | 'evalWhen' | 'evalWhile' | 'evalBody'
  bindingLevel: number // which binding level is being processed (0-based)
  levelStates: ForBindingLevelState[] // resolved states for levels 0..bindingLevel
  context: Context // aggregated bindings from all resolved levels
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * `for` element binding completion.
 *
 * After `BindingSlotFrame` completes processing element destructuring,
 * this frame receives the resulting record, adds it to the context,
 * and continues with let-bindings or guards.
 */
export interface ForElementBindCompleteFrame {
  type: 'ForElementBindComplete'
  forFrame: ForLoopFrame // parent for frame state
  levelStates: ForBindingLevelState[]
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * `for` let-binding evaluation.
 *
 * Evaluates let-bindings at the current level sequentially.
 * Each let-binding's value is evaluated, then destructured.
 */
export interface ForLetBindFrame {
  type: 'ForLetBind'
  phase: 'evalValue' | 'destructure' // which part of the binding
  forFrame: ForLoopFrame // parent for frame state
  levelStates: ForBindingLevelState[]
  letBindings: BindingNode[]
  letIndex: number // current let-binding (0-based)
  currentValue?: Any // value being destructured (set after evalValue)
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

// ---------------------------------------------------------------------------
// Special expressions — perform (effect arguments)
// ---------------------------------------------------------------------------

/**
 * `perform` argument collection — evaluate effect ref + args sequentially.
 *
 * First evaluates the effect expression (index 0) to get an EffectRef.
 * Then evaluates each argument expression. When all are collected, produces
 * a `PerformStep` with the resolved EffectRef and argument values.
 */
export interface PerformArgsFrame {
  type: 'PerformArgs'
  argNodes: AstNode[] // all argument nodes (effect expr at index 0, then actual args)
  index: number // next node to evaluate (0-based)
  params: Arr // accumulated evaluated values
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * `recur` — evaluate parameters sequentially, then signal tail-call.
 *
 * In the trampoline, instead of throwing `RecurSignal`, the completed
 * recur frame pops the continuation stack to the nearest `LoopIterateFrame`
 * or `FnBodyFrame`, rebinds parameters, and re-enters the loop/body.
 * This eliminates the exception-based control flow used by the recursive
 * evaluator.
 */
export interface RecurFrame {
  type: 'Recur'
  nodes: AstNode[] // parameter expressions
  index: number // next param to evaluate
  params: Arr // accumulated evaluated params
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Handle recur's loop rebinding using slot-based binding.
 *
 * When recur is called inside a loop, each binding node needs to be
 * rebound to the new param value. This frame tracks progress through
 * the binding nodes.
 *
 * After binding completes for one node, the record is merged into
 * bindingContext and we move to the next node.
 */
export interface RecurLoopRebindFrame {
  type: 'RecurLoopRebind'
  bindingNodes: BindingNode[]
  bindingIndex: number // current binding being processed
  params: Arr // recur params
  bindingContext: Context // shared context to update
  body: AstNode // loop body to re-evaluate
  env: ContextStack
  remainingK: ContinuationStack // continuation after loop frame
  sourceCodeInfo?: SourceCodeInfo
}

// ---------------------------------------------------------------------------
// Special expressions — effect handling
// ---------------------------------------------------------------------------

/**
 * Bridges a handler's return value back to the perform call site.
 *
 * When `perform` matches a `HandleWithFrame`, the handler runs with a continuation
 * that excludes the current try/with/catch scope (so errors and effects from
 * the handler propagate upward per P&P semantics). However, the handler's
 * return value needs to resume the body at the perform call site with the
 * HandleWithFrame still on the stack (so subsequent performs in the same body
 * can still match handlers).
 *
 * `EffectResumeFrame` is placed below the handler's function frames in the
 * continuation stack. When the handler returns a value, this frame replaces
 * the continuation with `resumeK` — the original continuation from the
 * perform call site, with the HandleWithFrame intact.
 *
 * Error/effect semantics:
 * - Handler RETURNS value → EffectResumeFrame redirects to resumeK → body continues
 * - Handler THROWS error → error walks past EffectResumeFrame to outer_k → correct
 * - Handler PERFORMS effect → effect walks past EffectResumeFrame to outer_k → correct
 */
export interface EffectResumeFrame {
  type: 'EffectResume'
  resumeK: ContinuationStack
  /** The HandleWithFrame that spawned this handler chain. Used by
   *  tryDispatchDvalaError to skip re-entering the same handler on error. */
  sourceHandleFrame?: HandleWithFrame
  /** Set to true while the handler is executing. When an error occurs and
   *  this is true, the error is from the handler body and should NOT be
   *  re-dispatched to the source HandleWithFrame. When false (set by nxt()),
   *  the error is from downstream dispatch and CAN be caught by the same scope. */
  handlerExecuting?: boolean
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * `handle...with` effect handler boundary.
 *
 * `handle...with` effect handler boundary. Handlers are evaluated Dvala function values
 * (not AST nodes). When `perform` is called, the trampoline searches for a
 * matching `HandleWithFrame` and invokes the handler chain.
 *
 * The handlers list is an array of Dvala function values, each conforming
 * to `(eff, arg, next) -> value`. They are tried in order via the `next`
 * closure mechanism.
 */
export interface HandleWithFrame {
  type: 'HandleWith'
  handlers: Any[] // Array of Dvala function values
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Frame for evaluating the handlers expression in `handle...with`.
 *
 * First the body expressions are wrapped in a sequence. Then the handlers
 * expression is evaluated. Once handlers are resolved, a `HandleWithFrame`
 * is pushed and the body is evaluated.
 */
export interface HandleSetupFrame {
  type: 'HandleSetup'
  bodyExprs: AstNode[]
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

// ---------------------------------------------------------------------------
// Parallel resume
// ---------------------------------------------------------------------------

/**
 * Resume a `parallel(...)` expression after suspension.
 *
 * When a `parallel` has some branches that suspended and some that completed,
 * the continuation is suspended with this frame at the top. On resume, the
 * host provides a value for the first pending suspended branch.
 *
 * `applyFrame` converts this to a `ParallelResumeStep` so that `tick` can
 * handle it with access to `handlers` and `signal`.
 *
 * Fields:
 * - `branchCount`: total number of branches (for ordered result array)
 * - `completedBranches`: branches that already finished `{ index, value }`
 * - `suspendedBranches`: remaining suspended branches `{ index, snapshot }`
 *   The first entry is the one being resumed — its snapshot is NOT used because
 *   the value was already provided by the host. Subsequent entries are pending.
 */
export interface ParallelResumeFrame {
  type: 'ParallelResume'
  branchCount: number
  completedBranches: { index: number; value: Any }[]
  suspendedBranches: { index: number; snapshot: Snapshot }[]
}

// ---------------------------------------------------------------------------
// Function calls
// ---------------------------------------------------------------------------

/**
 * Evaluate function call arguments.
 *
 * Evaluates argument expressions sequentially, collecting results into
 * `params`. Handles spread nodes (flatten arrays) and placeholder `_`
 * nodes (record indices for partial application).
 *
 * `fnNode` is the first element of the `NormalExpressionNode` payload —
 * either a symbol node (for named calls) or an expression node (for
 * anonymous calls like `((fn [x] x) 5)`).
 *
 * When all arguments are collected:
 * - Named builtin symbol → dispatch to builtin's evaluate
 * - Named user symbol → look up value, push `CallFnFrame`, dispatch
 * - Anonymous expression → push `CallFnFrame`, evaluate function expression
 */
export interface EvalArgsFrame {
  type: 'EvalArgs'
  node: NormalExpressionNode // the full expression node (for dispatch info)
  index: number // next argument to evaluate
  params: Arr // accumulated evaluated arguments
  placeholders: number[] // indices of `_` placeholders
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Dispatch a function call after the function value has been resolved.
 *
 * Pushed when an anonymous function expression needs to be evaluated before
 * calling, or when a compound function type (Comp, Juxt, etc.) needs to
 * chain sub-calls. Receives the resolved function value and dispatches
 * using `executeFunction`.
 */
export interface CallFnFrame {
  type: 'CallFn'
  params: Arr // pre-evaluated arguments
  placeholders: number[] // placeholder indices (for partial application)
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * User-defined function body evaluation.
 *
 * After parameter setup (binding destructuring, defaults, rest args), the
 * function body is evaluated as a sequence. This frame also serves as the
 * target for `recur` — when recur params are collected, the trampoline
 * pops to this frame, rebinds parameters, and re-evaluates the body.
 *
 * `fn` is stored for recur handling: the parameter definitions
 * (`fn.evaluatedfunction[0]`) and captured environment
 * (`fn.evaluatedfunction[2]`) are needed to rebind.
 */
export interface FnBodyFrame {
  type: 'FnBody'
  fn: UserDefinedFunction
  bodyIndex: number // next body node to evaluate (0-based)
  env: ContextStack // function scope (includes parameter bindings)
  outerEnv: ContextStack // calling environment (needed for recur to rebind params)
  sourceCodeInfo?: SourceCodeInfo
}

// ---------------------------------------------------------------------------
// Binding destructuring
// ---------------------------------------------------------------------------

/**
 * Function argument binding — incrementally bind parameters with defaults.
 *
 * When calling a user-defined function, parameters are bound to arguments.
 * If an argument has a default value that needs evaluation, this frame
 * captures the binding state so it can resume after the default is evaluated.
 *
 * Phases:
 * - `'default'`: Evaluating a default value expression. When complete,
 *   `applyFrame` continues binding with the evaluated value.
 * - `'rest-default'`: Evaluating a default in rest argument destructuring.
 *
 * The frame stores:
 * - `fn`: The function being called (for its parameter definitions)
 * - `params`: Original call arguments (needed for rest calculation)
 * - `argIndex`: Which argument we're currently binding (0-based)
 * - `context`: Accumulated bindings so far
 * - `outerEnv`: The calling environment (for body evaluation later)
 */
export interface FnArgBindFrame {
  type: 'FnArgBind'
  phase: 'default' | 'rest-default'
  fn: UserDefinedFunction
  params: Arr // original call params
  argIndex: number // current argument index being bound
  context: Context // accumulated bindings
  outerEnv: ContextStack // calling environment
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Frame for completing one function argument's slot-based binding.
 *
 * After `startBindingSlots` finishes binding one argument, this frame
 * merges the result into the accumulated context and continues with
 * the next argument (or body if all args are bound).
 *
 * Fields:
 * - `fn`: The user-defined function being called
 * - `params`: Original call params (for calculating rest)
 * - `argIndex`: Which argument just completed binding
 * - `nbrOfNonRestArgs`: Total non-rest args count
 * - `context`: Accumulated bindings (will be mutated)
 * - `outerEnv`: Calling environment
 */
export interface FnArgSlotCompleteFrame {
  type: 'FnArgSlotComplete'
  fn: UserDefinedFunction
  params: Arr
  argIndex: number
  nbrOfNonRestArgs: number
  context: Context
  outerEnv: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Frame for completing rest argument slot-based binding.
 *
 * After `startBindingSlots` finishes binding the rest argument, this frame
 * merges the bindings into the context and proceeds to evaluate the body.
 */
export interface FnRestArgCompleteFrame {
  type: 'FnRestArgComplete'
  fn: UserDefinedFunction
  context: Context
  outerEnv: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Linearized binding slot processing frame.
 *
 * Used for frame-based destructuring without callbacks. The binding pattern
 * is pre-flattened into a linear list of slots, and this frame tracks
 * sequential processing through those slots.
 *
 * When a slot has a default that needs evaluation:
 * 1. Push this frame with current state
 * 2. Evaluate the default expression
 * 3. Resume: store evaluated value, continue to next slot
 *
 * Nested bindings with intermediate defaults (e.g., `{ a: { b } = default }`)
 * are handled via the `contexts` stack. When encountering such a slot:
 * 1. Resolve the intermediate value (from extraction or default)
 * 2. Push a new context for the nested structure
 * 3. Process nested slots, then pop and continue with parent
 *
 * Fields:
 * - `contexts`: Stack of binding contexts (last is current)
 * - `record`: Accumulated name→value bindings (shared across all contexts)
 */
export interface BindingSlotContext {
  slots: BindingSlot[]
  index: number
  rootValue: Any
}

export interface BindingSlotFrame {
  type: 'BindingSlot'
  contexts: BindingSlotContext[]
  record: Record<string, Any>
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Context for pattern matching slot processing.
 * Tracks position within a flattened match pattern.
 */
export interface MatchSlotContext {
  slots: MatchSlot[]
  index: number
  rootValue: Any
}

/**
 * Frame for evaluating pattern match slots.
 *
 * Similar to BindingSlotFrame but supports:
 * - Match failure (pattern doesn't match)
 * - Literal evaluation and comparison
 * - Type checking at each path
 *
 * When a slot needs evaluation (literal or default), this frame is pushed
 * and the node is evaluated. On resume:
 * - For literals: compare result with value; if mismatch, fail
 * - For defaults: bind the evaluated value and continue
 *
 * Fields:
 * - `contexts`: Stack of match contexts for nested patterns
 * - `record`: Accumulated bindings so far
 * - `matchFrame`: The parent MatchFrame to resume on failure or success
 * - `phase`: 'literal' when evaluating a literal for comparison,
 *            'default' when evaluating a default value
 * - `currentSlot`: The slot being processed (for reference after eval)
 * - `env`: Environment for evaluation
 */
export interface MatchSlotFrame {
  type: 'MatchSlot'
  contexts: MatchSlotContext[]
  record: Record<string, Any>
  matchFrame: MatchFrame
  phase: 'literal' | 'default'
  currentSlot: MatchSlot
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

// ---------------------------------------------------------------------------
// Compound function wrappers
// ---------------------------------------------------------------------------

/**
 * Complement function wrapper — negates the result of the wrapped function.
 *
 * Created by `(complement fn)`. When the wrapped function returns,
 * this frame applies `!` to the result.
 */
export interface ComplementFrame {
  type: 'Complement'
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Comp function iteration — chains function calls right-to-left.
 *
 * `(comp f g h)` called with `x` evaluates as `f(g(h(x)))`.
 * We iterate from right to left (index starts at len-1, decrements).
 * Each step wraps the result in an array for the next function call.
 */
export interface CompFrame {
  type: 'Comp'
  fns: Arr // array of functions to compose
  index: number // current function index (decrements from len-1 to 0)
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Juxt function iteration — calls each function with same params, collects results.
 *
 * `(juxt f g h)` called with `x` returns `[f(x), g(x), h(x)]`.
 * Each step adds the result to the accumulated array.
 */
export interface JuxtFrame {
  type: 'Juxt'
  fns: Arr // array of functions
  params: Arr // original params (same for all calls)
  index: number // current function index
  results: Arr // accumulated results
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * EveryPred function iteration — short-circuit AND across predicates.
 *
 * `(every-pred p1 p2)` returns a function that returns true iff all
 * predicates return truthy for all arguments.
 * Precomputes all (fn, param) pairs and iterates with early exit on falsy.
 */
export interface EveryPredFrame {
  type: 'EveryPred'
  checks: { fn: FunctionLike; param: Any }[] // all (fn, param) pairs
  index: number // current check index
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * SomePred function iteration — short-circuit OR across predicates.
 *
 * `(some-pred p1 p2)` returns a function that returns true if any
 * predicate returns truthy for any argument.
 * Precomputes all (fn, param) pairs and iterates with early exit on truthy.
 */
export interface SomePredFrame {
  type: 'SomePred'
  checks: { fn: FunctionLike; param: Any }[]
  index: number
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------

/**
 * NaN guard after evaluating a normal expression.
 *
 * Normal expressions go through a NaN check: if the result is `NaN`, a
 * `DvalaError` is thrown. This frame wraps that check.
 */
export interface NanCheckFrame {
  type: 'NanCheck'
  sourceCodeInfo?: SourceCodeInfo
}

// ---------------------------------------------------------------------------
// Frame union type
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all frame types.
 *
 * Each frame captures the continuation state for one recursive call pattern
 * in the evaluator. The `type` field serves as the discriminant.
 *
 * Frame categories:
 * - **Program flow**: SequenceFrame
 * - **Branching**: IfBranchFrame, MatchFrame
 * - **Short-circuit**: AndFrame, OrFrame, QqFrame
 * - **Collection construction**: ArrayBuildFrame, ObjectBuildFrame
 * - **Binding**: LetBindFrame, LoopBindFrame, LoopIterateFrame, ForLoopFrame
 * - **Control flow**: RecurFrame
 * - **Exception & effect handling**: HandleWithFrame
 * - **Function calls**: EvalArgsFrame, CallFnFrame, FnBodyFrame
 * - **Destructuring**: FnArgBindFrame, BindingSlotFrame, MatchSlotFrame
 * - **Post-processing**: NanCheckFrame
 */
// ---------------------------------------------------------------------------
// Module import
// ---------------------------------------------------------------------------

/**
 * Merges the result of evaluating a module's Dvala source with the module's
 * TypeScript functions. The source must evaluate to an object; its entries
 * are spread over the TS functions map and the combined object is returned
 * as the import result. The merged result is cached in `env` so subsequent
 * imports of the same module reuse the evaluated closures.
 */
export interface ImportMergeFrame {
  type: 'ImportMerge'
  tsFunctions: Obj
  moduleName: string
  module: DvalaModule
  env: ContextStack
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Auto-checkpoint frame: dispatches the original effect after a
 * `dvala.checkpoint` completes. Pushed when `autoCheckpoint` is enabled
 * so the checkpoint effect propagates to host handlers.
 */
export interface AutoCheckpointFrame {
  type: 'AutoCheckpoint'
  phase: 'awaitCheckpoint' | 'awaitEffect'
  effect: EffectRef
  arg: Any
  sourceCodeInfo?: SourceCodeInfo
}

export type Frame =
  // Program flow
  | SequenceFrame
  // Branching
  | IfBranchFrame

  | MatchFrame
  // Short-circuit
  | AndFrame
  | OrFrame
  | QqFrame
  // Collection construction
  | TemplateStringBuildFrame
  | ArrayBuildFrame
  | ObjectBuildFrame
  // Binding
  | LetBindFrame
  | LetBindCompleteFrame
  | LoopBindFrame
  | LoopBindCompleteFrame
  | LoopIterateFrame
  | ForLoopFrame
  | ForElementBindCompleteFrame
  | ForLetBindFrame
  // Control flow
  | RecurFrame
  | RecurLoopRebindFrame
  | PerformArgsFrame
  // Effect handling
  | EffectResumeFrame
  | HandleWithFrame
  | HandleSetupFrame
  // Compound function wrappers
  | ComplementFrame
  | CompFrame
  | JuxtFrame
  | EveryPredFrame
  | SomePredFrame
  // Parallel resume
  | ParallelResumeFrame
  // Function calls
  | EvalArgsFrame
  | CallFnFrame
  | FnBodyFrame
  // Destructuring
  | FnArgBindFrame
  | FnArgSlotCompleteFrame
  | FnRestArgCompleteFrame
  | BindingSlotFrame
  | MatchSlotFrame
  // Post-processing
  | NanCheckFrame
  // Module import
  | ImportMergeFrame
  // Auto-checkpoint
  | AutoCheckpointFrame

/**
 * Array type alias for readability — a continuation stack is just
 * an array of frames. The top of the stack is index 0.
 */
export type ContinuationStack = Frame[]
