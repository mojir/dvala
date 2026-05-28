import type { Any } from '@mojir/dvala-types'
import type { Ast, AstNode } from '@mojir/dvala-types'
import { isUnknownRecord } from '@mojir/dvala-types'
import type { MaybePromise } from '../maybePromise'
import type { ContextStack } from './ContextStack'

/**
 * Capability injected by the host so the engine can compile source → Ast
 * without depending on the parser directly. The TS host supplies tokenize +
 * parse; KMP supplies a precompiled-AST resolver.
 */
export type ParseSource = (
  source: string,
  options?: {
    /** Build a source map (per-nodeId positions). */
    debug?: boolean
    /** File path attached to source map's `sources` list. */
    filePath?: string
    /** Node ID allocator — supply when nodeIds must be unique against the caller's. */
    allocateNodeId?: () => number
  },
) => Ast

/**
 * Capability injected by the host so the engine's `ast/prettyPrint` builtin can
 * format AST nodes back to source. The TS host supplies the smart printer from
 * `src/prettyPrint.ts`; KMP supplies its equivalent (or stubs to `String(node)`).
 */
export type PrettyPrint = (node: AstNode) => string

interface ContextEntry {
  value: Any
}
export type Context = Record<string, ContextEntry>

export type EvaluateNode = (node: AstNode, contextStack: ContextStack) => MaybePromise<Any>

export type LookUpResult = ContextEntry | null

export function isContextEntry(value: unknown): value is ContextEntry {
  return isUnknownRecord(value) && value.value !== undefined
}
