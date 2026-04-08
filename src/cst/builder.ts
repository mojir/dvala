/**
 * CstBuilder — accumulates parser events and produces an untyped CST tree.
 *
 * The builder receives a flat stream of events from the instrumented parser:
 *   - `startNode(kind)` — opens a new node
 *   - `token(cstToken)` — adds a leaf token
 *   - `endNode()` — closes the current node
 *
 * After parsing, `finish()` returns the root `UntypedCstNode`.
 *
 * The untyped tree is then converted to the typed `CstNode` hierarchy
 * by a separate conversion module.
 */

import type { CstToken } from './types'

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface StartNodeEvent {
  type: 'startNode'
  kind: string
}

export interface TokenEvent {
  type: 'token'
  token: CstToken
}

export interface EndNodeEvent {
  type: 'endNode'
}

export type CstEvent = StartNodeEvent | TokenEvent | EndNodeEvent

// ---------------------------------------------------------------------------
// Untyped CST tree — intermediate representation before typed conversion
// ---------------------------------------------------------------------------

export interface UntypedCstNode {
  kind: string
  children: (CstToken | UntypedCstNode)[]
}

// ---------------------------------------------------------------------------
// CstBuilder
// ---------------------------------------------------------------------------

export class CstBuilder {
  /** Stack of nodes being built. The bottom is the root. */
  private stack: UntypedCstNode[] = []
  /** Whether finish() has been called. */
  private finished = false

  /**
   * Open a new CST node of the given kind. All subsequent tokens and
   * child nodes will be added as children of this node until `endNode()`
   * is called.
   */
  startNode(kind: string): void {
    this.stack.push({ kind, children: [] })
  }

  /**
   * Add a leaf token to the current node.
   */
  token(cstToken: CstToken): void {
    const current = this.current()
    current.children.push(cstToken)
  }

  /**
   * Close the current node and attach it as a child of its parent.
   * If this closes the root node, the tree is complete.
   */
  endNode(): void {
    if (this.stack.length < 2) {
      // Closing the root — leave it on the stack for finish()
      return
    }
    const completed = this.stack.pop()!
    const parent = this.current()
    parent.children.push(completed)
  }

  /**
   * Return the completed untyped CST tree.
   * Must be called exactly once after all events have been emitted.
   */
  finish(): UntypedCstNode {
    if (this.finished) {
      throw new Error('CstBuilder.finish() called more than once')
    }
    if (this.stack.length !== 1) {
      throw new Error(
        `CstBuilder.finish(): expected exactly 1 node on stack, found ${this.stack.length}. ` +
        `Mismatched startNode/endNode calls.`,
      )
    }
    this.finished = true
    return this.stack[0]!
  }

  /** The node currently being built (top of stack). */
  private current(): UntypedCstNode {
    if (this.stack.length === 0) {
      throw new Error('CstBuilder: no open node — call startNode() first')
    }
    return this.stack[this.stack.length - 1]!
  }
}
