/**
 * Generates a PDF of all Dvala book chapters.
 * Uses marked for markdown rendering and highlight.js for syntax highlighting.
 * Outputs docs/the-dvala-book.pdf (alongside the built playground).
 *
 * Usage:  node scripts/generate-pdf.mjs [output-path]
 * In CI:  runs automatically as part of build-book
 */

import { chromium } from '@playwright/test'
import { Marked } from 'marked'
import hljs from 'highlight.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUTPUT = process.argv[2] ?? path.join(ROOT, 'docs', 'the-dvala-book.pdf')

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

// ---------------------------------------------------------------------------
// Dvala syntax highlighting — uses the real tokenizer from dist/
// Mirrors the token-to-color logic in playground-www/src/SyntaxOverlay.ts
// ---------------------------------------------------------------------------
import { createRequire } from 'node:module'
const _require = createRequire(import.meta.url)
const { tokenizeSource: tokenize, normalExpressionKeys: normalKeys, specialExpressionKeys: specialKeys } = _require(path.join(ROOT, 'dist/index.js'))

const normalExpressionSet = new Set(normalKeys)
const specialExpressionSet = new Set(specialKeys)
const effectConstructs = new Set(['perform', 'effectName', 'qualifiedName', 'qualifiedMatcher'])

// Hex colors matching playground CSS variables
const syntaxColors = {
  keyword:         '#569cd6',
  builtin:         '#dcdcaa',
  symbol:          '#9cdcfe',
  number:          '#b5cea8',
  string:          '#ce9178',
  punctuation:     '#d4d4d4',
  comment:         '#6a9955',
  error:           '#f44747',
  effect:          '#e6b455',
  effectConstruct: '#e06c9f',
}

function getTokenColor(token) {
  switch (token[0]) {
    case 'string':
    case 'TemplateString':
    case 'RegexpShorthand':
      return syntaxColors.string
    case 'EffectName':
      return syntaxColors.effect
    case 'MacroQualified':
      return syntaxColors.keyword
    case 'Symbol':
      if (effectConstructs.has(token[1])) return syntaxColors.effectConstruct
      return specialExpressionSet.has(token[1]) ? syntaxColors.keyword
        : normalExpressionSet.has(token[1]) ? syntaxColors.builtin
        : syntaxColors.symbol
    case 'BasePrefixedNumber':
    case 'Number':
      return syntaxColors.number
    case 'Shebang':
    case 'SingleLineComment':
    case 'MultiLineComment':
      return syntaxColors.comment
    case 'ReservedSymbol':
      return syntaxColors.keyword
    case 'Operator':
    case 'LBrace': case 'RBrace':
    case 'LBracket': case 'RBracket':
    case 'LParen': case 'RParen':
      return syntaxColors.punctuation
    case 'Error':
      return syntaxColors.error
    default:
      return null
  }
}

// Highlight a template string by splitting it into literal segments and ${...}
// interpolations. Interpolated expressions are re-tokenized recursively.
function renderTemplateString(raw) {
  const strColor   = syntaxColors.string
  const punctColor = syntaxColors.punctuation
  const span = (color, text) => `<span style="color:${color}">${text}</span>`

  let out = span(strColor, '`')
  let i = 1  // skip opening backtick
  const end = raw.length - 1  // position of closing backtick
  let litStart = i

  while (i < end) {
    if (raw[i] === '$' && raw[i + 1] === '{') {
      if (i > litStart) out += span(strColor, escapeHtml(raw.slice(litStart, i)))
      out += span(punctColor, '${')
      i += 2
      // Find matching } accounting for brace nesting
      let depth = 1
      const exprStart = i
      while (i < end && depth > 0) {
        if (raw[i] === '{') depth++
        else if (raw[i] === '}') { if (--depth === 0) break }
        i++
      }
      out += dvalaToHtml(raw.slice(exprStart, i))
      out += span(punctColor, '}')
      i++
      litStart = i
    } else {
      i++
    }
  }
  if (i > litStart) out += span(strColor, escapeHtml(raw.slice(litStart, i)))
  out += span(strColor, '`')
  return out
}

function dvalaToHtml(code) {
  try {
    const tokens = tokenize(code).tokens
    return tokens.map(token => {
      if (token[0] === 'TemplateString') return renderTemplateString(token[1])
      const prefix = token[0] === 'EffectName' ? '@' : token[0] === 'MacroQualified' ? 'macro@' : ''
      const escaped = escapeHtml(token[1])
      const color = getTokenColor(token)
      if (!color) return prefix + escaped
      const isComment = token[0] === 'SingleLineComment' || token[0] === 'MultiLineComment' || token[0] === 'Shebang'
      const style = `color:${color};${isComment ? 'font-style:italic;' : ''}`
      return `<span style="${style}">${prefix}${escaped}</span>`
    }).join('')
  } catch {
    return escapeHtml(code)
  }
}

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------
function slugify(text) {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
}

// Shared slug queues: text → [uniqueSlug, ...] consumed in order during rendering.
// Reset before each full render so both the TOC and the heading renderer use the
// same unique IDs for duplicate heading texts (e.g. multiple "Summary" sections).
let _slugQueues = {}
function resetSlugQueues(chapters) {
  const counts = {}
  function assign(text) {
    const base = slugify(text)
    counts[base] = (counts[base] ?? 0) + 1
    const id = counts[base] === 1 ? base : `${base}-${counts[base]}`
    if (!_slugQueues[text]) _slugQueues[text] = []
    _slugQueues[text].push(id)
    return id
  }
  _slugQueues = {}
  for (const { title, h2s } of chapters) {
    assign(title)
    for (const h2 of h2s) assign(h2)
  }
}

// ---------------------------------------------------------------------------
// Chapter files in reading order — discovered dynamically by scanning book/.
// Mirrors the bookChaptersPlugin in rolldown.plugins.mjs: drop a .md file in
// book/NN-section/NN-chapter.md and it appears automatically.
// ---------------------------------------------------------------------------
const BOOK_DIR = path.join(ROOT, 'book')
const CHAPTER_FILES = fs.readdirSync(BOOK_DIR).sort()
  .filter(dir => fs.statSync(path.join(BOOK_DIR, dir)).isDirectory())
  .flatMap(dir =>
    fs.readdirSync(path.join(BOOK_DIR, dir)).sort()
      .filter(file => file.endsWith('.md'))
      .map(file => `${dir}/${file}`)
  )

// ---------------------------------------------------------------------------
// Parse chapters to extract h1 title and h2 sections for the TOC
// ---------------------------------------------------------------------------
function parseChapters() {
  return CHAPTER_FILES.map(rel => {
    const md = fs.readFileSync(path.join(ROOT, 'book', rel), 'utf8')
    const h1Match = /^#\s+(.+)$/m.exec(md)
    const title = h1Match ? h1Match[1].trim() : rel
    const h2s = [...md.matchAll(/^##\s+(.+)$/gm)].map(m => m[1].trim())
    return { rel, title, h2s, md }
  })
}

// ---------------------------------------------------------------------------
// Dvala evaluator — runs code through the CLI, returns output or null
// ---------------------------------------------------------------------------
const CLI = path.join(ROOT, 'dist/cli/cli.js')
const cliAvailable = fs.existsSync(CLI)

function evaluate(code) {
  if (!cliAvailable) return null
  try {
    const raw = execFileSync(process.execPath, [CLI, 'eval', code], {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    // Strip ANSI escape codes from output
    const output = raw.replace(/\x1b\[[0-9;]*m/g, '')
    return { ok: true, output }
  } catch (e) {
    // Strip ANSI escape codes from error message
    const msg = (e.stderr ?? e.stdout ?? '').replace(/\x1b\[[0-9;]*m/g, '').trim()
    return { ok: false, output: msg }
  }
}

// ---------------------------------------------------------------------------
// Markdown renderer — adds id attributes to headings for TOC links
// ---------------------------------------------------------------------------
const marked = new Marked({
  renderer: {
    heading({ text, depth }) {
      // Pop the pre-assigned unique slug for this heading (in document order)
      const queue = _slugQueues[text]
      const id = queue?.length ? queue.shift() : slugify(text)
      return `<h${depth} id="${id}">${text}</h${depth}>\n`
    },
    code({ text, lang }) {
      const rawLang = lang ?? ''
      const noRun = rawLang.includes('no-run')
      const isDvala = rawLang.startsWith('dvala') || !lang
      const language = isDvala ? 'dvala' : (hljs.getLanguage(rawLang) ? rawLang : 'plaintext')
      const highlighted = isDvala ? dvalaToHtml(text) : hljs.highlight(text, { language }).value
      const displayLang = language === 'dvala' ? 'Dvala' : language
      const label = language !== 'plaintext' ? `<span class="code-label">${displayLang}</span>` : ''

      let output = ''
      if (isDvala && !noRun) {
        const result = evaluate(text)
        if (result) {
          const cls = result.ok ? 'code-output' : 'code-output code-output--error'
          output = `<div class="${cls}"><span class="code-output__arrow">→</span><span class="code-output__value">${escapeHtml(result.output)}</span></div>`
        }
      }

      const blockCls = output ? 'code-block code-block--with-output' : 'code-block'
      return `<div class="${blockCls}"><pre><code class="hljs language-${language}">${highlighted}</code></pre>${label}${output}</div>\n`
    },
  },
})

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ---------------------------------------------------------------------------
// Cover page
// ---------------------------------------------------------------------------
function buildCover() {
  const logoPath = path.join(ROOT, 'playground-www/public/images/dvala-logo-print.webp')
  const logoBase64 = fs.readFileSync(logoPath).toString('base64')
  return `
<div class="cover">
  <img class="cover__logo" src="data:image/webp;base64,${logoBase64}" alt="Dvala">
  <h1 class="cover__title">The Dvala Book</h1>
  <p class="cover__subtitle">A complete guide to the Dvala runtime</p>
</div>`
}

function buildColophon() {
  const year = new Date().getFullYear()
  return `
<div class="colophon">
  <div class="colophon__body">
    <p class="colophon__title">The Dvala Book</p>
    <p class="colophon__version">Version ${version}</p>
    <p class="colophon__author">Albert Mojir<br><a href="mailto:albert.mojir@gmail.com">albert.mojir@gmail.com</a></p>
    <p class="colophon__license">Copyright &copy; ${year} Albert Mojir</p>
    <p class="colophon__license">Licensed under the <strong>MIT License</strong>.<br>
      Permission is hereby granted, free of charge, to any person obtaining a copy
      of this software and associated documentation files, to deal in the software
      without restriction, including without limitation the rights to use, copy, modify,
      merge, publish, distribute, sublicense, and/or sell copies of the software.</p>
  </div>
</div>`
}

// ---------------------------------------------------------------------------
// TOC page
// ---------------------------------------------------------------------------
function buildToc(chapters, headingPages = {}) {
  const pageNum = (slug) => {
    const n = headingPages[slug]
    return n != null
      ? `<span class="toc__dots"></span><span class="toc__page">${n}</span>`
      : ''
  }

  // Snapshot the slug queues before building the TOC so the renderer still gets
  // the same unique slugs when it processes the chapters afterwards.
  const snapshot = Object.fromEntries(
    Object.entries(_slugQueues).map(([k, v]) => [k, [...v]])
  )
  const popSlug = (text) => {
    const q = snapshot[text]
    return q?.length ? q.shift() : slugify(text)
  }

  const items = chapters.map(({ title, h2s }) => {
    const slug = popSlug(title)
    const subItems = h2s.map(h2 => {
      const h2slug = popSlug(h2)
      return `<li class="toc__h2"><a href="#${h2slug}">${h2}</a>${pageNum(h2slug)}</li>`
    }).join('')
    return `
<li class="toc__h1">
  <div class="toc__row"><a href="#${slug}">${title}</a>${pageNum(slug)}</div>
  ${subItems ? `<ul>${subItems}</ul>` : ''}
</li>`
  }).join('')

  return `
<div class="toc">
  <h1 class="toc__title">Table of Contents</h1>
  <ul class="toc__list">${items}</ul>
</div>`
}

// ---------------------------------------------------------------------------
// Full HTML body
// ---------------------------------------------------------------------------
function buildBody(chapters, headingPages = {}) {
  // Populate slug queues fresh so TOC and heading renderer share the same unique IDs
  resetSlugQueues(chapters)
  const cover = buildCover()
  const colophon = buildColophon()
  const toc = buildToc(chapters, headingPages)
  const chapterArticles = chapters.map(({ md }) => {
    return `<article class="chapter">\n${marked.parse(md)}\n</article>`
  }).join('\n')
  return cover + '\n' + colophon + '\n' + toc + '\n' + chapterArticles
}

// ---------------------------------------------------------------------------
// Highlight.js CSS (GitHub Dark theme, inlined)
// ---------------------------------------------------------------------------
const hljsCss = fs.readFileSync(
  path.join(ROOT, 'node_modules/highlight.js/styles/github-dark.css'),
  'utf8',
)

// ---------------------------------------------------------------------------
// Full HTML document
// ---------------------------------------------------------------------------
function buildHtml(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
${hljsCss}

/* Page layout — margins are set by Playwright's pdf() call, not here */
@page { size: A4; }
*, *::before, *::after { box-sizing: border-box; }

body {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 11pt;
  line-height: 1.6;
  color: #1a1a1a;
  background: #fff;
}

/* Cover page */
.cover {
  padding: 25% 0 20%;
  text-align: center;
  break-after: page;
}
.cover__logo     { width: 280px; margin-bottom: 2.5em; }
.cover__title    { font-size: 36pt; font-weight: bold; margin: 0 0 0.3em; color: #111; border: none; }
.cover__subtitle { font-size: 14pt; color: #555; margin: 0 0 2em; font-style: italic; }
.cover__meta     { margin-top: 2em; color: #444; }
.cover__version  { font-size: 11pt; margin: 0 0 0.3em; color: #666; }
.cover__author   { font-size: 13pt; font-weight: bold; margin: 0 0 0.2em; }
.cover__email    { font-size: 11pt; color: #666; margin: 0; }

/* Colophon page (page 2) */
.colophon {
  min-height: 250mm;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  break-after: page;
}
.colophon__body    { padding-bottom: 2em; }
.colophon__title   { font-size: 14pt; font-weight: bold; margin: 0 0 0.2em; }
.colophon__version { font-size: 11pt; color: #555; margin: 0 0 1.2em; }
.colophon__author  { font-size: 12pt; font-weight: bold; margin: 0 0 1.2em; line-height: 1.6; }
.colophon__author a { color: #444; text-decoration: none; font-weight: normal; font-size: 11pt; }
.colophon__license { font-size: 10pt; color: #666; margin: 0 0 0.6em; line-height: 1.6; }

/* TOC page */
.toc { break-after: page; }
.toc__title { font-size: 22pt; margin: 0 0 1em; border-bottom: 2px solid #ddd; padding-bottom: 0.2em; }
.toc__list  { list-style: none; padding: 0; margin: 0; }
.toc__h1    { margin-bottom: 0.6em; }
.toc__h1 ul { list-style: none; padding-left: 1.5em; margin: 0.2em 0 0; }
.toc__h2    { display: flex; align-items: baseline; margin-bottom: 0.2em; }
.toc__h2 a  { font-size: 10pt; color: #444; text-decoration: none; flex: 0 0 auto; }
.toc__row   { display: flex; align-items: baseline; }
.toc__row > a { font-size: 12pt; font-weight: bold; color: #111; text-decoration: none; flex: 0 0 auto; }
.toc__dots  { flex: 1; border-bottom: 1px dotted #aaa; margin: 0 0.4em 0.2em; min-width: 1em; }
/* target-counter() lets the browser resolve the page number after full layout,
   correctly accounting for forced break-before/break-after page breaks */
.toc__page  { flex: 0 0 auto; font-size: 10pt; color: #666; }

/* Page breaks between chapters */
.chapter { break-before: page; }

/* Headings */
h1 { font-size: 22pt; margin: 0 0 0.4em; color: #111; border-bottom: 2px solid #ddd; padding-bottom: 0.2em; }
h2 { font-size: 15pt; margin: 1.4em 0 0.4em; color: #222; }
h3 { font-size: 12pt; margin: 1.2em 0 0.3em; color: #333; }

/* Body text */
p  { margin: 0 0 0.75em; }
ul, ol { margin: 0 0 0.75em; padding-left: 1.5em; }
li { margin-bottom: 0.2em; }
blockquote { border-left: 3px solid #ccc; margin: 0 0 0.75em; padding: 0.3em 1em; color: #555; }

/* Tables */
table { border-collapse: collapse; width: 100%; margin-bottom: 1em; font-size: 10pt; }
th, td { border: 1px solid #ddd; padding: 0.4em 0.7em; text-align: left; }
th { background: #f5f5f5; font-weight: bold; }

/* Code */
code { font-family: 'Menlo', 'Consolas', monospace; font-size: 9.5pt; background: #f5f5f5; padding: 0.1em 0.3em; border-radius: 3px; }
pre  { margin: 0; }
pre code { background: none; padding: 0; font-size: 9pt; }
/* !important overrides the imported github-dark.css rules */
.hljs { padding: 2.4em 1em 0.8em !important; border-radius: 0 !important; }

/* code-block clips all inner rounding — no need for radii on children */
.code-block { margin-bottom: 1em; border-radius: 6px; overflow: hidden; position: relative; }

/* Language label — top-left corner, inline with code background */
.code-label {
  position: absolute;
  top: 0;
  left: 0;
  font-family: 'Menlo', 'Consolas', monospace;
  font-size: 7.5pt;
  white-space: nowrap;
  color: #7c9ef8;
  background: rgba(124, 158, 248, 0.22);
  padding: 0.3em 0.5em 0.2em;
  letter-spacing: 0.04em;
}

/* Evaluation output */
.code-output {
  font-family: 'Menlo', 'Consolas', monospace;
  font-size: 9pt;
  background: #1a1a1a;
  color: #98c379;
  padding: 0.4em 1em;
  border-top: 1px solid #2a2a2a;
  display: flex;
  gap: 0.6em;
}
.code-output--error { color: #ff8a8a; }
.code-output__arrow { color: #555; flex-shrink: 0; }
.code-output__value { white-space: pre-wrap; }

/* Links in content */
a { color: #2a5db0; }
</style>
</head>
<body>
${body}
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Generate PDF via Playwright
// ---------------------------------------------------------------------------

const PDF_MARGIN = { top: '2cm', bottom: '2.5cm', left: '2.5cm', right: '2.5cm' }

// Pages 1 (cover) and 2 (colophon) show no number.
// Page 3 onwards shows Arabic numerals starting at 1.
const FOOTER_TEMPLATE = `
<div style="width:100%;text-align:center;font-size:9pt;color:#888;font-family:Georgia,serif;padding-bottom:0.3cm;">
  <span class="pageNumber" style="visibility:hidden"></span>
  <span id="pn"></span>
  <script>
    var p = parseInt(document.querySelector('.pageNumber').innerText) || 0;
    if (p > 2) document.getElementById('pn').innerText = p - 2;
  </script>
</div>`

async function generatePdf() {
  console.log('Parsing chapters…')
  const chapters = parseChapters()

  console.log('Launching browser…')
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Pass 1: render and measure section heights to compute accurate page numbers.
  // Simple offsetTop is wrong because forced break-before/break-after page breaks
  // aren't reflected in CSS pixel positions. Instead: compute start page per section,
  // then find each heading's position within its section.
  //
  // Viewport width must match the PDF content width so layout (line breaks, element
  // heights) is identical between the measurement pass and the final PDF render.
  // A4 minus 2.5cm left + 2.5cm right margins = 160mm ≈ 604px at 96dpi.
  const PDF_CONTENT_WIDTH = Math.round((210 - 25 - 25) * 96 / 25.4)  // ≈ 604px
  await page.setViewportSize({ width: PDF_CONTENT_WIDTH, height: 800 })

  console.log('Measuring heading positions…')
  await page.setContent(buildHtml(buildBody(chapters)), { waitUntil: 'load' })

  // A4 content height in px at 96dpi: 297mm minus top (2cm) + bottom (2.5cm) margins
  const CONTENT_H = (297 - 20 - 25) * 96 / 25.4  // ≈ 952px

  const headingPages = await page.evaluate((contentH) => {
    // Absolute top relative to document (reliable across positioning contexts)
    function absTop(el) {
      return el.getBoundingClientRect().top + window.scrollY
    }

    // Each of these sections starts on a forced new page
    const sections = [...document.querySelectorAll('.cover, .colophon, .toc, .chapter')]

    // Compute which PDF page each section starts on
    let pageNum = 1
    const sectionStartPage = new Map()
    for (const s of sections) {
      sectionStartPage.set(s, pageNum)
      // How many pages does this section occupy?
      pageNum += Math.max(1, Math.ceil(s.getBoundingClientRect().height / contentH))
    }

    // For each heading, find its section and offset within it
    const result = {}
    for (const el of document.querySelectorAll('h1[id], h2[id]')) {
      const section = el.closest('.cover, .colophon, .toc, .chapter')
      if (!section) continue
      const sp = sectionStartPage.get(section) ?? 1
      const offsetWithinSection = Math.max(0, absTop(el) - absTop(section))
      result[el.id] = sp + Math.floor(offsetWithinSection / contentH)
    }
    return result
  }, CONTENT_H)

  // Pass 2: rebuild with page numbers injected into TOC
  console.log('Building final HTML…')
  await page.setContent(buildHtml(buildBody(chapters, headingPages)), { waitUntil: 'load' })

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  console.log(`Generating PDF → ${OUTPUT}`)
  await page.pdf({
    path: OUTPUT,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: FOOTER_TEMPLATE,
    margin: PDF_MARGIN,
  })

  await browser.close()
  console.log('Done.')
}

generatePdf().catch(err => { console.error(err); process.exit(1) })
