import { DvalaError } from '../errors'
import type { SourceCodeInfo } from '../tokenizer/token'
import { getCodeMarker } from '../utils/debug/getCodeMarker'
import type { TestRunResult } from './result'

/**
 * Format test results as TAP v13.
 * http://testanything.org/
 */
export function formatTap(result: TestRunResult): { tap: string; success: boolean } {
  let tap = 'TAP version 13\n'
  let success = true

  if (result.bailout) {
    tap += `Bail out! ${getErrorMessage(result.bailout)}\n`
    return { tap, success: false }
  }

  tap += `1..${result.results.length}\n`

  result.results.forEach((testCase, index) => {
    const testNumber = index + 1
    switch (testCase.status) {
      case 'passed':
        tap += `ok ${testNumber} ${testCase.name}\n`
        break
      case 'skipped':
        tap += `ok ${testNumber} ${testCase.name} # skip${testCase.reason ? ` - ${testCase.reason}` : ''}\n`
        break
      case 'failed':
        success = false
        tap += `not ok ${testNumber} ${testCase.name}${getErrorYaml(testCase.error)}`
        break
    }
  })

  return { tap, success }
}

export function getErrorYaml(error: unknown): string {
  const message = getErrorMessage(error)
  /* v8 ignore next 7 */
  if (!isAbstractDvalaError(error)) {
    return `
  ---
  message: ${JSON.stringify(message)}
  ...
`
  }

  const sourceCodeInfo = error.sourceCodeInfo
  /* v8 ignore next 8 */
  if (!sourceCodeInfo || typeof sourceCodeInfo === 'string') {
    return `
  ---
  message: ${JSON.stringify(message)}
  error: ${JSON.stringify(error.name)}
  ...
`
  }

  const formattedMessage = message.includes('\n')
    ? `|\n    ${message.split(/\r?\n/).join('\n    ')}`
    : JSON.stringify(message)
  return `
  ---
  error: ${JSON.stringify(error.name)}
  message: ${formattedMessage}
  location: ${JSON.stringify(getLocation(sourceCodeInfo))}
  code:
    - "${sourceCodeInfo.code}"
    - "${getCodeMarker(sourceCodeInfo)}"
  ...
`
}

function getLocation(sourceCodeInfo: SourceCodeInfo): string {
  const terms: string[] = []
  if (sourceCodeInfo.filePath) terms.push(sourceCodeInfo.filePath)

  if (sourceCodeInfo.position) {
    terms.push(`${sourceCodeInfo.position.line}`)
    terms.push(`${sourceCodeInfo.position.column}`)
  }

  return terms.join(':')
}

function getErrorMessage(error: unknown): string {
  if (!isAbstractDvalaError(error)) {
    /* v8 ignore next 1 */
    return typeof error === 'string' ? error : error instanceof Error ? error.message : 'Unknown error'
  }
  return error.shortMessage
}

function isAbstractDvalaError(error: unknown): error is DvalaError {
  return error instanceof DvalaError
}
