/**
 * Renders book chapter pages.
 * Chapter .md files are imported as raw strings via markdownSourcePlugin.
 * Rendered with marked. Navigation between chapters provided.
 */

import { href, navigate } from '../router'
import { renderDvalaMarkdown, slugifyHeading } from '../renderDvalaMarkdown'

export interface ChapterEntry {
  id: string // URL slug, e.g. "getting-started"
  title: string // extracted from first # heading in the .md
  raw: string // raw markdown string
  folder: string // display name of the containing folder
}

export interface BookSection {
  name: string
  entries: ChapterEntry[]
}

// Import all chapter .md files as raw strings
import raw_01_01 from '../../../book/01-getting-started/01-intro.md'
import raw_01_02 from '../../../book/01-getting-started/02-getting-started.md'
import raw_02_01 from '../../../book/02-core-language/01-data-types.md'
import raw_02_02 from '../../../book/02-core-language/02-operators.md'
import raw_02_03 from '../../../book/02-core-language/03-lexical-scoping.md'
import raw_02_04 from '../../../book/02-core-language/04-functions.md'
import raw_03_01 from '../../../book/03-data-and-control-flow/01-collections.md'
import raw_03_02 from '../../../book/03-data-and-control-flow/02-destructuring.md'
import raw_03_03 from '../../../book/03-data-and-control-flow/03-control-flow.md'
import raw_03_04 from '../../../book/03-data-and-control-flow/04-pattern-matching.md'
import raw_03_05 from '../../../book/03-data-and-control-flow/05-loops-and-recursion.md'
import raw_03_06 from '../../../book/03-data-and-control-flow/06-pipes-and-data-flow.md'
import raw_04_01 from '../../../book/04-design-principles/01-expression-oriented.md'
import raw_04_02 from '../../../book/04-design-principles/02-immutability.md'
import raw_04_03 from '../../../book/04-design-principles/03-purity.md'
import raw_04_04 from '../../../book/04-design-principles/04-normal-vs-special.md'
import raw_04_05 from '../../../book/04-design-principles/05-tail-call-optimization.md'
import raw_05_01 from '../../../book/05-advanced/01-modules.md'
import raw_05_02 from '../../../book/05-advanced/02-effects.md'
import raw_05_03 from '../../../book/05-advanced/03-implicit-async.md'
import raw_05_04 from '../../../book/05-advanced/04-suspension.md'
import raw_05_05 from '../../../book/05-advanced/05-concurrency.md'
import raw_05_06 from '../../../book/05-advanced/06-macros.md'

function extractTitle(raw: string): string {
  const match = /^#\s+(.+)$/m.exec(raw)
  return match ? match[1]!.trim() : 'Untitled'
}

function makeEntry(id: string, raw: string, folder: string): ChapterEntry {
  return { id, title: extractTitle(raw), raw, folder }
}

export const bookSections: BookSection[] = [
  {
    name: 'Getting Started',
    entries: [
      makeEntry('getting-started-intro', raw_01_01, 'Getting Started'),
      makeEntry('getting-started-walkthrough', raw_01_02, 'Getting Started'),
    ],
  },
  {
    name: 'Core Language',
    entries: [
      makeEntry('core-language-data-types', raw_02_01, 'Core Language'),
      makeEntry('core-language-operators', raw_02_02, 'Core Language'),
      makeEntry('core-language-lexical-scoping', raw_02_03, 'Core Language'),
      makeEntry('core-language-functions', raw_02_04, 'Core Language'),
    ],
  },
  {
    name: 'Data and Control Flow',
    entries: [
      makeEntry('data-and-control-flow-collections', raw_03_01, 'Data and Control Flow'),
      makeEntry('data-and-control-flow-destructuring', raw_03_02, 'Data and Control Flow'),
      makeEntry('data-and-control-flow-control-flow', raw_03_03, 'Data and Control Flow'),
      makeEntry('data-and-control-flow-pattern-matching', raw_03_04, 'Data and Control Flow'),
      makeEntry('data-and-control-flow-loops-and-recursion', raw_03_05, 'Data and Control Flow'),
      makeEntry('data-and-control-flow-pipes-and-data-flow', raw_03_06, 'Data and Control Flow'),
    ],
  },
  {
    name: 'Design Principles',
    entries: [
      makeEntry('design-principles-expression-oriented', raw_04_01, 'Design Principles'),
      makeEntry('design-principles-immutability', raw_04_02, 'Design Principles'),
      makeEntry('design-principles-purity', raw_04_03, 'Design Principles'),
      makeEntry('design-principles-normal-vs-special', raw_04_04, 'Design Principles'),
      makeEntry('design-principles-tail-call-optimization', raw_04_05, 'Design Principles'),
    ],
  },
  {
    name: 'Advanced',
    entries: [
      makeEntry('advanced-modules', raw_05_01, 'Advanced'),
      makeEntry('advanced-effects', raw_05_02, 'Advanced'),
      makeEntry('advanced-implicit-async', raw_05_03, 'Advanced'),
      makeEntry('advanced-suspension', raw_05_04, 'Advanced'),
      makeEntry('advanced-concurrency', raw_05_05, 'Advanced'),
      makeEntry('advanced-macros', raw_05_06, 'Advanced'),
    ],
  },
]

export const allChapters: ChapterEntry[] = bookSections.flatMap(f => f.entries)

// Navigates to overview (/book) if 'overview' selected, otherwise to the chapter
const tocNavHandler = "(this.value === 'overview' ? Playground.navigate('/book') : Playground.navigate('/book/' + this.value)); this.blur()"

// Builds the TOC <option>/<optgroup> list; pass null activeId for the overview page
function buildTocOptions(activeId: string | null): string {
  const overviewSelected = activeId === null ? ' selected' : ''
  const overviewOption = `<option value="overview"${overviewSelected}>Overview</option>`
  const folderOptions = bookSections.map(folder => {
    const options = folder.entries.map(e => {
      const selected = e.id === activeId ? ' selected' : ''
      return `<option value="${e.id}"${selected}>${escapeHtml(e.title)}</option>`
    }).join('')
    return `<optgroup label="${escapeHtml(folder.name)}">${options}</optgroup>`
  }).join('')
  return overviewOption + folderOptions
}

export function renderBookIndexPage(): string {
  const next = allChapters[0] ?? null

  const nextBtn = next
    ? `<a class="chapter-header__nav-btn" href="${href(`/book/${next.id}`)}" onclick="event.preventDefault();Playground.navigate('/book/${next.id}')" title="${escapeHtml(next.title)}">→</a>`
    : '<span class="chapter-header__nav-btn chapter-header__nav-btn--disabled">→</span>'

  const tocOptions = buildTocOptions(null)

  const sections = bookSections.map(folder => `
<section class="book-toc__group">
  <h3 class="book-toc__group-title">${escapeHtml(folder.name)}</h3>
  <ul class="book-toc__list">
    ${folder.entries.map(e => {
      const h2s = [...e.raw.matchAll(/^##\s+(.+)$/gm)]
      const subItems = h2s.map(m => {
        const text = m[1]!.trim()
        const id = slugifyHeading(text)
        return `<li class="book-toc__subitem"><a href="${href(`/book/${e.id}`)}#${id}" onclick="event.preventDefault();Playground.navigate('/book/${e.id}');setTimeout(()=>{const el=document.getElementById('${id}');if(el){el.scrollIntoView();history.replaceState(null,'',location.pathname+'#${id}')}},80)">${escapeHtml(text)}</a></li>`
      }).join('')
      return `<li class="book-toc__item"><a href="${href(`/book/${e.id}`)}" onclick="event.preventDefault();Playground.navigate('/book/${e.id}')">${escapeHtml(e.title)}</a>${subItems ? `<ul class="book-toc__sublist">${subItems}</ul>` : ''}</li>`
    }).join('')}
  </ul>
</section>`).join('\n')

  return `
<div class="book-page">
  <div class="chapter-header">
    <span class="chapter-header__nav-btn chapter-header__nav-btn--disabled">←</span>
    <span class="chapter-header__title">The Book</span>
    <div class="chapter-header__toc-wrap">
      <span class="chapter-header__toc-label">Table of contents</span>
      <select class="chapter-header__toc" onchange="${tocNavHandler}" aria-label="Table of contents">
        ${tocOptions}
      </select>
    </div>
    ${nextBtn}
  </div>
  <div class="book-page__content">
    <div class="book-toc__header">
      <a class="book-toc__download" href="${href('/the-dvala-book.pdf')}" download="the-dvala-book.pdf">↓ Download PDF</a>
    </div>
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
  const subToc = h2Matches.length > 1
    ? `<nav class="chapter-subtoc">${h2Matches.map(m => {
      const text = m[1]!.trim()
      const slug = slugifyHeading(text)
      return `<a class="chapter-subtoc__link" href="#${slug}" onclick="event.preventDefault();history.pushState(null,'',location.pathname+'#${slug}');document.getElementById('${slug}')?.scrollIntoView({behavior:'smooth'})">${escapeHtml(text)}</a>`
    }).join('')}</nav>`
    : ''

  const prevBtn = prev
    ? `<a class="chapter-header__nav-btn" href="${href(`/book/${prev.id}`)}" onclick="event.preventDefault();Playground.navigate('/book/${prev.id}')" title="${escapeHtml(prev.title)}">←</a>`
    : '<span class="chapter-header__nav-btn chapter-header__nav-btn--disabled">←</span>'

  const nextBtn = next
    ? `<a class="chapter-header__nav-btn" href="${href(`/book/${next.id}`)}" onclick="event.preventDefault();Playground.navigate('/book/${next.id}')" title="${escapeHtml(next.title)}">→</a>`
    : '<span class="chapter-header__nav-btn chapter-header__nav-btn--disabled">→</span>'

  const tocOptions = buildTocOptions(id)

  return `
<div class="book-page">
  <div class="chapter-header">
    ${prevBtn}
    <span class="chapter-header__title">${escapeHtml(entry.title)}</span>
    <div class="chapter-header__toc-wrap">
      <span class="chapter-header__toc-label">Table of contents</span>
      <select class="chapter-header__toc" onchange="${tocNavHandler}" aria-label="Table of contents">
        ${tocOptions}
      </select>
    </div>
    ${nextBtn}
  </div>
  <div class="book-page__content">
    ${subToc}
    ${contentHtml}
  </div>
</div>`.trim()
}

// Navigation helper called from onclick handlers
export function navigateToChapter(id: string): void {
  navigate(`/book/${id}`)
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
