/**
 * Renders book chapter pages.
 * Chapter .md files are discovered via import.meta.glob — drop a .md file in book/ and it
 * appears automatically. markdownSourcePlugin converts each .md to a raw string export.
 * Section names and chapter IDs are derived from the directory/file naming convention:
 *   book/NN-section-name/NN-chapter-name.md  →  section "Section Name", id "section-name-chapter-name"
 */

import { href } from '../router'
import { downloadIcon, hamburgerIcon } from '../icons'
import { renderDvalaMarkdown, slugifyHeading } from '../renderDvalaMarkdown'
import { renderPageHeader } from './pageHeader'

// Shared header actions for all book pages (index + chapters)
function bookHeaderActions(): string {
  // Stamp the current Dvala version into the suggested filename so downloaded
  // PDFs stay self-identifying even after multiple releases.
  const version = window.referenceData?.version
  const downloadName = version ? `the-dvala-book-v${version}.pdf` : 'the-dvala-book.pdf'
  return `
      <a class="chapter-header__toc-btn example-header__load-btn book-header__download" href="${href('/the-dvala-book.pdf')}" download="${downloadName}" onclick="Playground.downloadBookPdf(event)" aria-label="Download PDF" title="Download PDF">${downloadIcon} <span class="book-header__download-label">Download</span></a>
      <button class="chapter-header__toc-btn" onclick="Playground.toggleTocMenu(event)" aria-label="Table of contents">${hamburgerIcon}</button>`
}

interface ChapterEntry {
  id: string // URL slug, e.g. "getting-started-intro"
  title: string // extracted from first # heading in the .md
  raw: string // raw markdown string
  folder: string // display name of the containing folder
}

interface BookSection {
  name: string
  entries: ChapterEntry[]
}

// bookChaptersPlugin (rolldown.plugins.mjs) scans book/**/*.md at build time and emits this
// virtual module as a plain array — no import.meta.glob needed, works in iife output format.
import rawChapters from 'virtual:book-chapters'

function toTitleCase(slug: string): string {
  // "design-principles" → "Design Principles"
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function extractTitle(raw: string): string {
  const match = /^#\s+(.+)$/m.exec(raw)
  return match ? match[1]!.trim() : 'Untitled'
}

// Build bookSections from the virtual module, grouped by directory.
// Each entry: { path: "04-design-principles/06-testing.md", content: "..." }
const sectionMap = new Map<string, BookSection>()
for (const { path: chapterPath, content } of rawChapters) {
  const slashIdx = chapterPath.indexOf('/')
  const dirSegment = chapterPath.slice(0, slashIdx) // "04-design-principles"
  const fileSegment = chapterPath.slice(slashIdx + 1) // "06-testing.md"

  const sectionSlug = dirSegment.replace(/^\d+-/, '') // "design-principles"
  const chapterSlug = fileSegment.replace(/^\d+-/, '').replace(/\.md$/, '') // "testing"

  const sectionName = toTitleCase(sectionSlug)
  const chapterId = `${sectionSlug}-${chapterSlug}`

  if (!sectionMap.has(dirSegment)) sectionMap.set(dirSegment, { name: sectionName, entries: [] })

  sectionMap
    .get(dirSegment)!
    .entries.push({ id: chapterId, title: extractTitle(content), raw: content, folder: sectionName })
}

export const bookSections: BookSection[] = Array.from(sectionMap.values())

export const allChapters: ChapterEntry[] = bookSections.flatMap(f => f.entries)

export function renderBookIndexPage(): string {
  const next = allChapters[0] ?? null

  const sections = bookSections
    .map(
      folder => `
<section class="book-toc__group">
  <h3 class="book-toc__group-title">${escapeHtml(folder.name)}</h3>
  <ul class="book-toc__list">
    ${folder.entries
      .map(e => {
        const h2s = [...e.raw.matchAll(/^##\s+(.+)$/gm)]
        const subItems = h2s
          .map(m => {
            const text = m[1]!.trim()
            const id = slugifyHeading(text)
            return `<li class="book-toc__subitem"><a href="${href(`/book/${e.id}`)}#${id}" onclick="event.preventDefault();Playground.navigate('/book/${e.id}');setTimeout(()=>{const el=document.getElementById('${id}');if(el){el.scrollIntoView();history.replaceState(null,'',location.pathname+'#${id}')}},80)">${escapeHtml(text)}</a></li>`
          })
          .join('')
        return `<li class="book-toc__item"><a href="${href(`/book/${e.id}`)}" onclick="event.preventDefault();Playground.navigate('/book/${e.id}')">${escapeHtml(e.title)}</a>${subItems ? `<ul class="book-toc__sublist">${subItems}</ul>` : ''}</li>`
      })
      .join('')}
  </ul>
</section>`,
    )
    .join('\n')

  return `
<div class="book-page">
  ${renderPageHeader({
    title: 'The Book',
    actions: bookHeaderActions(),
    prev: null,
    up: null,
    next: next ? { path: `/book/${next.id}`, title: next.title } : null,
  })}
  <div class="book-page__content">
    <div class="book-toc">
      ${sections}
    </div>
  </div>
</div>`.trim()
}

export function renderChapterPage(id: string): string {
  const entry = allChapters.find(t => t.id === id)
  if (!entry) {
    return `<div class="book-page"><p>Chapter not found: <code>${escapeHtml(id)}</code></p></div>`
  }

  const idx = allChapters.indexOf(entry)
  const prev = idx > 0 ? allChapters[idx - 1] : null
  const next = idx < allChapters.length - 1 ? allChapters[idx + 1] : null

  // Render markdown and strip the h1 — title goes in the sticky header
  let contentHtml = renderDvalaMarkdown(entry.raw)
  contentHtml = contentHtml.replace(/<h1[^>]*>.*?<\/h1>\s*/, '')

  // Build sub-TOC from ## headings in the raw markdown
  const h2Matches = [...entry.raw.matchAll(/^##\s+(.+)$/gm)]
  const subToc =
    h2Matches.length > 1
      ? `<nav class="chapter-subtoc">${h2Matches
          .map(m => {
            const text = m[1]!.trim()
            const slug = slugifyHeading(text)
            return `<a class="chapter-subtoc__link" href="#${slug}" onclick="event.preventDefault();history.pushState(null,'',location.pathname+'#${slug}');document.getElementById('${slug}')?.scrollIntoView({behavior:'smooth'})">${escapeHtml(text)}</a>`
          })
          .join('')}</nav>`
      : ''

  return `
<div class="book-page">
  ${renderPageHeader({
    title: entry.title,
    breadcrumbs: [{ label: 'The Book', path: '/book' }, { label: entry.title }],
    actions: bookHeaderActions(),
    prev: prev ? { path: `/book/${prev.id}`, title: prev.title } : { path: '/book', title: 'Back to The Book' },
    up: { path: '/book', title: 'Back to The Book' },
    next: next ? { path: `/book/${next.id}`, title: next.title } : null,
  })}
  <div class="book-chapter__layout">
    <div class="book-page__content">
      ${contentHtml}
    </div>
    ${subToc ? `<aside class="book-chapter__sidebar">${subToc}</aside>` : ''}
  </div>
</div>`.trim()
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
