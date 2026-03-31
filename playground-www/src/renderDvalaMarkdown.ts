/**
 * Shared markdown renderer for Dvala content.
 * Renders fenced dvala code blocks using the unified renderCodeBlock.
 *
 * Used by: chapter pages, feature card modals, createModalPanel({ markdown }).
 */

import { marked } from 'marked'
import { renderCodeBlock } from './renderCodeBlock'

/** Converts heading text to a URL-safe id, matching the sub-TOC anchor generation. */
export function slugifyHeading(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
}

const renderer = new marked.Renderer()

// Add id attributes to headings so sub-TOC anchor links work
renderer.heading = ({ text, depth }) => {
  const id = slugifyHeading(text)
  return `<h${depth} id="${id}">${text}</h${depth}>\n`
}

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
