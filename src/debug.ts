/**
 * Time-travel debugger for Dvala.
 *
 * Entry point: `@mojir/dvala/debug`
 *
 * Creates a debugger that intercepts every compound expression evaluation,
 * recording the full execution state as serializable blobs. This enables:
 * - Step forward/backward through execution
 * - Jump to any point in history
 * - Re-run from any step with an alternate value (alternate timelines)
 * - Performance profiling via timestamps
 *
 * Usage:
 * ```typescript
 * import { createDebugger } from '@mojir/dvala/debug'
 *
 * const dbg = createDebugger({ handlers })
 * await dbg.run(source)
 * await dbg.stepForward()
 * await dbg.stepBackward()
 * await dbg.jumpTo(5)
 * await dbg.rerunFrom(3, 0.42) // alternate timeline
 * ```
 */

import type { Any, Obj } from './interface'
import { DvalaError } from './errors'
import type { DvalaModule } from './builtin/modules/interface'
import { createContextStack } from './evaluator/ContextStack'
import { evaluateWithEffects } from './evaluator/trampoline-evaluator'
import { tokenize } from './tokenizer/tokenize'
import { minifyTokenStream } from './tokenizer/minifyTokenStream'
import { parse } from './parser'
import { resume } from './resume'
import type { Handlers, RunResult, Snapshot } from './evaluator/effectTypes'
import { initCoreDvalaSources } from './builtin/normalExpressions/initCoreDvala'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Information about a single evaluation step.
 * Provided in each `HistoryEntry` for UI display and inspection.
 */
export interface StepInfo {
  /** Source code line where the expression appears. */
  expression: string
  /** The value produced by evaluating this expression. */
  value: Any
  /** Source location of the expression. */
  location: { line: number; column: number }
  /** All in-scope bindings at this point in execution. */
  env: Record<string, Any>
}

/**
 * A single entry in the debugger's execution history.
 * Contains the captured snapshot (for resuming) and step info (for UI).
 */
export interface HistoryEntry {
  /** Captured snapshot at this point — opaque to host. */
  snapshot: Snapshot
  /** Step info for UI display: expression, value, location, bindings. */
  step: StepInfo
  /** Milliseconds since epoch — enables performance profiling. */
  timestamp: number
}

/**
 * Options for creating a debugger instance.
 */
export interface DebuggerOptions {
  /** Host effect handlers (e.g., 'llm.complete'). */
  handlers?: Handlers
  /** Plain value bindings accessible from Dvala code. */
  bindings?: Record<string, Any>
  /** Dvala modules to make available via import. */
  modules?: DvalaModule[]
}

/**
 * The Dvala time-travel debugger interface.
 *
 * After `run(source)`, the debugger pauses at the first debug step.
 * Use `stepForward`/`stepBackward`/`jumpTo` to navigate execution history.
 * Use `rerunFrom` to explore alternate timelines.
 */
export interface DvalaDebugger {
  /** Run a Dvala program in debug mode. Pauses at the first debug step. */
  run: (source: string) => Promise<RunResult>

  /** Advance one step forward in execution. */
  stepForward: () => Promise<RunResult>

  /** Go back one step in execution history. */
  stepBackward: () => Promise<RunResult>

  /** Jump to a specific step in history. */
  jumpTo: (index: number) => Promise<RunResult>

  /**
   * Re-run from a specific step with an alternate value.
   * Discards history after the given index — creates a new timeline.
   */
  rerunFrom: (index: number, alternateValue: Any) => Promise<RunResult>

  /** The complete execution history. */
  readonly history: HistoryEntry[]

  /** The index of the current step in history. */
  readonly currentStep: number

  /** The current history entry (shorthand for `history[currentStep]`). */
  readonly current: HistoryEntry | undefined
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build an AST from source code with debug data (sourceCodeInfo on nodes).
 * Uses `debug: true` in tokenization to capture source positions and code.
 */
function buildDebugAst(source: string) {
  const tokenStream = tokenize(source, true, undefined)
  const minified = minifyTokenStream(tokenStream, { removeWhiteSpace: true })
  return {
    body: parse(minified),
    hasDebugData: true,
  }
}

/**
 * Parse the step info from the suspension metadata.
 * The meta is the stepInfo object passed to suspend() by the debug handler.
 */
function parseStepInfo(meta: Any): StepInfo {
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return { expression: '', value: null, location: { line: 0, column: 0 }, env: {} }
  }
  const obj = meta as Obj
  const location = obj.location as Obj | undefined
  return {
    expression: (obj.expression as string) ?? '',
    value: obj.value as Any,
    location: {
      line: (location?.line as number) ?? 0,
      column: (location?.column as number) ?? 0,
    },
    env: (obj.env as Record<string, Any>) ?? {},
  }
}

// ---------------------------------------------------------------------------
// createDebugger
// ---------------------------------------------------------------------------

/**
 * Create a time-travel debugger instance.
 *
 * The debugger intercepts every compound expression evaluation by injecting
 * a `dvala.debug.step` effect handler that suspends at each step. Each
 * suspension captures the full execution state as a serializable blob,
 * enabling forward/backward navigation and alternate timelines.
 *
 * ```typescript
 * const dbg = createDebugger({
 *   handlers: {
 *     'llm.complete': async ({ args, resume }) => resume('mocked')
 *   }
 * })
 * await dbg.run(source)
 * await dbg.stepForward()
 * await dbg.stepBackward()
 * ```
 */
export function createDebugger(options?: DebuggerOptions): DvalaDebugger {
  initCoreDvalaSources()
  const history: HistoryEntry[] = []
  let currentStep = -1
  const userHandlers = options?.handlers ?? []
  const bindings = options?.bindings
  const modules = options?.modules

  // The debug handler always suspends with the step info as meta.
  // This pauses execution at each compound expression, capturing the
  // continuation as a serializable blob.
  const debugHandler = async (ctx: { arg: Any; suspend: (meta?: Any) => void }) => {
    ctx.suspend(ctx.arg)
  }

  // Merge user handlers with the debug step handler
  const handlers: Handlers = [
    ...userHandlers,
    { pattern: 'dvala.debug.step', handler: debugHandler },
  ]

  /**
   * Process a RunResult from the trampoline.
   * If suspended at a debug step, record the history entry.
   * Returns the RunResult for the caller.
   */
  function processResult(result: RunResult): RunResult {
    if (result.type === 'suspended') {
      const stepInfo = parseStepInfo(result.snapshot.meta ?? null)
      const entry: HistoryEntry = {
        snapshot: result.snapshot,
        step: stepInfo,
        timestamp: Date.now(),
      }
      // Append to history (discard anything after currentStep for new timelines)
      history.length = currentStep + 1
      history.push(entry)
      currentStep = history.length - 1
    } else if (result.type === 'completed') {
      // Program finished — no more steps to take
      // currentStep stays at the last recorded step
    }
    return result
  }

  /**
   * Resume from a specific history entry's snapshot with a given value.
   */
  async function resumeFromSnapshot(snapshot: Snapshot, value: Any): Promise<RunResult> {
    return resume(snapshot, value, { handlers, bindings, modules })
  }

  const debugger_: DvalaDebugger = {
    get history() {
      return history
    },

    get currentStep() {
      return currentStep
    },

    get current() {
      return currentStep >= 0 && currentStep < history.length
        ? history[currentStep]
        : undefined
    },

    async run(source: string): Promise<RunResult> {
      // Reset state
      history.length = 0
      currentStep = -1

      try {
        const modulesMap = modules
          ? new Map(modules.map(m => [m.name, m]))
          : undefined
        const contextStack = createContextStack(
          { bindings },
          modulesMap,
        )
        const ast = buildDebugAst(source)
        const result = await evaluateWithEffects(ast, contextStack, handlers, undefined, {
          values: bindings as Record<string, unknown> | undefined,
          modules: modulesMap,
        })
        return processResult(result)
      } catch (error) {
        if (error instanceof DvalaError) {
          return { type: 'error', error }
        }
        return { type: 'error', error: new DvalaError(`${error}`, undefined) }
      }
    },

    async stepForward(): Promise<RunResult> {
      // If we're not at the end of history, just advance the pointer
      if (currentStep < history.length - 1) {
        currentStep++
        return { type: 'suspended', snapshot: history[currentStep]!.snapshot }
      }

      // At the end of history — need to actually resume execution
      if (currentStep < 0 || currentStep >= history.length) {
        return { type: 'error', error: new DvalaError('No current step to advance from', undefined) }
      }

      const entry = history[currentStep]!
      // Resume with the original expression value — the DebugStepFrame(awaitPerform)
      // passes this through to the next frame
      const result = await resumeFromSnapshot(entry.snapshot, entry.step.value)
      return processResult(result)
    },

    async stepBackward(): Promise<RunResult> {
      if (currentStep <= 0) {
        return { type: 'error', error: new DvalaError('Already at the beginning of execution history', undefined) }
      }
      currentStep--
      const entry = history[currentStep]!
      return { type: 'suspended', snapshot: entry.snapshot }
    },

    async jumpTo(index: number): Promise<RunResult> {
      if (index < 0 || index >= history.length) {
        return { type: 'error', error: new DvalaError(`Step index ${index} out of range (0..${history.length - 1})`, undefined) }
      }
      currentStep = index
      const entry = history[currentStep]!
      return { type: 'suspended', snapshot: entry.snapshot }
    },

    async rerunFrom(index: number, alternateValue: Any): Promise<RunResult> {
      if (index < 0 || index >= history.length) {
        return { type: 'error', error: new DvalaError(`Step index ${index} out of range (0..${history.length - 1})`, undefined) }
      }

      // Truncate history after the rerun point
      currentStep = index
      history.length = index + 1

      const entry = history[index]!
      // Resume with the alternate value — the DebugStepFrame(awaitPerform)
      // passes this through instead of the original expression value
      const result = await resumeFromSnapshot(entry.snapshot, alternateValue)
      return processResult(result)
    },
  }

  return debugger_
}
