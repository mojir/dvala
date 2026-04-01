import type { AstNode } from '../parser/types'
import type { Continuation, SnapshotState } from '../evaluator/effectTypes'
import type { CallStackEntry } from '../evaluator/callStack'
import { reconstructCallStack } from '../evaluator/callStack'
import type { Any } from '../interface'
import type { ContextStack } from '../evaluator/ContextStack'
import type { Context } from '../evaluator/interface'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type StopReason = 'breakpoint' | 'step'

export interface DebugStoppedEvent {
  reason: StopReason
  node: AstNode
  continuation: Continuation
}

export interface Variable {
  name: string
  value: Any
}

export type StepCommand = 'continue' | 'stepOver' | 'stepInto' | 'stepOut'

// ---------------------------------------------------------------------------
// Debugger controller
// ---------------------------------------------------------------------------

/**
 * Core debugger — runtime-agnostic controller that uses the `onNodeEval` hook
 * to implement breakpoints, stepping, and variable inspection.
 *
 * Usage:
 * 1. Create a Debugger instance with a `onStopped` callback
 * 2. Pass `debugger.onNodeEval` as the `onNodeEval` option to `dvala.runAsync()`
 * 3. When execution hits a breakpoint or step, `onStopped` fires
 * 4. Call `debugger.continue()`, `stepOver()`, `stepInto()`, or `stepOut()`
 *    to resume execution
 */
export class Debugger {
  private breakpoints = new Set<number>()
  private onStopped: (event: DebugStoppedEvent) => void

  // Stepping state
  private pendingResolve: (() => void) | null = null
  private stepCommand: StepCommand | null = null
  private stepDepth: number = 0

  constructor(onStopped: (event: DebugStoppedEvent) => void) {
    this.onStopped = onStopped
  }

  // -------------------------------------------------------------------------
  // Breakpoint management
  // -------------------------------------------------------------------------

  public setBreakpoint(nodeId: number): void {
    this.breakpoints.add(nodeId)
  }

  public removeBreakpoint(nodeId: number): void {
    this.breakpoints.delete(nodeId)
  }

  public clearBreakpoints(): void {
    this.breakpoints.clear()
  }

  public getBreakpoints(): Set<number> {
    return new Set(this.breakpoints)
  }

  // -------------------------------------------------------------------------
  // Execution control
  // -------------------------------------------------------------------------

  /** Resume execution until next breakpoint. */
  public continue(): void {
    this.stepCommand = 'continue'
    this.resume()
  }

  /** Step to next node at the same or shallower depth (skip into function calls). */
  public stepOver(): void {
    this.stepCommand = 'stepOver'
    this.resume()
  }

  /** Step to the very next evaluated node (descend into function calls). */
  public stepInto(): void {
    this.stepCommand = 'stepInto'
    this.resume()
  }

  /** Step until we return to a shallower depth (exit current function). */
  public stepOut(): void {
    this.stepCommand = 'stepOut'
    this.resume()
  }

  // -------------------------------------------------------------------------
  // Inspection (call while stopped)
  // -------------------------------------------------------------------------

  /**
   * Get visible variables at the current stop point.
   * Walks the context chain from innermost to outermost scope.
   */
  public static getVariables(continuation: Continuation): Variable[] {
    const env: ContextStack = continuation.env
    const contexts: Context[] = env.getContextsRaw()
    const seen = new Set<string>()
    const variables: Variable[] = []

    // Walk from innermost scope outward; inner bindings shadow outer ones
    for (const context of contexts) {
      for (const [name, entry] of Object.entries(context)) {
        if (name === 'self') continue // skip internal self-reference
        if (!seen.has(name)) {
          seen.add(name)
          variables.push({ name, value: entry.value })
        }
      }
    }
    return variables
  }

  /** Get the call stack at the current stop point. */
  public static getCallStack(continuation: Continuation): CallStackEntry[] {
    return reconstructCallStack(continuation.k)
  }

  // -------------------------------------------------------------------------
  // onNodeEval hook — pass this to dvala.runAsync()
  // -------------------------------------------------------------------------

  /**
   * The `onNodeEval` hook function. Pass as `onNodeEval` in run options.
   *
   * Determines whether to stop based on breakpoints and step commands.
   * For stepOver/stepOut, calls getContinuation() to measure call depth.
   */
  public readonly onNodeEval: SnapshotState['onNodeEval'] = (
    node: AstNode,
    getContinuation: () => Continuation,
  ): void | Promise<void> => {
    const nodeId = node[2]

    // Fast path: breakpoint hit — always stop
    if (this.breakpoints.has(nodeId)) {
      return this.stop('breakpoint', node, getContinuation())
    }

    // No active step command — don't stop
    if (this.stepCommand === null || this.stepCommand === 'continue') {
      return
    }

    // Stepping — check the specific command
    switch (this.stepCommand) {
      case 'stepInto':
        // Stop on the very next node
        return this.stop('step', node, getContinuation())

      case 'stepOver': {
        // Stop when call depth is at or below the depth where stepOver was issued
        const continuation = getContinuation()
        const currentDepth = this.countCallDepth(continuation)
        if (currentDepth <= this.stepDepth) {
          return this.stop('step', node, continuation)
        }
        return
      }

      case 'stepOut': {
        // Stop when call depth is strictly below the depth where stepOut was issued
        const continuation = getContinuation()
        const currentDepth = this.countCallDepth(continuation)
        if (currentDepth < this.stepDepth) {
          return this.stop('step', node, continuation)
        }
        return
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private stop(reason: StopReason, node: AstNode, continuation: Continuation): Promise<void> {
    // Record depth for subsequent step commands
    this.stepDepth = this.countCallDepth(continuation)
    this.stepCommand = null

    return new Promise<void>(resolve => {
      this.pendingResolve = resolve
      this.onStopped({ reason, node, continuation })
    })
  }

  private resume(): void {
    if (this.pendingResolve) {
      const resolve = this.pendingResolve
      this.pendingResolve = null
      resolve()
    }
  }

  private countCallDepth(continuation: Continuation): number {
    let depth = 0
    let node = continuation.k
    while (node !== null) {
      if (node.head.type === 'FnBody') {
        depth++
      }
      node = node.tail
    }
    return depth
  }
}
