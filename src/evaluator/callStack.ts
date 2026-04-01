import type { SourceCodeInfo } from '../tokenizer/token'
import { isNormalExpressionNodeWithName } from '../typeGuards/astNode'
import type { ContinuationStack } from './frames'

export interface CallStackEntry {
  name: string // function name, handler effect name, or "<anonymous>"
  sourceCodeInfo?: SourceCodeInfo
}

/**
 * Walk the continuation stack and extract a human-readable call stack.
 *
 * Filters to call-relevant frames: FnBody (user-defined function calls),
 * EvalArgs (named call sites), CallFn (anonymous call sites),
 * AlgebraicHandle and HandlerClause (effect handler boundaries).
 */
export function reconstructCallStack(k: ContinuationStack): CallStackEntry[] {
  const entries: CallStackEntry[] = []
  let node = k
  while (node !== null) {
    const frame = node.head
    switch (frame.type) {
      case 'FnBody':
        entries.push({
          name: frame.fn.name ?? '<anonymous>',
          sourceCodeInfo: frame.sourceCodeInfo,
        })
        break
      case 'EvalArgs':
        // Named call site — extract the function name from the AST node
        if (isNormalExpressionNodeWithName(frame.node)) {
          entries.push({
            name: frame.node[1][0][1],
            sourceCodeInfo: frame.sourceCodeInfo,
          })
        }
        break
      case 'CallFn':
        entries.push({
          name: frame.fnName ?? '<anonymous>',
          sourceCodeInfo: frame.sourceCodeInfo,
        })
        break
      case 'AlgebraicHandle':
        entries.push({
          name: `handler(${[...frame.handler.clauseMap.keys()].join(', ')})`,
          sourceCodeInfo: frame.sourceCodeInfo,
        })
        break
      case 'HandlerClause':
        entries.push({
          name: `handler clause(${[...frame.handler.clauseMap.keys()].join(', ')})`,
          sourceCodeInfo: frame.sourceCodeInfo,
        })
        break
    }
    node = node.tail
  }
  return entries
}

/**
 * Format a call stack as a human-readable string for error messages.
 *
 * Example output:
 *   at foo           myfile.dvala:42:15
 *   at processAll    utils.dvala:10:3
 *   at <main>        entry.dvala:5:1
 */
export function formatCallStack(entries: CallStackEntry[]): string {
  if (entries.length === 0)
    return ''

  return entries
    .map(entry => {
      const location = entry.sourceCodeInfo
        ? `${entry.sourceCodeInfo.filePath ?? ''}:${entry.sourceCodeInfo.position.line}:${entry.sourceCodeInfo.position.column}`
        : '<unknown>'
      return `  at ${entry.name}  ${location}`
    })
    .join('\n')
}
