/**
 * Unified code block renderer.
 *
 * Renders a code block with syntax highlighting, optional execution output,
 * and hover action buttons (edit, copy). Used by book chapters, docs, feature
 * cards, snapshot panels, and anywhere code is displayed.
 */

import { tokenizeToHtml } from './SyntaxOverlay'
import { runExampleCode } from './runExampleCode'

const copyIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"/></svg>'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatOutput(output: string): string {
  const lines = output.split('\n')
  const prefix = '<span class="output-arrow">=&gt;</span> '
  const indent = '   '
  return prefix + lines.map((line, i) => i === 0 ? escapeHtml(line) : indent + escapeHtml(line)).join('\n')
}

export interface CodeBlockOptions {
  code: string
  language?: 'dvala' | 'json' | 'text'
  noRun?: boolean
  noEdit?: boolean
  noCopy?: boolean
}

/** Render a code block with syntax highlighting, optional execution, and action buttons. */
export function renderCodeBlock(options: CodeBlockOptions): string {
  const { code, language = 'dvala', noRun = false, noEdit = false, noCopy = false } = options

  const isDvala = language === 'dvala'
  const highlighted = isDvala ? tokenizeToHtml(code) : escapeHtml(code)
  const encoded = btoa(encodeURIComponent(code))

  // Execution output (Dvala only)
  const output = isDvala && !noRun ? runExampleCode(code) : null
  const outputHtml = output !== null
    ? `<div class="doc-page__example-output">${formatOutput(output)}</div>`
    : ''

  // Action buttons
  const buttons: string[] = []
  if (!noEdit) {
    buttons.push(`<button class="doc-page__example-action-btn doc-page__example-use-btn" onclick="Playground.loadEncodedCode('${encoded}')">Use in playground</button>`)
  }
  if (!noCopy) {
    buttons.push(`<button class="doc-page__example-action-btn" title="Copy" onclick="Playground.copyCode('${encoded}')">${copyIcon}</button>`)
  }
  const actionBar = buttons.length > 0
    ? `<div class="doc-page__example-action-bar">${buttons.join('')}</div>`
    : ''

  return `<div class="doc-page__example">
  <div class="doc-page__example-code-wrap">
    <pre class="doc-page__example-code"><code>${highlighted}</code></pre>
    ${actionBar}
  </div>
  ${outputHtml}
</div>`
}
