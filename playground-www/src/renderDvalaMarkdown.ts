/**
 * Shared markdown renderer for Dvala content.
 * Renders fenced dvala code blocks using the unified renderCodeBlock.
 *
 * Used by: chapter pages, feature card modals, createModalPanel({ markdown }).
 */

import { marked } from 'marked'
import { renderCodeBlock } from './renderCodeBlock'
import { href } from './router'

/** Converts heading text to a URL-safe id, matching the sub-TOC anchor generation. */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

const renderer = new marked.Renderer()

// Add id attributes to headings so sub-TOC anchor links work
renderer.heading = ({ text, depth }) => {
  const id = slugifyHeading(text)
  return `<h${depth} id="${id}">${text}</h${depth}>\n`
}

// Rewrite cross-references between book .md files to SPA routes.
// e.g. "../05-advanced/04-suspension.md" → "/book/advanced-suspension"
renderer.link = ({ href: rawHref, text }) => {
  const mdMatch = rawHref.match(/(?:\.\.\/)?(\d+-([^/]+))\/(\d+-([^/]+))\.md(?:#(.+))?$/)
  if (mdMatch) {
    const sectionSlug = mdMatch[2]! // "advanced"
    const chapterSlug = mdMatch[4]! // "suspension"
    const hash = mdMatch[5] ? `#${mdMatch[5]}` : ''
    const chapterId = `${sectionSlug}-${chapterSlug}`
    const bookHref = href(`/book/${chapterId}`)
    return `<a href="${bookHref}${hash}" onclick="event.preventDefault();Playground.navigate('/book/${chapterId}')${hash ? `;setTimeout(()=>{const el=document.getElementById('${mdMatch[5]}');if(el)el.scrollIntoView()},80)` : ''}">${text}</a>`
  }
  return `<a href="${rawHref}">${text}</a>`
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
