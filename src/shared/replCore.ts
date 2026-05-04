import type { RunResult } from '../evaluator/effectTypes'

export function mergeReplResultIntoScope(scope: Record<string, unknown>, value: unknown): void {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    Object.assign(scope, value as Record<string, unknown>)
  }
}

export function loadReplSourceIntoScope(params: {
  scope: Record<string, unknown>
  source: string
  filePath?: string
  run: (source: string, filePath?: string) => unknown
}): Record<string, unknown> {
  const result = params.run(params.source, params.filePath)
  mergeReplResultIntoScope(params.scope, result)
  return params.scope
}

export function applyReplHistoryVariables(
  bindings: Record<string, unknown>,
  historyResults: readonly unknown[],
  historySlots = 9,
): void {
  for (let i = 1; i <= historySlots; i++) delete bindings[`*${i}*`]
  historyResults.slice(0, historySlots).forEach((value, i) => {
    bindings[`*${i + 1}*`] = value
  })
}

type ReplLineSuccess = {
  ok: true
  runResult: Exclude<RunResult, { type: 'error' }>
  value: unknown
  scope: Record<string, unknown>
  historyResults: unknown[]
}

type ReplLineError = {
  ok: false
  error: unknown
  scope: Record<string, unknown>
  historyResults: unknown[]
}

export async function executeReplLine(params: {
  expression: string
  scope: Record<string, unknown>
  historyResults: readonly unknown[]
  historySlots?: number
  run: (expression: string, scope: Record<string, unknown>) => Promise<RunResult>
}): Promise<ReplLineSuccess | ReplLineError> {
  const runResult = await params.run(params.expression, params.scope)
  if (runResult.type === 'error') {
    return {
      ok: false,
      error: runResult.error,
      scope: { ...params.scope },
      historyResults: [...params.historyResults],
    }
  }

  const value = runResult.type === 'completed' ? runResult.value : null
  const historySlots = params.historySlots ?? 9
  const historyResults = [value, ...params.historyResults].slice(0, historySlots)
  const scope = {
    ...params.scope,
    ...(runResult.type === 'completed' ? (runResult.scope ?? {}) : {}),
  }
  applyReplHistoryVariables(scope, historyResults, historySlots)

  return {
    ok: true,
    runResult,
    value,
    scope,
    historyResults,
  }
}
