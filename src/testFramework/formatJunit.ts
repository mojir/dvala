import { DvalaError } from '../errors'
import type { SourceCodeInfo } from '../tokenizer/token'
import { getCodeMarker } from '../utils/debug/getCodeMarker'
import type { TestRunResult } from './result'

/**
 * Format test results as JUnit XML.
 * Compatible with GitHub Actions, GitLab CI, Jenkins, etc.
 */
export function formatJunit(result: TestRunResult): { xml: string; success: boolean } {
  const tests = result.results.length
  const failures = result.results.filter(r => r.status === 'failed').length
  const skipped = result.results.filter(r => r.status === 'skipped').length
  const success = !result.bailout && failures === 0
  const time = msToSeconds(result.durationMs)

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'

  if (result.bailout) {
    // Represent a bailout as a single failing testsuite with a system-err
    xml += '<testsuites tests="0" failures="1" skipped="0" time="0">\n'
    xml += `  <testsuite name="${escapeXml(result.filePath)}" tests="0" failures="1" skipped="0" time="0">\n`
    xml += `    <testcase name="(file load)" classname="${escapeXml(result.filePath)}" time="0">\n`
    xml += `      <failure message="${escapeXml(getErrorMessage(result.bailout))}" type="BailOut">${escapeXml(getErrorDetail(result.bailout))}</failure>\n`
    xml += '    </testcase>\n'
    xml += '  </testsuite>\n'
    xml += '</testsuites>\n'
    return { xml, success: false }
  }

  xml += `<testsuites tests="${tests}" failures="${failures}" skipped="${skipped}" time="${time}">\n`
  xml += `  <testsuite name="${escapeXml(result.filePath)}" tests="${tests}" failures="${failures}" skipped="${skipped}" time="${time}">\n`

  for (const testCase of result.results) {
    // Split "group > subgroup > name" into classname="group > subgroup" name="name"
    const parts = testCase.name.split(' > ')
    const name = parts.pop()!
    const classname = parts.length > 0 ? parts.join(' > ') : result.filePath
    const caseTime = msToSeconds(testCase.durationMs)

    xml += `    <testcase name="${escapeXml(name)}" classname="${escapeXml(classname)}" time="${caseTime}">\n`

    if (testCase.status === 'failed') {
      const message = getErrorMessage(testCase.error)
      const errorType = getErrorType(testCase.error)
      const detail = getErrorDetail(testCase.error)
      xml += `      <failure message="${escapeXml(message)}" type="${escapeXml(errorType)}">${escapeXml(detail)}</failure>\n`
    } else if (testCase.status === 'skipped') {
      if (testCase.reason) {
        xml += `      <skipped message="${escapeXml(testCase.reason)}" />\n`
      } else {
        xml += '      <skipped />\n'
      }
    }

    xml += '    </testcase>\n'
  }

  xml += '  </testsuite>\n'
  xml += '</testsuites>\n'

  return { xml, success }
}

function msToSeconds(ms: number | undefined): string {
  if (ms === undefined)
    return '0'
  return (ms / 1000).toFixed(3)
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function getErrorMessage(error: unknown): string {
  if (error instanceof DvalaError)
    return error.shortMessage
  if (error instanceof Error)
    return error.message
  /* v8 ignore next 1 */
  return typeof error === 'string' ? error : 'Unknown error'
}

function getErrorType(error: unknown): string {
  if (error instanceof Error)
    return error.constructor.name
  /* v8 ignore next 1 */
  return 'Error'
}

// Build a detailed error string including location and code context
function getErrorDetail(error: unknown): string {
  const message = getErrorMessage(error)
  if (!(error instanceof DvalaError))
    return message

  const sourceCodeInfo = error.sourceCodeInfo
  if (!sourceCodeInfo || typeof sourceCodeInfo === 'string')
    return `${error.name}: ${message}`

  const location = formatLocation(sourceCodeInfo)
  const code = sourceCodeInfo.code
  const marker = getCodeMarker(sourceCodeInfo)

  return `${error.name}: ${message}\n  at ${location}\n  ${code}\n  ${marker}`
}

function formatLocation(sourceCodeInfo: SourceCodeInfo): string {
  const terms: string[] = []
  if (sourceCodeInfo.filePath)
    terms.push(sourceCodeInfo.filePath)
  if (sourceCodeInfo.position) {
    terms.push(`${sourceCodeInfo.position.line}`)
    terms.push(`${sourceCodeInfo.position.column}`)
  }
  return terms.join(':')
}
