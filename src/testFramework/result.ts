/**
 * Structured test results — format-agnostic.
 * Formatters (TAP, JUnit, JSON, etc.) consume these types.
 */
import type { SourceMap } from '../parser/types'

export interface TestCaseResult {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  /** Duration in milliseconds (only for passed/failed tests) */
  durationMs?: number
  /** Error that caused the failure (only for status: 'failed') */
  error?: unknown
  /** Reason for skipping (only for status: 'skipped') */
  reason?: string
}

export interface TestRunResult {
  filePath: string
  results: TestCaseResult[]
  /** Total duration in milliseconds */
  durationMs?: number
  /** If set, the entire file failed to load/parse before any tests ran */
  bailout?: unknown
  /** Node evaluation hit counts — present when coverage was requested */
  coverageMap?: Map<number, number>
  /** Source map for resolving node IDs to file positions — present when coverage was requested */
  sourceMap?: SourceMap
}

export function isSuccess(result: TestRunResult): boolean {
  if (result.bailout)
    return false
  return result.results.every(r => r.status !== 'failed')
}

/** Aggregate results from running multiple test files */
export interface TestSuiteResult {
  files: TestRunResult[]
  /** Total duration in milliseconds */
  durationMs: number
}

export function isSuiteSuccess(result: TestSuiteResult): boolean {
  return result.files.every(isSuccess)
}
