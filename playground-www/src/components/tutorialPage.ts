/**
 * Renders tutorial pages.
 * Tutorial .md files are imported as raw strings via markdownSourcePlugin.
 * Rendered with marked. Navigation between tutorials provided.
 */

import { marked } from 'marked'
import { href, navigate } from '../router'
import { tokenizeToHtml } from '../SyntaxOverlay'
import { runExampleCode } from '../runExampleCode'
import { getPageHeader } from '../utils'

const penIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83l3.75 3.75z"/></svg>'
const copyIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"/></svg>'

function formatOutput(output: string): string {
  const lines = output.split('\n')
  const prefix = '<span class="output-arrow">=&gt;</span> '
  const indent = '   ' // 3 spaces to align with after "=> "
  return prefix + lines.map((line, i) => i === 0 ? escapeHtml(line) : indent + escapeHtml(line)).join('\n')
}

const renderer = new marked.Renderer()
renderer.code = ({ text, lang }) => {
  const isDvala = lang === 'dvala' || !lang
  const highlighted = isDvala ? tokenizeToHtml(text) : escapeHtml(text)
  const encoded = btoa(encodeURIComponent(text))

  const output = isDvala ? runExampleCode(text) : null
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

export interface TutorialEntry {
  id: string // URL slug, e.g. "getting-started"
  title: string // extracted from first # heading in the .md
  raw: string // raw markdown string
  folder: string // display name of the containing folder
}

export interface TutorialFolder {
  name: string
  entries: TutorialEntry[]
}

// Import all tutorial .md files as raw strings
import raw_01_01 from '../../../tutorials/01-getting-started/01-intro.md'
import raw_01_02 from '../../../tutorials/01-getting-started/02-getting-started.md'
import raw_02_01 from '../../../tutorials/02-core-language/01-data-types.md'
import raw_02_02 from '../../../tutorials/02-core-language/02-operators.md'
import raw_02_03 from '../../../tutorials/02-core-language/03-lexical-scoping.md'
import raw_02_04 from '../../../tutorials/02-core-language/04-functions.md'
import raw_03_01 from '../../../tutorials/03-data-and-control-flow/01-collections.md'
import raw_03_02 from '../../../tutorials/03-data-and-control-flow/02-destructuring.md'
import raw_03_03 from '../../../tutorials/03-data-and-control-flow/03-control-flow.md'
import raw_03_04 from '../../../tutorials/03-data-and-control-flow/04-pattern-matching.md'
import raw_03_05 from '../../../tutorials/03-data-and-control-flow/05-loops-and-recursion.md'
import raw_03_06 from '../../../tutorials/03-data-and-control-flow/06-pipes-and-data-flow.md'
import raw_04_01 from '../../../tutorials/04-design-principles/01-expression-oriented.md'
import raw_04_02 from '../../../tutorials/04-design-principles/02-immutability.md'
import raw_04_03 from '../../../tutorials/04-design-principles/03-purity.md'
import raw_04_04 from '../../../tutorials/04-design-principles/04-normal-vs-special.md'
import raw_04_05 from '../../../tutorials/04-design-principles/05-tail-call-optimization.md'
import raw_05_01 from '../../../tutorials/05-advanced/01-modules.md'
import raw_05_02 from '../../../tutorials/05-advanced/02-effects.md'
import raw_05_03 from '../../../tutorials/05-advanced/03-implicit-async.md'
import raw_05_04 from '../../../tutorials/05-advanced/04-suspension.md'
import raw_05_05 from '../../../tutorials/05-advanced/05-concurrency.md'

function extractTitle(raw: string): string {
  const match = /^#\s+(.+)$/m.exec(raw)
  return match ? match[1]!.trim() : 'Untitled'
}

function makeEntry(id: string, raw: string, folder: string): TutorialEntry {
  return { id, title: extractTitle(raw), raw, folder }
}

export const tutorialFolders: TutorialFolder[] = [
  {
    name: 'Getting Started',
    entries: [
      makeEntry('getting-started-intro', raw_01_01, 'Getting Started'),
      makeEntry('getting-started-tutorial', raw_01_02, 'Getting Started'),
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
    ],
  },
]

export const allTutorials: TutorialEntry[] = tutorialFolders.flatMap(f => f.entries)

export function renderTutorialsIndexPage(): string {
  const sections = tutorialFolders.map(folder => `
<section class="content-page__group">
  <h2 class="content-page__group-title">${escapeHtml(folder.name)}</h2>
  <ul class="content-page__entry-list">
    ${folder.entries.map(entry => `
    <li class="content-page__entry">
      <a class="content-page__entry-link" href="${href(`/tutorials/${entry.id}`)}" onclick="event.preventDefault();Playground.navigate('/tutorials/${entry.id}')">${escapeHtml(entry.title)}</a>
    </li>`).join('')}
  </ul>
</section>`).join('\n')

  return `
<div class="content-page">
  ${getPageHeader()}
  <h1 class="content-page__title">Tutorials</h1>
  <div class="content-page__body">
    ${sections}
  </div>
</div>`.trim()
}

export function renderTutorialPage(id: string): string {
  const entry = allTutorials.find(t => t.id === id)
  if (!entry) {
    return `<div class="tutorial-page"><p>Tutorial not found: <code>${escapeHtml(id)}</code></p></div>`
  }

  const idx = allTutorials.indexOf(entry)
  const prev = idx > 0 ? allTutorials[idx - 1] : null
  const next = idx < allTutorials.length - 1 ? allTutorials[idx + 1] : null

  const contentHtml = marked.parse(entry.raw, { renderer }) as string

  const prevLink = prev
    ? `<a class="tutorial-page__nav-link tutorial-page__nav-link--prev" href="${href(`/tutorials/${prev.id}`)}" onclick="event.preventDefault();Playground.navigate('/tutorials/${prev.id}')">← ${escapeHtml(prev.title)}</a>`
    : '<span class="tutorial-page__nav-link tutorial-page__nav-link--disabled"></span>'

  const nextLink = next
    ? `<a class="tutorial-page__nav-link tutorial-page__nav-link--next" href="${href(`/tutorials/${next.id}`)}" onclick="event.preventDefault();Playground.navigate('/tutorials/${next.id}')">→ ${escapeHtml(next.title)}</a>`
    : '<span class="tutorial-page__nav-link tutorial-page__nav-link--disabled"></span>'

  return `
<div class="tutorial-page">
  <div class="tutorial-page__content">
    ${contentHtml}
  </div>
  <nav class="tutorial-page__nav" aria-label="Tutorial navigation">
    ${prevLink}
    ${nextLink}
  </nav>
</div>`.trim()
}

// Navigation helper called from onclick handlers
export function navigateToTutorial(id: string): void {
  navigate(`/tutorials/${id}`)
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
