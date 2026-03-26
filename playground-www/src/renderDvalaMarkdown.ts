/**
 * Shared markdown renderer for Dvala content.
 * Renders fenced dvala code blocks with syntax highlighting, execution,
 * and edit/copy action buttons.
 *
 * Used by: tutorial pages, feature card modals.
 */

import { marked } from 'marked'
import { tokenizeToHtml } from './SyntaxOverlay'
import { runExampleCode } from './runExampleCode'

const penIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83l3.75 3.75z"/></svg>'
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

const renderer = new marked.Renderer()
renderer.code = ({ text, lang }) => {
  const rawLang = lang ?? ''
  const noRun = rawLang.includes('no-run')
  const isDvala = rawLang.startsWith('dvala') || !lang
  const highlighted = isDvala ? tokenizeToHtml(text) : escapeHtml(text)
  const encoded = btoa(encodeURIComponent(text))

  const output = isDvala && !noRun ? runExampleCode(text) : null
  const outputHtml = output !== null
    ? `<div class="doc-page__example-output">${formatOutput(output)}</div>`
    : ''

  return `<div class="doc-page__example">
  <div class="doc-page__example-code-wrap">
    <pre class="doc-page__example-code"><code>${highlighted}</code></pre>
    <div class="doc-page__example-action-bar">
      <button class="doc-page__example-action-btn" title="Load in editor" onclick="Playground.loadEncodedCode('${encoded}')">${penIcon}</button>
      <button class="doc-page__example-action-btn" title="Copy" onclick="Playground.copyCode('${encoded}')">${copyIcon}</button>
    </div>
  </div>
  ${outputHtml}
</div>`
}

/** Render a markdown string to HTML with Dvala code block support. */
export function renderDvalaMarkdown(markdown: string): string {
  return marked.parse(markdown, { renderer }) as string
}
