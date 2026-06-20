import path from 'node:path'
import type { FileCoverageSummary } from './coverage'

// --- Types ---

interface FileNode {
  type: 'file'
  name: string
  summary: FileCoverageSummary
}

interface DirNode {
  type: 'dir'
  name: string
  children: TreeNode[]
}

type TreeNode = FileNode | DirNode

// --- Public API ---

/**
 * Generate a multi-file HTML coverage report.
 * Returns a map of relative output paths → content.
 * The caller writes each entry into the coverage output directory.
 */
export function generateCoverageHtmlFiles(summaries: FileCoverageSummary[], rootDir: string): Map<string, string> {
  // Root the report at the common ancestor of `rootDir` and every covered file.
  // `path.relative(rootDir, file)` would otherwise emit `../` segments for files
  // that live outside `rootDir` (e.g. a project that imports a sibling package),
  // and those `../` paths escape the caller's output directory. Including
  // `rootDir` in the ancestor caps the root at `rootDir` when all files are inside
  // it, so this is a no-op for the common case.
  const reportRoot = commonAncestor([rootDir, ...summaries.map(s => s.path)])
  const tree = buildTree(summaries, reportRoot)
  const files = new Map<string, string>()
  files.set('style.css', CSS)
  generatePages(tree.children, files, '', reportRoot)
  return files
}

// --- Tree builder ---

/**
 * Longest shared directory prefix of the given paths, returned absolute. Used as
 * the report root so every file maps to a relative, non-escaping output path.
 */
function commonAncestor(paths: string[]): string {
  const segmented = paths.map(p => path.resolve(p).split(path.sep))
  const [first, ...others] = segmented
  if (!first) return path.resolve('.')
  let depth = first.length
  for (const parts of others) {
    let i = 0
    while (i < depth && i < parts.length && parts[i] === first[i]) i += 1
    depth = i
  }
  return first.slice(0, depth).join(path.sep) || path.sep
}

function buildTree(summaries: FileCoverageSummary[], rootDir: string): DirNode {
  const root: DirNode = { type: 'dir', name: '', children: [] }
  for (const summary of summaries) {
    const rel = path.relative(rootDir, summary.path)
    insertNode(root, rel.split(path.sep), summary)
  }
  return root
}

function insertNode(parent: DirNode, parts: string[], summary: FileCoverageSummary): void {
  if (parts.length === 1) {
    parent.children.push({ type: 'file', name: parts[0]!, summary })
    return
  }
  const dirName = parts[0]!
  let dir = parent.children.find((c): c is DirNode => c.type === 'dir' && c.name === dirName)
  if (!dir) {
    dir = { type: 'dir', name: dirName, children: [] }
    parent.children.push(dir)
  }
  insertNode(dir, parts.slice(1), summary)
}

// --- Aggregation ---

function aggregate(node: DirNode): { linesHit: number; linesFound: number; exprsHit: number; exprsFound: number } {
  let linesHit = 0,
    linesFound = 0,
    exprsHit = 0,
    exprsFound = 0
  for (const child of node.children) {
    if (child.type === 'file') {
      linesHit += child.summary.linesHit
      linesFound += child.summary.linesFound
      exprsHit += child.summary.exprsHit
      exprsFound += child.summary.exprsFound
    } else {
      const a = aggregate(child)
      linesHit += a.linesHit
      linesFound += a.linesFound
      exprsHit += a.exprsHit
      exprsFound += a.exprsFound
    }
  }
  return { linesHit, linesFound, exprsHit, exprsFound }
}

// --- Page generator ---

function generatePages(nodes: TreeNode[], files: Map<string, string>, prefix: string, rootDir: string): void {
  const outPath = prefix ? `${prefix}/index.html` : 'index.html'
  const depth = prefix ? prefix.split('/').length : 0
  const cssPath = `${'../'.repeat(depth)}style.css`
  const agg = aggregate({ type: 'dir', name: '', children: nodes })

  const rows = nodes.map(node => renderRow(node)).join('\n')

  files.set(
    outPath,
    indexPage({
      title: prefix ? `${prefix}/` : 'Coverage Report',
      cssPath,
      breadcrumbs: buildBreadcrumbs(prefix),
      rootDir,
      totalLinePct: pct(agg.linesHit, agg.linesFound),
      totalExprPct: pct(agg.exprsHit, agg.exprsFound),
      fileCount: countFiles(nodes),
      rows,
    }),
  )

  // Recurse into subdirectories and generate file pages
  for (const node of nodes) {
    if (node.type === 'dir') {
      const childPrefix = prefix ? `${prefix}/${node.name}` : node.name
      generatePages(node.children, files, childPrefix, rootDir)
    } else if (node.summary.source !== undefined) {
      const filePath = prefix ? `${prefix}/${node.name}.html` : `${node.name}.html`
      const fileCssPath = `${'../'.repeat(depth)}style.css`
      const filePrefix = prefix ? `${prefix}/${node.name}` : node.name
      files.set(filePath, filePage(node.summary, node.name, filePrefix, fileCssPath, rootDir))
    }
  }
}

function renderRow(node: TreeNode): string {
  if (node.type === 'dir') {
    const agg = aggregate(node)
    const linePct = pct(agg.linesHit, agg.linesFound)
    const exprPct = pct(agg.exprsHit, agg.exprsFound)
    return `
    <tr>
      <td class="file"><a href="${esc(node.name)}/index.html">${esc(node.name)}/</a></td>
      <td class="num ${cls(linePct)}">${fmt(linePct)}</td>
      <td class="num ${cls(exprPct)}">${fmt(exprPct)}</td>
      <td class="uncov"></td>
    </tr>`
  }
  const s = node.summary
  const linePct = pct(s.linesHit, s.linesFound)
  const exprPct = pct(s.exprsHit, s.exprsFound)
  const uncovered = s.uncoveredLines.join(', ')
  const link = s.source !== undefined ? `<a href="${esc(node.name)}.html">${esc(node.name)}</a>` : esc(node.name)
  return `
    <tr>
      <td class="file">${link}</td>
      <td class="num ${cls(linePct)}">${fmt(linePct)}</td>
      <td class="num ${cls(exprPct)}">${fmt(exprPct)}</td>
      <td class="uncov">${esc(uncovered)}</td>
    </tr>`
}

function buildBreadcrumbs(prefix: string): string {
  if (!prefix) return ''
  const parts = prefix.split('/')
  const links = parts.map((part, i) => {
    const back = '../'.repeat(parts.length - 1 - i)
    return `<a href="${back}index.html">${esc(part)}</a>`
  })
  return `<nav class="breadcrumb"><a href="${'../'.repeat(parts.length)}index.html">home</a> / ${links.join(' / ')}</nav>`
}

function buildFileBreadcrumbs(filePrefix: string): string {
  const parts = filePrefix.split('/')
  const fileName = parts[parts.length - 1]!
  const dirParts = parts.slice(0, -1)
  const homeBack = '../'.repeat(parts.length)
  const crumbs: string[] = [`<a href="${homeBack}index.html">home</a>`]
  dirParts.forEach((part, i) => {
    const back = '../'.repeat(dirParts.length - i)
    crumbs.push(`<a href="${back}index.html">${esc(part)}</a>`)
  })
  crumbs.push(esc(fileName))
  return `<nav class="breadcrumb">${crumbs.join(' / ')}</nav>`
}

function countFiles(nodes: TreeNode[]): number {
  return nodes.reduce((n, c) => n + (c.type === 'file' ? 1 : countFiles(c.children)), 0)
}

// --- Index page template ---

interface IndexPageParams {
  title: string
  cssPath: string
  breadcrumbs: string
  rootDir: string
  totalLinePct: number
  totalExprPct: number
  fileCount: number
  rows: string
}

function indexPage(p: IndexPageParams): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(p.title)}</title>
<link rel="stylesheet" href="${esc(p.cssPath)}">
</head>
<body>
<div class="container">
<h1>${esc(p.title)}</h1>
${p.breadcrumbs}
<p class="root">${esc(p.rootDir)}</p>
<div class="summary">
  <div class="stat"><div class="stat-label">Lines</div><div class="stat-value ${cls(p.totalLinePct)}">${fmt(p.totalLinePct)}</div></div>
  <div class="stat"><div class="stat-label">Expressions</div><div class="stat-value ${cls(p.totalExprPct)}">${fmt(p.totalExprPct)}</div></div>
  <div class="stat"><div class="stat-label">Files</div><div class="stat-value">${p.fileCount}</div></div>
</div>
<table>
  <thead><tr><th>File</th><th>% Lines</th><th>% Exprs</th><th>Uncovered Lines</th></tr></thead>
  <tbody>${p.rows}</tbody>
</table>
</div>
</body>
</html>`
}

// --- File page (annotated source) ---

function filePage(
  summary: FileCoverageSummary,
  name: string,
  filePrefix: string,
  cssPath: string,
  rootDir: string,
): string {
  const source = summary.source ?? ''
  const sourceLines = source.split('\n')
  // Remove trailing empty line from split
  if (sourceLines[sourceLines.length - 1] === '') sourceLines.pop()

  const linePct = pct(summary.linesHit, summary.linesFound)
  const exprPct = pct(summary.exprsHit, summary.exprsFound)

  // Group uncovered-expression spans by their start line so each line can mark the
  // exact ranges that were never evaluated — even when the line itself is covered.
  const uncoveredByLine = new Map<number, [number, number][]>()
  for (const e of summary.uncoveredExprs) {
    const ln = e.start[0]
    const lineText = sourceLines[ln] ?? ''
    // Clamp end column to this line (multi-line nodes highlight to end of start line).
    const endCol = e.end[0] === ln ? e.end[1] : lineText.length
    const ranges = uncoveredByLine.get(ln) ?? []
    ranges.push([e.start[1], Math.max(endCol, e.start[1] + 1)])
    uncoveredByLine.set(ln, ranges)
  }

  const lineRows = sourceLines
    .map((line, i) => {
      const lineNum = i // 0-based
      const hits = summary.lineHits.get(lineNum)
      const ranges = uncoveredByLine.get(lineNum)
      // A line with uncovered expressions but a positive line-hit count is PARTIAL
      // (amber) — the line ran, but some sub-expression on it never did.
      const rowClass = hits === undefined ? 'neutral' : hits === 0 ? 'uncovered' : ranges ? 'partial' : 'covered'
      const hitsCell = hits === undefined ? '' : `${hits}`
      const src = ranges ? highlightRanges(line, ranges) : esc(line)
      return `<tr class="${rowClass}"><td class="ln">${i + 1}</td><td class="hits">${hitsCell}</td><td class="src"><pre>${src}</pre></td></tr>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(name)}</title>
<link rel="stylesheet" href="${esc(cssPath)}">
</head>
<body>
<div class="container">
<h1>${esc(name)}</h1>
${buildFileBreadcrumbs(filePrefix)}
<p class="root">${esc(rootDir)}</p>
<div class="summary">
  <div class="stat"><div class="stat-label">Lines</div><div class="stat-value ${cls(linePct)}">${fmt(linePct)}</div></div>
  <div class="stat"><div class="stat-label">Expressions</div><div class="stat-value ${cls(exprPct)}">${fmt(exprPct)}</div></div>
</div>
<table class="source">
  <tbody>${lineRows}</tbody>
</table>
</div>
</body>
</html>`
}

// --- Helpers ---

function pct(hit: number, found: number): number {
  return found > 0 ? (hit / found) * 100 : 100
}

function fmt(p: number): string {
  return `${Number.isInteger(p) ? p : p.toFixed(2)}%`
}

function cls(p: number): string {
  if (p >= 80) return 'hi'
  if (p >= 50) return 'med'
  return 'lo'
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Render a source line with the given character ranges wrapped in an
 * `uncovered-expr` span. Overlapping/nested ranges (an uncovered node containing
 * another) are merged so the emitted HTML stays well-formed. Each segment is
 * escaped independently.
 */
function highlightRanges(line: string, ranges: [number, number][]): string {
  // Merge overlapping ranges, clamped to the line bounds.
  const sorted = ranges
    .map(([s, e]) => [Math.max(0, Math.min(s, line.length)), Math.max(0, Math.min(e, line.length))] as [number, number])
    .sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }

  let out = ''
  let cursor = 0
  for (const [s, e] of merged) {
    out += esc(line.slice(cursor, s))
    out += `<span class="uncovered-expr">${esc(line.slice(s, e))}</span>`
    cursor = e
  }
  out += esc(line.slice(cursor))
  return out
}

// --- Shared CSS ---

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ui-monospace, monospace; font-size: 13px; background: #0d1117; color: #e6edf3; padding: 24px; }
.container { max-width: 1200px; margin: 0 auto; }
h1 { font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #f0f6fc; }
.root { color: #7d8590; font-size: 12px; margin-bottom: 20px; }
.breadcrumb { font-size: 12px; color: #7d8590; margin-bottom: 4px; }
.breadcrumb a { color: #58a6ff; text-decoration: none; }
.breadcrumb a:hover { text-decoration: underline; }
.summary { display: flex; gap: 16px; margin-bottom: 20px; }
.stat { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px 20px; }
.stat-label { color: #7d8590; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
.stat-value { font-size: 22px; font-weight: 700; }
table { border-collapse: collapse; width: 100%; }
th { color: #7d8590; font-weight: 500; padding: 6px 12px; text-align: left; border-bottom: 1px solid #30363d; }
th:not(:first-child) { text-align: right; }
td { padding: 6px 12px; border-bottom: 1px solid #21262d; white-space: nowrap; }
tr:hover td { background: #161b22; }
td.file { width: 100%; }
td.file a { color: #58a6ff; text-decoration: none; }
td.file a:hover { text-decoration: underline; }
td.num { text-align: right; font-weight: 500; }
td.uncov { color: #7d8590; font-size: 12px; text-align: right; }
.hi { color: #3fb950; }
.med { color: #d29922; }
.lo { color: #f85149; }

/* Source file view */
table.source { font-size: 12px; }
table.source td { padding: 1px 8px; border-bottom: none; }
table.source tr:hover td { background: #161b22; }
table.source td.ln { color: #7d8590; text-align: right; user-select: none; min-width: 40px; }
table.source td.hits { color: #7d8590; text-align: right; min-width: 36px; user-select: none; }
table.source td.src { width: 100%; white-space: pre; }
table.source td.src pre { margin: 0; font-family: inherit; }
table.source tr.covered td.ln,
table.source tr.covered td.hits { color: #3fb950; }
table.source tr.covered { background: #0d1f14; }
table.source tr.uncovered { background: #1f0d0d; }
table.source tr.uncovered td.ln,
table.source tr.uncovered td.hits { color: #f85149; }
/* Partial: the line ran, but some expression on it never did. */
table.source tr.partial { background: #1f1a0d; }
table.source tr.partial td.ln,
table.source tr.partial td.hits { color: #d29922; }
table.source tr.neutral { background: transparent; }
/* The exact never-evaluated sub-expression. */
.uncovered-expr { background: #5a1e1e; color: #ffdcd6; border-radius: 2px; box-shadow: 0 0 0 1px #f85149 inset; }

`
