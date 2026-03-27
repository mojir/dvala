#!/usr/bin/env node

/**
 * Extract demo blocks from git commit messages and generate an interactive
 * HTML changelog with executed results.
 *
 * Demos are fenced ```demo blocks in commit messages containing:
 *   description: short title
 *   code:
 *   let x = 42;
 *   x + 1
 *
 * Usage:
 *   npm run demo              # render HTML changelog and open in browser
 *   npm run demo -- --check   # validate current commit's demo code
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { platform } from 'node:os'

const CACHE_DIR = join(process.cwd(), '.cache', 'demo')
const CACHE_FILE = join(CACHE_DIR, 'commits.json')
const CACHE_HASH_FILE = join(CACHE_DIR, 'last-hash.txt')

// Earliest commit with a demo block — scans from here to HEAD
const EARLIEST_DEMO_COMMIT = 'bd3d28e7'

const baseUrl = 'http://localhost:9901'

// Parse CLI args
const args = process.argv.slice(2)
const checkMode = args.includes('--check')

if (checkMode) {
  // --check: validate current commit's demo code
  const message = execSync('git log -1 --format=%B HEAD', { encoding: 'utf-8' })
  const demos = extractDemos(message)
  if (demos.length === 0) {
    console.log('No demo blocks found in HEAD')
    process.exit(0)
  }
  runCheck(demos)
} else {
  // Default: render HTML changelog
  renderAllDemos()
}

// ---------------------------------------------------------------------------
// --all: scan git log and render HTML changelog
// ---------------------------------------------------------------------------

/** Scan a single commit for demo blocks. Returns entry or null if no demos. */
function scanCommit(hash) {
  const body = execSync(`git log -1 --format=%B ${hash}`, { encoding: 'utf-8' })
  const demos = extractDemos(body)
  if (demos.length === 0) return null

  const subject = execSync(`git log -1 --format=%s ${hash}`, { encoding: 'utf-8' }).trim()
  const dateIso = execSync(`git log -1 --format=%aI ${hash}`, { encoding: 'utf-8' }).trim()
  const authorName = execSync(`git log -1 --format=%an ${hash}`, { encoding: 'utf-8' }).trim()
  const authorEmail = execSync(`git log -1 --format=%ae ${hash}`, { encoding: 'utf-8' }).trim()

  const coAuthors = []
  const coAuthorRegex = /Co-Authored-By:\s*(.+?)\s*<(.+?)>/gi
  let coMatch
  while ((coMatch = coAuthorRegex.exec(body)) !== null) {
    coAuthors.push({ name: coMatch[1].trim(), email: coMatch[2].trim() })
  }

  let insertions = 0
  let deletions = 0
  try {
    const stat = execSync(`git diff --shortstat ${hash}~1..${hash}`, { encoding: 'utf-8' }).trim()
    const insMatch = stat.match(/(\d+) insertion/)
    const delMatch = stat.match(/(\d+) deletion/)
    if (insMatch) insertions = parseInt(insMatch[1], 10)
    if (delMatch) deletions = parseInt(delMatch[1], 10)
  } catch { /* first commit has no parent — ignore */ }

  // Execute each demo and capture result/error
  for (const demo of demos) {
    if (!demo.code) continue
    try {
      const tempFile = join(tmpdir(), `dvala-demo-run-${Date.now()}.cjs`)
      const script = `
        const { createDvala, allBuiltinModules } = require('${join(process.cwd(), 'dist/full.js')}');
        const dvala = createDvala({ modules: allBuiltinModules });
        const result = dvala.run(${JSON.stringify(demo.code)});
        process.stdout.write(result === null ? 'null' : typeof result === 'string' ? '"' + result + '"' : JSON.stringify(result));
      `
      writeFileSync(tempFile, script)
      try {
        demo.result = execSync(`node "${tempFile}"`, { encoding: 'utf-8', stdio: 'pipe', timeout: 10000 })
      } finally {
        try { unlinkSync(tempFile) } catch { /* ignore */ }
      }
    } catch (e) {
      const errLines = (e.stderr || e.message || '').trim().split('\n')
      demo.error = errLines.filter(l => l.length < 200).pop() || errLines[errLines.length - 1]?.substring(0, 200) || 'Unknown error'
    }
  }

  return {
    hash: hash.substring(0, 8),
    fullHash: hash,
    subject,
    dateIso,
    date: dateIso.substring(0, 10),
    author: { name: authorName, email: authorEmail },
    coAuthors,
    insertions,
    deletions,
    demos,
  }
}

function renderAllDemos() {
  // Load cached entries if available
  let cachedEntries = []
  let lastCachedHash = null

  if (existsSync(CACHE_FILE) && existsSync(CACHE_HASH_FILE)) {
    try {
      cachedEntries = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
      lastCachedHash = readFileSync(CACHE_HASH_FILE, 'utf-8').trim()
      // Verify the cached hash still exists in the repo (handles rebase/amend)
      try {
        execSync(`git cat-file -t ${lastCachedHash}`, { encoding: 'utf-8', stdio: 'pipe' })
      } catch {
        // Hash no longer exists — full rescan
        console.log('Cache invalidated (commit not found), rescanning...')
        cachedEntries = []
        lastCachedHash = null
      }
    } catch {
      cachedEntries = []
      lastCachedHash = null
    }
  }

  // Determine which commits to scan
  const rangeStart = lastCachedHash ? lastCachedHash : `${EARLIEST_DEMO_COMMIT}^`
  const hashes = execSync(
    `git log --reverse --format=%H ${rangeStart}..HEAD`,
    { encoding: 'utf-8' },
  ).trim().split('\n').filter(Boolean)

  if (hashes.length === 0 && cachedEntries.length > 0) {
    console.log(`Cache hit — ${cachedEntries.length} commits, no new commits to scan`)
  } else if (lastCachedHash) {
    console.log(`Cache hit — ${cachedEntries.length} cached, scanning ${hashes.length} new commits...`)
  } else {
    console.log(`Scanning ${hashes.length} commits...`)
  }

  const newEntries = []

  for (let i = 0; i < hashes.length; i++) {
    const hash = hashes[i]
    process.stdout.write(`\r  Scanning commit ${i + 1}/${hashes.length}...`)
    const entry = scanCommit(hash)
    if (entry) newEntries.push(entry)
  }
  if (hashes.length > 0) {
    process.stdout.write(`\r  Scanned ${hashes.length} commits, found ${newEntries.length} with demos.\n`)
  }

  // Merge: cached entries + new entries (chronological order)
  const allEntries = [...cachedEntries, ...newEntries]

  // Update cache
  if (newEntries.length > 0 || !lastCachedHash) {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(CACHE_FILE, JSON.stringify(allEntries, null, 2))
    const headHash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
    writeFileSync(CACHE_HASH_FILE, headHash)
  }

  if (allEntries.length === 0) {
    console.log('No demo blocks found in history.')
    return
  }

  // Read logo for embedding as data URL
  let logoDataUrl = ''
  try {
    const logoPath = join(process.cwd(), 'playground-www/public/images/dvala-logo.webp')
    const logoBase64 = readFileSync(logoPath).toString('base64')
    logoDataUrl = `data:image/webp;base64,${logoBase64}`
  } catch { /* logo not found — render without it */ }

  // Render HTML
  const html = renderHtml(allEntries, logoDataUrl)

  // Write to temp file and open in browser
  const tempFile = join(tmpdir(), 'dvala-demos.html')
  writeFileSync(tempFile, html)
  const demoCount = allEntries.reduce((n, e) => n + e.demos.length, 0)
  console.log(`Rendered ${demoCount} demos from ${allEntries.length} commits`)
  console.log(`Opening ${tempFile}`)

  // Open the HTML file in the default browser
  try {
    if (platform() === 'darwin') {
      execSync(`open "${tempFile}"`)
    } else if (platform() === 'win32') {
      execSync(`start "" "${tempFile}"`)
    } else {
      execSync(`xdg-open "${tempFile}"`)
    }
  } catch (e) {
    console.log(`Could not open browser: ${e.message?.substring(0, 100)}`)
    console.log(`Open manually: ${tempFile}`)
  }
}

/**
 * Generate the HTML changelog page with interactive features:
 * - Search/filter demos by text
 * - Collapsed entries, click to expand
 * - Detail view with keyboard navigation (up/down arrows)
 * - Click title to open in playground
 */
function renderHtml(entries, logoDataUrl) {
  // Structure: commits with nested demos — no metadata duplication
  const commits = entries.map(entry => {
    const authors = [entry.author.name, ...entry.coAuthors.map(a => a.name)]

    const processedDemos = entry.demos.map(demo => {
      const state = {}
      if (demo.code) state['dvala-code'] = demo.code
      if (demo.context) state['context'] = demo.context
      const encoded = btoa(encodeURIComponent(JSON.stringify(state)))
      const url = `${baseUrl}/?state=${encoded}`

      const codeLines = (demo.code || '').split('\n')
      const commentLines = []
      for (const line of codeLines) {
        if (line.startsWith('//')) commentLines.push(line.replace(/^\/\/\s?/, ''))
        else if (line.trim() === '') continue
        else break
      }
      const codeWithoutComments = codeLines
        .slice(codeLines.findIndex(l => l.trim() !== '' && !l.startsWith('//')))
        .join('\n').trim()

      return {
        title: demo.description || '(untitled)',
        desc: commentLines.join(' '),
        code: codeWithoutComments,
        url,
        result: demo.result ?? null,
        error: demo.error ?? null,
        // Historical demos: hide git metadata (hash, date, author, stats)
        historical: demo.historical === 'true',
      }
    })

    return {
      hash: entry.hash,
      fullHash: entry.fullHash,
      subject: entry.subject,
      date: entry.date,
      dateIso: entry.dateIso,
      authors,
      insertions: entry.insertions,
      deletions: entry.deletions,
      demos: processedDemos,
    }
  })

  // Flatten for the view — each demo carries a reference to its commit index
  const flatDemos = []
  for (let ci = 0; ci < commits.length; ci++) {
    for (const demo of commits[ci].demos) {
      flatDemos.push({ ...demo, commitIndex: ci })
    }
  }

  const headHash = execSync('git rev-parse --short=8 HEAD', { encoding: 'utf-8' }).trim()

  // Filter out commits not reachable from HEAD (e.g., when on a historical checkout)
  const reachable = new Set(
    execSync(`git log --format=%H ${EARLIEST_DEMO_COMMIT}^..HEAD`, { encoding: 'utf-8' })
      .trim().split('\n').filter(Boolean).map(h => h.substring(0, 8)),
  )
  const visibleCommits = commits.filter(c => reachable.has(c.hash))
  // Remap demo commitIndex to the filtered commits array
  const oldToNew = new Map(visibleCommits.map((c, newIdx) => [commits.indexOf(c), newIdx]))
  const visibleDemos = flatDemos
    .filter(d => oldToNew.has(d.commitIndex))
    .map(d => ({ ...d, commitIndex: oldToNew.get(d.commitIndex) }))

  const dataJson = JSON.stringify({ commits: visibleCommits, demos: visibleDemos, headHash })

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Dvala Demos</title>
  <style>
    :root {
      /* Matching the Dvala playground color scheme */
      --bg: #1a1a1a;
      --surface: #2a2a2a;
      --surface-hover: #333;
      --surface-active: #414141;
      --border: #444;
      --text: #d4d4d4;
      --text-dim: #8c8c8c;
      --accent: #e6c07b;
      --link: #7c9ef8;
      --code-bg: #0d0d0d;
      --code-text: #abb2bf;
      --highlight: rgba(124, 158, 248, 0.08);
      --error: #ff8a8a;
      --success: #98c379;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      overflow: hidden;
      height: 100vh;
    }

    /* --- Layout --- */
    .app { display: flex; flex-direction: column; height: 100vh; }
    .header { padding: 1.5rem 2rem 1rem; flex-shrink: 0; }
    .header-title { display: flex; align-items: center; gap: 0.8rem; margin-bottom: 0.3rem; }
    .header-logo { height: 36px; width: auto; }
    .header h1 { font-size: 1.6rem; color: var(--accent); }
    .header .subtitle { color: var(--text-dim); font-size: 0.85rem; }
    .search-bar {
      margin-top: 0.8rem;
      display: flex;
      gap: 0.5rem;
    }
    .search-bar input {
      flex: 1;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.5rem 0.8rem;
      color: var(--text);
      font-size: 0.9rem;
      outline: none;
    }
    .search-bar input:focus { border-color: var(--link); }
    .search-bar input::placeholder { color: var(--text-dim); }
    .count { color: var(--text-dim); font-size: 0.8rem; padding: 0.5rem 0; }

    /* --- List view --- */
    .list-view {
      flex: 1;
      overflow-y: auto;
      padding: 0 2rem 2rem;
    }
    .entry {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 0.5rem;
      cursor: pointer;
      transition: background 0.1s;
    }
    .entry:hover { background: var(--surface-hover); }
    .entry.active { background: var(--surface-active); border-color: var(--link); }
    .entry-header {
      display: flex;
      align-items: center;
      padding: 0.7rem 1rem;
      gap: 0.8rem;
    }
    .entry-title { flex: 1; font-size: 0.95rem; color: var(--link); }
    .entry-hash {
      font-family: monospace;
      font-size: 0.75rem;
      color: var(--accent);
      background: var(--code-bg);
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
    }
    .entry-date { color: var(--text-dim); font-size: 0.75rem; }
    .entry-authors { color: var(--text-dim); font-size: 0.75rem; }
    .entry-diff { font-family: monospace; font-size: 0.75rem; }
    .diff-ins { color: #4ade80; font-weight: 600; margin-right: 0.4rem; }
    .diff-del { color: #f87171; font-weight: 600; margin-right: 0.5rem; }
    .diff-bar {
      display: inline-flex;
      align-items: center;
      height: 10px;
      vertical-align: middle;
      border-radius: 3px;
      overflow: hidden;
    }
    .diff-bar-segment {
      display: inline-block;
      height: 100%;
    }
    .diff-bar-segment.green { background: #4ade80; }
    .diff-bar-segment.red { background: #f87171; }
    .entry-desc {
      color: var(--text-dim);
      font-size: 0.85rem;
      padding: 0 1rem 0.5rem 1rem;
      display: none;
    }
    .entry.expanded .entry-desc { display: block; }
    .entry-expanded-content { display: none; }
    .entry.expanded .entry-expanded-content { display: block; }
    .entry-code {
      margin: 0 0.6rem 0.6rem;
      background: var(--code-bg);
      border-radius: 6px;
      padding: 0.8rem;
      overflow-x: auto;
      position: relative;
    }
    .entry-code pre { margin: 0; }
    .entry-code code {
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.82rem;
      line-height: 1.5;
      color: var(--code-text);
      white-space: pre;
    }
    .copy-btn {
      position: absolute;
      top: 0.4rem;
      right: 0.4rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text-dim);
      cursor: pointer;
      padding: 0.2rem 0.5rem;
      font-size: 0.7rem;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .entry-code:hover .copy-btn,
    .entry-output:hover .copy-btn,
    .detail-code:hover .copy-btn { opacity: 1; }
    .copy-btn:hover { color: var(--text); border-color: var(--text-dim); }
    .entry-output {
      margin: 0 0.6rem 0.4rem;
      padding: 0.5rem 0.8rem;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.8rem;
      line-height: 1.4;
      color: var(--success);
      background: var(--code-bg);
      border-left: 3px solid var(--success);
      border-radius: 0 6px 6px 0;
      white-space: pre-wrap;
      word-break: break-word;
      position: relative;
    }
    .entry-output.error {
      color: var(--error);
      border-left-color: var(--error);
    }
    .entry-output-label {
      font-size: 0.7rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.2rem;
    }
    .entry-playground-link {
      display: inline-block;
      margin: 0 0.6rem 0.6rem;
      padding: 0.35rem 0.8rem;
      font-size: 0.8rem;
      color: var(--link);
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 5px;
      text-decoration: none;
    }
    .entry-playground-link:hover { background: var(--surface-hover); }
    .date-group {
      color: var(--text-dim);
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 1rem 0 0.4rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 0.5rem;
    }
    .date-group:first-child { padding-top: 0; }
    .commit-group {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.6rem 0.8rem;
      margin-top: 1rem;
      margin-bottom: 0.3rem;
      font-size: 0.8rem;
      color: var(--text-dim);
      background: var(--code-bg);
      border-radius: 6px;
    }
    .commit-group .commit-hash {
      font-family: monospace;
      color: var(--accent);
      background: var(--surface);
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      font-size: 0.75rem;
    }
    .commit-group .commit-subject { flex: 1; }
    .commit-group .commit-date { color: var(--text-dim); font-size: 0.75rem; }
    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      padding: 1rem 0;
      color: var(--text-dim);
      font-size: 0.85rem;
    }
    .pagination button {
      padding: 0.4rem 1rem;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--link);
      cursor: pointer;
      font-size: 0.85rem;
    }
    .pagination button:hover:not(:disabled) { background: var(--surface-hover); }
    .pagination button:disabled { opacity: 0.4; cursor: default; }
    .detail-panel { min-height: 400px; }
    .hidden { display: none !important; }
    .head-banner {
      background: var(--code-bg);
      border: 1px solid var(--accent);
      border-radius: 8px;
      padding: 0.8rem 1rem;
      margin-bottom: 1rem;
      font-size: 0.85rem;
      color: var(--text-dim);
    }
    .head-banner strong { color: var(--accent); }
    .entry.current-commit {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }
    .current-badge {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--bg);
      background: var(--accent);
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      flex-shrink: 0;
    }

    /* --- Detail overlay --- */
    .detail-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      z-index: 100;
      justify-content: center;
      align-items: center;
      padding: 2rem;
    }
    .detail-overlay.open { display: flex; }
    .detail-panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      max-width: 800px;
      width: 100%;
      max-height: 85vh;
      overflow-y: auto;
      padding: 2rem;
    }
    .detail-panel h2 {
      color: var(--link);
      font-size: 1.3rem;
      margin-bottom: 0.5rem;
    }
    .detail-meta {
      display: flex;
      gap: 1rem;
      font-size: 0.8rem;
      color: var(--text-dim);
      margin-bottom: 1rem;
    }
    .detail-desc {
      color: var(--text-dim);
      font-size: 0.95rem;
      margin-bottom: 1rem;
      line-height: 1.5;
    }
    .detail-code {
      background: var(--code-bg);
      border-radius: 8px;
      padding: 1.2rem;
      overflow-x: auto;
      margin-bottom: 1.2rem;
      position: relative;
    }
    .detail-code pre { margin: 0; }
    .detail-code code {
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.9rem;
      line-height: 1.6;
      color: var(--code-text);
      white-space: pre;
    }
    .detail-actions {
      display: flex;
      gap: 0.8rem;
    }
    .detail-actions a, .detail-actions button {
      padding: 0.5rem 1.2rem;
      border-radius: 6px;
      font-size: 0.85rem;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid var(--border);
      background: var(--code-bg);
      color: var(--link);
      transition: background 0.1s;
    }
    .detail-actions a:hover, .detail-actions button:hover {
      background: var(--surface-hover);
    }
    .detail-actions .primary {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }
    .detail-nav {
      color: var(--text-dim);
      font-size: 0.75rem;
      margin-top: 1rem;
      text-align: center;
    }
    kbd {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 0.1rem 0.4rem;
      font-size: 0.75rem;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="header">
      <div class="header-title">
        ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Dvala" class="header-logo">` : ''}
        <h1>Dvala Demos</h1>
      </div>
      <p class="subtitle">Interactive changelog — click to expand, Enter to open detail view, or click title to open in playground.</p>
      <div class="search-bar">
        <input type="text" id="search" placeholder="Search demos..." autofocus>
      </div>
      <div class="count" id="count"></div>
    </div>
    <div class="list-view" id="list"></div>
  </div>

  <div class="detail-overlay" id="overlay">
    <div class="detail-panel" id="detail"></div>
  </div>

  <!-- All demo data exposed on window for programmatic access -->
  <script>window.__dvalaData = ${dataJson};</script>

  <script>
    const { commits, demos, headHash } = window.__dvalaData;

    // Helper: get commit metadata for a demo, with optional per-demo overrides.
    // Historical demos specify hash/date/author directly in the demo block
    // to show the original feature commit's metadata instead of the carrier commit.
    // Get commit metadata. Historical demos hide it in the UI.
    function commitOf(d) { return commits[d.commitIndex]; }
    const listEl = document.getElementById('list');
    const searchEl = document.getElementById('search');
    const countEl = document.getElementById('count');
    const overlay = document.getElementById('overlay');
    const detailEl = document.getElementById('detail');

    const PAGE_SIZE = 20;
    let filteredDemos = [...demos];
    let activeIndex = -1;
    let detailIndex = -1;
    let currentPage = 0;

    // --- Render list ---
    function render() {
      const query = searchEl.value.toLowerCase();
      filteredDemos = demos.filter(d => {
        const c = commitOf(d);
        return d.title.toLowerCase().includes(query)
          || d.desc.toLowerCase().includes(query)
          || d.code.toLowerCase().includes(query)
          || c.hash.includes(query)
          || c.fullHash.includes(query)
          || c.subject.toLowerCase().includes(query)
          || c.authors.some(a => a.toLowerCase().includes(query))
          || c.date.includes(query)
          || c.dateIso.includes(query);
      });

      // Sort by effective date, newest first
      filteredDemos.sort((a, b) => {
        const da = commitOf(a).date;
        const db = commitOf(b).date;
        return db.localeCompare(da);
      });

      currentPage = 0;
      renderPage();
    }

    function renderPage() {
      const start = currentPage * PAGE_SIZE;
      const pageItems = filteredDemos.slice(start, start + PAGE_SIZE);
      const totalPages = Math.ceil(filteredDemos.length / PAGE_SIZE);

      countEl.textContent = filteredDemos.length + ' of ' + demos.length + ' demos' +
        (totalPages > 1 ? ' — page ' + (currentPage + 1) + '/' + totalPages : '');
      listEl.innerHTML = '';
      activeIndex = -1;

      // HEAD commit banner — show on first page when not searching
      if (currentPage === 0 && !searchEl.value) {
        const headDemos = demos.filter(d => commitOf(d).hash === headHash);
        const banner = document.createElement('div');
        banner.className = 'head-banner';
        if (headDemos.length > 0) {
          banner.innerHTML = '<strong>HEAD</strong> (' + headHash + ') has ' + headDemos.length + ' demo' + (headDemos.length > 1 ? 's' : '');
        } else {
          banner.innerHTML = '<strong>HEAD</strong> (' + headHash + ') — no demos on current commit';
        }
        listEl.appendChild(banner);
      }

      // Group by date, then by commit within each date group
      let currentDateGroup = '';
      let currentCommitHash = '';
      pageItems.forEach((d, localIdx) => {
        const i = start + localIdx;
        const c = commitOf(d);

        // Date group header (Today, Yesterday, This Week, etc.)
        const dateGroup = getDateGroup(c.date);
        if (dateGroup !== currentDateGroup) {
          currentDateGroup = dateGroup;
          currentCommitHash = ''; // reset commit grouping
          const groupEl = document.createElement('div');
          groupEl.className = 'date-group';
          groupEl.textContent = dateGroup;
          listEl.appendChild(groupEl);
        }

        // Commit group header — show once per commit (skip for historical demos)
        if (!d.historical && c.hash !== currentCommitHash) {
          currentCommitHash = c.hash;
          const commitEl = document.createElement('div');
          commitEl.className = 'commit-group';
          commitEl.innerHTML =
            '<span class="commit-hash">' + c.hash + '</span> ' +
            '<span class="commit-subject">' + esc(c.subject) + '</span>' +
            ((c.insertions || c.deletions) ? ' ' + diffBar(c.insertions, c.deletions) : '') +
            '<span class="commit-date">' + c.date + '</span>';
          listEl.appendChild(commitEl);
        }

        const entry = document.createElement('div');
        const isCurrent = c.hash === headHash;
        entry.className = 'entry' + (isCurrent ? ' current-commit' : '');
        entry.dataset.index = i;
        const outputHtml = d.result != null
          ? '<div class="entry-output"><div class="entry-output-label">Result</div><button class="copy-btn" onclick="copyText(this, ' + JSON.stringify(JSON.stringify(d.result)) + ')">Copy</button>' + esc(d.result) + '</div>'
          : d.error
            ? '<div class="entry-output error"><div class="entry-output-label">Error</div>This demo was written for an older version of Dvala and may no longer be compatible.</div>'
            : '';

        entry.innerHTML =
          '<div class="entry-header">' +
            '<span class="entry-title">' + esc(d.title) + '</span>' +
            (isCurrent ? '<span class="current-badge">HEAD</span>' : '') +
          '</div>' +
          (d.desc ? '<div class="entry-desc">' + esc(d.desc) + '</div>' : '') +
          '<div class="entry-expanded-content">' +
            '<div class="entry-code"><pre><code>' + esc(d.code) + '</code></pre><button class="copy-btn" onclick="copyText(this, ' + JSON.stringify(JSON.stringify(d.code)) + ')">Copy</button></div>' +
            outputHtml +
            '<a href="' + esc(d.url) + '" target="_blank" class="entry-playground-link">Open in Playground</a>' +
          '</div>';

        // Click to expand/collapse
        entry.addEventListener('click', (e) => {
          if (e.target.closest('.entry-code') || e.target.closest('.entry-output') || e.target.closest('.copy-btn')) return;
          const wasExpanded = entry.classList.contains('expanded');
          // Collapse all
          listEl.querySelectorAll('.entry.expanded').forEach(el => el.classList.remove('expanded'));
          if (!wasExpanded) {
            entry.classList.add('expanded');
            setActive(i);
          }
        });

        // Double-click opens detail
        entry.addEventListener('dblclick', () => openDetail(i));

        listEl.appendChild(entry);
      });

      // Pagination controls
      if (totalPages > 1) {
        const pager = document.createElement('div');
        pager.className = 'pagination';
        pager.innerHTML =
          '<button ' + (currentPage === 0 ? 'disabled' : '') + ' onclick="prevPage()">← Prev</button>' +
          '<span>Page ' + (currentPage + 1) + ' of ' + totalPages + '</span>' +
          '<button ' + (currentPage >= totalPages - 1 ? 'disabled' : '') + ' onclick="nextPage()">Next →</button>';
        listEl.appendChild(pager);
      }
    }

    window.prevPage = function() {
      if (currentPage > 0) { currentPage--; renderPage(); listEl.scrollTop = 0; }
    };
    window.nextPage = function() {
      const totalPages = Math.ceil(filteredDemos.length / PAGE_SIZE);
      if (currentPage < totalPages - 1) { currentPage++; renderPage(); listEl.scrollTop = 0; }
    };

    function setActive(i) {
      activeIndex = i;
      listEl.querySelectorAll('.entry.active').forEach(el => el.classList.remove('active'));
      const el = listEl.querySelector('[data-index="' + i + '"]');
      if (el) {
        el.classList.add('active');
        el.scrollIntoView({ block: 'nearest' });
      }
    }

    // --- Detail view ---
    function openDetail(i) {
      detailIndex = i;
      const d = filteredDemos[i];
      if (!d) return;

      const c = commitOf(d);

      // Git metadata section: hidden for historical demos
      const detailMeta = d.historical ? '' :
        '<div class="detail-meta">' +
          '<span class="commit-hash">' + c.hash + '</span>' +
          '<span>' + esc(c.subject) + '</span>' +
        '</div>' +
        '<div class="detail-meta">' +
          '<span>' + esc(c.authors.join(', ')) + '</span>' +
          '<span>' + c.dateIso +
            ((c.insertions || c.deletions) ? ' &middot; ' + diffBar(c.insertions, c.deletions) : '') +
          '</span>' +
        '</div>';

      const detailOutput = d.result != null
        ? '<div class="entry-output" style="margin:0 0 1rem"><div class="entry-output-label">Result</div><button class="copy-btn" onclick="copyText(this, ' + JSON.stringify(JSON.stringify(d.result)) + ')">Copy</button>' + esc(d.result) + '</div>'
        : d.error
          ? '<div class="entry-output error" style="margin:0 0 1rem"><div class="entry-output-label">Error</div>This demo was written for an older version of Dvala and may no longer be compatible.</div>'
          : '';

      detailEl.innerHTML =
        '<h2>' + esc(d.title) + '</h2>' +
        detailMeta +
        (d.desc ? '<p class="detail-desc">' + esc(d.desc) + '</p>' : '') +
        '<div class="detail-code"><pre><code>' + esc(d.code) + '</code></pre><button class="copy-btn" onclick="copyText(this, ' + JSON.stringify(JSON.stringify(d.code)) + ')">Copy</button></div>' +
        detailOutput +
        '<div class="detail-actions">' +
          '<a href="' + esc(d.url) + '" target="_blank" class="primary">Open in Playground</a>' +
          '<button onclick="closeDetail()">Close</button>' +
        '</div>' +
        '<div class="detail-nav">' +
          '<kbd>&uarr;</kbd> <kbd>&darr;</kbd> navigate &nbsp; ' +
          '<kbd>Esc</kbd> close &nbsp; ' +
          '<kbd>Enter</kbd> open in playground' +
        '</div>';

      overlay.classList.add('open');
    }

    window.closeDetail = function() {
      overlay.classList.remove('open');
      detailIndex = -1;
      // Re-focus search so keyboard works
      searchEl.focus();
    };

    // --- Keyboard navigation ---
    document.addEventListener('keydown', (e) => {
      // Detail view navigation
      if (overlay.classList.contains('open')) {
        if (e.key === 'Escape') { closeDetail(); e.preventDefault(); }
        else if (e.key === 'ArrowDown') {
          if (detailIndex < filteredDemos.length - 1) openDetail(detailIndex + 1);
          e.preventDefault();
        }
        else if (e.key === 'ArrowUp') {
          if (detailIndex > 0) openDetail(detailIndex - 1);
          e.preventDefault();
        }
        else if (e.key === 'Enter') {
          const d = filteredDemos[detailIndex];
          if (d) window.open(d.url, '_blank');
          e.preventDefault();
        }
        return;
      }

      // List view navigation
      if (e.key === 'ArrowDown') {
        setActive(Math.min(activeIndex + 1, filteredDemos.length - 1));
        // Expand the active entry
        listEl.querySelectorAll('.entry.expanded').forEach(el => el.classList.remove('expanded'));
        const el = listEl.querySelector('[data-index="' + activeIndex + '"]');
        if (el) el.classList.add('expanded');
        e.preventDefault();
      }
      else if (e.key === 'ArrowUp') {
        setActive(Math.max(activeIndex - 1, 0));
        listEl.querySelectorAll('.entry.expanded').forEach(el => el.classList.remove('expanded'));
        const el = listEl.querySelector('[data-index="' + activeIndex + '"]');
        if (el) el.classList.add('expanded');
        e.preventDefault();
      }
      else if (e.key === 'Enter' && activeIndex >= 0) {
        openDetail(activeIndex);
        e.preventDefault();
      }
      else if (e.key === 'Escape') {
        searchEl.value = '';
        render();
        searchEl.focus();
        e.preventDefault();
      }
    });

    // Click overlay backdrop to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDetail();
    });

    // Search with debounce
    let searchTimeout;
    searchEl.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(render, 150);
    });

    function esc(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    window.copyText = function(btn, text) {
      navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.opacity = '1';
        setTimeout(() => { btn.textContent = orig; btn.style.opacity = ''; }, 1200);
      });
    };

    // Classify a date string (YYYY-MM-DD) into a relative group label
    function getDateGroup(dateStr) {
      const date = new Date(dateStr + 'T00:00:00');
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return 'This Week';
      if (diffDays < 14) return 'Last Week';
      if (diffDays < 30) return 'This Month';
      if (diffDays < 60) return 'Last Month';

      // Older: show month name + year
      const months = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
      return months[date.getMonth()] + ' ' + date.getFullYear();
    }

    // Render a proportional histogram bar for diff stats.
    // Total bar width scales linearly: 1000+ lines = max width (120px).
    // Green/red segments show insertion/deletion ratio within the bar.
    function diffBar(ins, del) {
      const total = ins + del;
      if (total === 0) return '';
      const MAX_LINES = 1000;
      const MAX_WIDTH = 120; // px
      const barWidth = Math.max(4, Math.round((Math.min(total, MAX_LINES) / MAX_LINES) * MAX_WIDTH));
      const greenWidth = Math.max(ins > 0 ? 2 : 0, Math.round((ins / total) * barWidth));
      const redWidth = barWidth - greenWidth;
      return '<span class="diff-ins">+' + ins + '</span>' +
             '<span class="diff-del">-' + del + '</span>' +
             '<span class="diff-bar" style="width:' + barWidth + 'px">' +
               (greenWidth > 0 ? '<span class="diff-bar-segment green" style="width:' + greenWidth + 'px"></span>' : '') +
               (redWidth > 0 ? '<span class="diff-bar-segment red" style="width:' + redWidth + 'px"></span>' : '') +
             '</span>';
    }

    // Initial render
    render();
  </script>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// --check: validate demos against current build
// ---------------------------------------------------------------------------

function runCheck(demos) {
  let allPassed = true
  for (const demo of demos) {
    if (!demo.code) continue
    try {
      // Write a temp script to avoid shell escaping issues (e.g., $ in Dvala code)
      const tempFile = join(tmpdir(), `dvala-demo-check-${Date.now()}.cjs`)
      const script = `
        const { createDvala, allBuiltinModules } = require('${join(process.cwd(), 'dist/full.js')}');
        const dvala = createDvala({ modules: allBuiltinModules });
        dvala.run(${JSON.stringify(demo.code)});
      `
      writeFileSync(tempFile, script)
      try {
        execSync(`node "${tempFile}"`, { encoding: 'utf-8', stdio: 'pipe', timeout: 10000 })
      } finally {
        try { unlinkSync(tempFile) } catch { /* ignore cleanup errors */ }
      }
      console.log(`  ✅ ${demo.description || '(no description)'}`)
    } catch (e) {
      console.log(`  ❌ ${demo.description || '(no description)'}`)
      // Show only short error lines (skip minified source dumps)
      const errLines = (e.stderr || e.message || '').trim().split('\n')
      const lastLine = errLines.filter(l => l.length < 200).pop() || errLines[errLines.length - 1]?.substring(0, 200)
      console.log(`     ${lastLine}`)
      allPassed = false
    }
  }
  process.exit(allPassed ? 0 : 1)
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extract all ```demo blocks from a commit message.
 */
function extractDemos(message) {
  // Support N-backtick fences (3+). The closing fence must match the opening count.
  // This allows code containing triple backticks to be wrapped in 4+ backtick fences.
  const demoRegex = /(`{3,})demo\n([\s\S]*?)\1/g
  const demos = []
  let match
  while ((match = demoRegex.exec(message)) !== null) {
    demos.push(parseDemo(match[2]))
  }
  return demos
}

/**
 * Parse the contents of a single ```demo block into structured fields.
 *
 * Multi-line fields (content accumulates until next header):
 *   description, code, context, handlers (alias for context)
 *
 * Single-line metadata fields (optional, override commit-level metadata):
 *   hash, date, author — used for historical demos added retroactively
 */
function parseDemo(block) {
  const demo = { description: '', code: '', context: '' }
  // Optional metadata overrides (single-line, no accumulation)
  const singleLineFields = new Set(['historical'])
  let currentField = null

  for (const line of block.split('\n')) {
    const fieldMatch = line.match(/^(description|code|context|handlers|hash|date|author):\s*(.*)/)
    if (fieldMatch) {
      let field = fieldMatch[1]
      if (field === 'handlers') field = 'context'
      const rest = fieldMatch[2].trim()

      if (singleLineFields.has(field)) {
        // Single-line metadata: store directly, don't set as currentField
        if (rest) demo[field] = rest
      } else {
        // Multi-line content field
        currentField = field
        if (rest) demo[currentField] = rest
      }
    } else if (currentField) {
      demo[currentField] += (demo[currentField] ? '\n' : '') + line
    }
  }

  for (const key of Object.keys(demo)) {
    if (typeof demo[key] === 'string') demo[key] = demo[key].trim()
  }
  return demo
}

/** Escape HTML special characters for safe embedding. */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
