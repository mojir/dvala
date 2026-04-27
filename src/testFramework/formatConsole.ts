import { DvalaError } from '../errors'
import type { SourceCodeInfo } from '../tokenizer/token'
import { getCodeMarker } from '../utils/debug/getCodeMarker'
import type { TestRunResult } from './result'

interface ConsoleColors {
  reset: string
  bold: string
  dim: string
  red: string
  green: string
  yellow: string
  gray: string
  cyan: string
}

const ansiColors: ConsoleColors = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  gray: '\x1B[90m',
  cyan: '\x1B[36m',
}

const noColors: ConsoleColors = {
  reset: '',
  bold: '',
  dim: '',
  red: '',
  green: '',
  yellow: '',
  gray: '',
  cyan: '',
}

/**
 * Format test results for console output, similar to vitest's default reporter.
 * Set verbose=true to show every test (like vitest --reporter=verbose).
 */
export function formatConsole(
  result: TestRunResult,
  options?: { verbose?: boolean; color?: boolean },
): { text: string; success: boolean } {
  const c = (options?.color ?? true) ? ansiColors : noColors
  const verbose = options?.verbose ?? false

  const passed = result.results.filter(r => r.status === 'passed').length
  const failed = result.results.filter(r => r.status === 'failed').length
  const skipped = result.results.filter(r => r.status === 'skipped').length
  const total = result.results.length
  const success = !result.bailout && failed === 0
  const duration =
    result.durationMs !== undefined ? ` ${c.gray}(${(result.durationMs / 1000).toFixed(3)}s)${c.reset}` : ''

  const lines: string[] = []

  if (result.bailout) {
    lines.push(`${c.red}${c.bold}BAIL OUT${c.reset} ${getErrorMessage(result.bailout)}`)
    return { text: `${lines.join('\n')}\n`, success: false }
  }

  // File header
  const statusIcon = success ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`
  lines.push(`${statusIcon} ${c.bold}${result.filePath}${c.reset}${duration}`)

  // Group tests by describe path
  const groups = new Map<string, typeof result.results>()
  for (const tc of result.results) {
    const parts = tc.name.split(' > ')
    const group = parts.length > 1 ? parts.slice(0, -1).join(' > ') : ''
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(tc)
  }

  // Show tests — in default mode, only show failures and skips
  for (const [group, cases] of groups) {
    const hasVisible = verbose || cases.some(tc => tc.status !== 'passed')
    if (!hasVisible) continue

    if (group) {
      lines.push(`  ${c.gray}${group}${c.reset}`)
    }

    for (const tc of cases) {
      const name = tc.name.split(' > ').pop()!
      const durationStr = tc.durationMs !== undefined ? ` ${c.gray}${tc.durationMs.toFixed(0)}ms${c.reset}` : ''

      if (tc.status === 'passed' && verbose) {
        lines.push(`    ${c.green}✓${c.reset} ${c.dim}${name}${c.reset}${durationStr}`)
      } else if (tc.status === 'failed') {
        lines.push(`    ${c.red}✗${c.reset} ${name}${durationStr}`)
        // Show error details inline
        const detail = getErrorDetail(tc.error, c)
        if (detail) lines.push(detail)
      } else if (tc.status === 'skipped') {
        const reason = tc.reason ? ` (${tc.reason})` : ''
        lines.push(`    ${c.yellow}○${c.reset} ${c.dim}${name}${reason}${c.reset}`)
      }
    }
  }

  // Summary line
  lines.push('')
  const parts: string[] = []
  if (passed > 0) parts.push(`${c.green}${c.bold}${passed} passed${c.reset}`)
  if (failed > 0) parts.push(`${c.red}${c.bold}${failed} failed${c.reset}`)
  if (skipped > 0) parts.push(`${c.yellow}${skipped} skipped${c.reset}`)
  lines.push(` Tests  ${parts.join(`${c.dim} | ${c.reset}`)} ${c.gray}(${total})${c.reset}`)

  return { text: `${lines.join('\n')}\n`, success }
}

function getErrorDetail(error: unknown, c: ConsoleColors): string | null {
  const message = getErrorMessage(error)
  const lines: string[] = []

  lines.push(`      ${c.red}${message}${c.reset}`)

  if (error instanceof DvalaError) {
    const sourceCodeInfo = error.sourceCodeInfo
    if (sourceCodeInfo && typeof sourceCodeInfo !== 'string') {
      const location = formatLocation(sourceCodeInfo)
      lines.push(`      ${c.gray}at ${location}${c.reset}`)
      lines.push(`      ${c.dim}${sourceCodeInfo.code}${c.reset}`)
      lines.push(`      ${c.dim}${getCodeMarker(sourceCodeInfo)}${c.reset}`)
    }
  }

  return lines.join('\n')
}

function getErrorMessage(error: unknown): string {
  if (error instanceof DvalaError) return error.shortMessage
  if (error instanceof Error) return error.message
  /* v8 ignore next 1 */
  return typeof error === 'string' ? error : 'Unknown error'
}

function formatLocation(sourceCodeInfo: SourceCodeInfo): string {
  const terms: string[] = []
  if (sourceCodeInfo.filePath) terms.push(sourceCodeInfo.filePath)
  if (sourceCodeInfo.position) {
    terms.push(`${sourceCodeInfo.position.line}`)
    terms.push(`${sourceCodeInfo.position.column}`)
  }
  return terms.join(':')
}
