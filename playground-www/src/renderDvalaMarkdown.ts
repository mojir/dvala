/**
 * Shared markdown renderer for Dvala content.
 * Renders fenced dvala code blocks using the unified renderCodeBlock.
 *
 * Used by: tutorial pages, feature card modals, createModalPanel({ markdown }).
 */

import { marked } from 'marked'
import { renderCodeBlock } from './renderCodeBlock'

const renderer = new marked.Renderer()
renderer.code = ({ text, lang }) => {
  const rawLang = lang ?? ''
  const noRun = rawLang.includes('no-run')
  const isDvala = rawLang.startsWith('dvala') || !lang

  if (isDvala) {
    return renderCodeBlock({ code: text, noRun })
  }
  // Non-dvala code blocks — plain rendering
  return renderCodeBlock({ code: text, language: 'text', noRun: true, noEdit: true })
}

/** Render a markdown string to HTML with Dvala code block support. */
export function renderDvalaMarkdown(markdown: string): string {
  return marked.parse(markdown, { renderer }) as string
}
