import { DvalaError } from '../errors'
import type { SourceCodeInfo } from '../tokenizer/token'
import { getCodeMarker } from '../utils/debug/getCodeMarker'
import type { TestCaseResult, TestRunResult } from './result'

/**
 * Format test results as a self-contained HTML page.
 * Inline CSS, no external dependencies — works as a local file or CI artifact.
 */
export function formatHtml(result: TestRunResult): { html: string; success: boolean } {
  const passed = result.results.filter(r => r.status === 'passed').length
  const failed = result.results.filter(r => r.status === 'failed').length
  const skipped = result.results.filter(r => r.status === 'skipped').length
  const total = result.results.length
  const success = !result.bailout && failed === 0
  const duration = result.durationMs !== undefined ? `${(result.durationMs / 1000).toFixed(3)}s` : ''

  let body: string
  if (result.bailout) {
    body = `<div class="bailout">
      <h2>Bail out!</h2>
      <pre>${esc(getErrorMessage(result.bailout))}</pre>
    </div>`
  } else {
    body = renderTestCases(result.results, result.filePath)
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Test Results — ${esc(result.filePath)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; background: #1a1a2e; color: #e0e0e0; padding: 24px; }
  .header { margin-bottom: 24px; border-bottom: 1px solid #333; padding-bottom: 16px; }
  .header h1 { font-size: 18px; font-weight: 600; color: #f0f0f0; margin-bottom: 8px; }
  .header .file { font-size: 13px; color: #888; margin-bottom: 12px; }
  .summary { display: flex; gap: 16px; font-size: 14px; }
  .summary .stat { padding: 4px 12px; border-radius: 4px; font-weight: 500; }
  .stat.pass { background: #1a3a2a; color: #4ade80; }
  .stat.fail { background: #3a1a1a; color: #f87171; }
  .stat.skip { background: #2a2a1a; color: #fbbf24; }
  .stat.total { background: #1a2a3a; color: #60a5fa; }
  .stat.time { background: #2a1a3a; color: #c084fc; }
  .tests { list-style: none; }
  .test { padding: 8px 12px; border-left: 3px solid transparent; margin-bottom: 2px; border-radius: 0 4px 4px 0; }
  .test.passed { border-left-color: #4ade80; background: #0a1a10; }
  .test.failed { border-left-color: #f87171; background: #1a0a0a; }
  .test.skipped { border-left-color: #fbbf24; background: #1a1a0a; }
  .test .name { font-size: 14px; }
  .test .duration { font-size: 12px; color: #666; margin-left: 8px; }
  .test .icon { margin-right: 8px; }
  .test .reason { font-size: 12px; color: #888; margin-left: 8px; }
  .error-detail { margin-top: 8px; padding: 8px 12px; background: #0d0d1a; border-radius: 4px; font-size: 13px; overflow-x: auto; }
  .error-detail .error-type { color: #f87171; font-weight: 600; }
  .error-detail .error-msg { color: #fca5a5; }
  .error-detail .location { color: #888; font-size: 12px; margin-top: 4px; }
  .error-detail pre { margin-top: 4px; color: #999; font-size: 12px; line-height: 1.4; }
  .bailout { background: #2a0a0a; border: 1px solid #f87171; border-radius: 8px; padding: 16px; }
  .bailout h2 { color: #f87171; margin-bottom: 8px; }
  .bailout pre { color: #fca5a5; white-space: pre-wrap; }
</style>
</head>
<body>
  <div class="header">
    <h1>Test Results</h1>
    <div class="file">${esc(result.filePath)}</div>
    <div class="summary">
      <span class="stat total">${total} tests</span>
      <span class="stat pass">${passed} passed</span>
      ${failed > 0 ? `<span class="stat fail">${failed} failed</span>` : ''}
      ${skipped > 0 ? `<span class="stat skip">${skipped} skipped</span>` : ''}
      ${duration ? `<span class="stat time">${duration}</span>` : ''}
    </div>
  </div>
  ${body}
</body>
</html>
`

  return { html, success }
}

function renderTestCases(results: TestCaseResult[], filePath: string): string {
  // Group by describe path
  const groups = new Map<string, TestCaseResult[]>()
  for (const tc of results) {
    const parts = tc.name.split(' > ')
    const group = parts.length > 1 ? parts.slice(0, -1).join(' > ') : filePath
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(tc)
  }

  let html = ''
  for (const [group, cases] of groups) {
    html += `<h3 style="font-size:13px;color:#888;margin:16px 0 8px;font-weight:400;">${esc(group)}</h3>\n`
    html += '<ul class="tests">\n'
    for (const tc of cases) {
      const name = tc.name.split(' > ').pop()!
      const icon = tc.status === 'passed' ? '&#10003;' : tc.status === 'failed' ? '&#10007;' : '&#8212;'
      const durationStr = tc.durationMs !== undefined ? `${tc.durationMs.toFixed(1)}ms` : ''

      html += `  <li class="test ${tc.status}">`
      html += `<span class="icon">${icon}</span>`
      html += `<span class="name">${esc(name)}</span>`
      if (durationStr) html += `<span class="duration">${durationStr}</span>`
      if (tc.status === 'skipped' && tc.reason) html += `<span class="reason">(${esc(tc.reason)})</span>`
      if (tc.status === 'failed' && tc.error) {
        html += renderErrorDetail(tc.error)
      }
      html += '</li>\n'
    }
    html += '</ul>\n'
  }
  return html
}

function renderErrorDetail(error: unknown): string {
  const message = getErrorMessage(error)
  const errorType = error instanceof Error ? error.constructor.name : 'Error'

  let detail = '\n    <div class="error-detail">'
  detail += `<span class="error-type">${esc(errorType)}</span>: <span class="error-msg">${esc(message)}</span>`

  if (error instanceof DvalaError) {
    const sourceCodeInfo = error.sourceCodeInfo
    if (sourceCodeInfo && typeof sourceCodeInfo !== 'string') {
      detail += `\n      <div class="location">${esc(formatLocation(sourceCodeInfo))}</div>`
      detail += `\n      <pre>${esc(sourceCodeInfo.code)}\n${esc(getCodeMarker(sourceCodeInfo))}</pre>`
    }
  }

  detail += '</div>'
  return detail
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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
