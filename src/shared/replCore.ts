import type { RunResult } from '../evaluator/effectTypes'

type ReplHistoryEntry = { type: 'result'; value: unknown } | { type: 'error'; error: string }

export interface ReplBinding {
  result: unknown
  error: string | null
  history: ReplHistoryEntry[]
}

export function applyReplBinding(
  bindings: Record<string, unknown>,
  repl: { result: unknown; error: string | null; history: readonly ReplHistoryEntry[] },
): void {
  bindings.REPL = {
    result: repl.result,
    error: repl.error,
    history: [...repl.history],
  } satisfies ReplBinding
}

type ReplLineSuccess = {
  ok: true
  runResult: Exclude<RunResult, { type: 'error' }>
  value: unknown
  scope: Record<string, unknown>
  repl: ReplBinding
}

type ReplLineError = {
  ok: false
  error: unknown
  scope: Record<string, unknown>
  repl: ReplBinding
}

export async function executeReplLine(params: {
  expression: string
  scope: Record<string, unknown>
  repl: { result: unknown; error: string | null; history: readonly ReplHistoryEntry[] }
  historySlots?: number
  formatError?: (error: unknown) => string
  run: (expression: string, scope: Record<string, unknown>) => Promise<RunResult>
}): Promise<ReplLineSuccess | ReplLineError> {
  const runScope = { ...params.scope }
  applyReplBinding(runScope, params.repl)

  const runResult = await params.run(params.expression, runScope)
  const historySlots = params.historySlots ?? 9
  const formatError = params.formatError ?? (error => String(error))

  if (runResult.type === 'error') {
    const errorEntry = { type: 'error', error: formatError(runResult.error) } as const
    const repl: ReplBinding = {
      result: params.repl.result,
      error: errorEntry.error,
      history: [errorEntry, ...params.repl.history].slice(0, historySlots),
    }
    const scope = { ...params.scope }
    applyReplBinding(scope, repl)
    return {
      ok: false,
      error: runResult.error,
      scope,
      repl,
    }
  }

  const value = runResult.type === 'completed' ? runResult.value : null
  const resultEntry = { type: 'result', value } as const
  const repl: ReplBinding = {
    result: value,
    error: null,
    history: [resultEntry, ...params.repl.history].slice(0, historySlots),
  }
  const scope = {
    ...runScope,
    ...(runResult.type === 'completed' ? (runResult.scope ?? {}) : {}),
  }
  applyReplBinding(scope, repl)

  return {
    ok: true,
    runResult,
    value,
    scope,
    repl,
  }
}
