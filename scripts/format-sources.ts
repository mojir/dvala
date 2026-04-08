/**
 * Reformats Dvala code snippets embedded in markdown files and standalone
 * .dvala files so they satisfy format(code) === code.
 *
 * TypeScript source files (reference/examples.ts, reference/datatype.ts, etc.)
 * use the `dvala` tagged template helper or `format()` directly, so they are
 * self-formatting and do NOT need this script.
 *
 * Usage: npm run format-snippets
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from '../src/formatter/format'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let changed = 0
let unchanged = 0

function report(rel: string, didChange: boolean): void {
  if (didChange) {
    console.log(`  formatted  ${rel}`)
    changed++
  } else {
    unchanged++
  }
}

// ---------------------------------------------------------------------------
// .dvala files
// ---------------------------------------------------------------------------

function formatDvalaFile(filePath: string): void {
  const original = fs.readFileSync(filePath, 'utf-8')
  const formatted = format(original.trimEnd()) + '\n'
  if (formatted !== original) {
    fs.writeFileSync(filePath, formatted, 'utf-8')
    report(path.relative(root, filePath), true)
  } else {
    report(path.relative(root, filePath), false)
  }
}

function collectDvalaFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...collectDvalaFiles(fullPath))
    else if (entry.name.endsWith('.dvala')) results.push(fullPath)
  }
  return results.sort()
}

// ---------------------------------------------------------------------------
// Markdown: reformat fenced dvala code blocks in-place
// ---------------------------------------------------------------------------

function formatMarkdownFile(filePath: string): void {
  const original = fs.readFileSync(filePath, 'utf-8')
  const updated = original.replace(
    /^(```dvala[^\n]*\n)([\s\S]*?)^```/gm,
    (match, fence: string, body: string) => {
      const options = fence.slice('```dvala'.length).trim()
      if (options.split(',').map((s: string) => s.trim()).includes('no-run')) return match
      const trimmed = body.trimEnd()
      const formatted = format(trimmed).trimEnd()
      return `${fence}${formatted}\n\`\`\``
    },
  )
  if (updated !== original) {
    fs.writeFileSync(filePath, updated, 'utf-8')
    report(path.relative(root, filePath), true)
  } else {
    report(path.relative(root, filePath), false)
  }
}

function collectMarkdownFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...collectMarkdownFiles(fullPath))
    else if (entry.name.endsWith('.md')) results.push(fullPath)
  }
  return results.sort()
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Formatting book markdown files...')
for (const f of collectMarkdownFiles(path.join(root, 'book'))) formatMarkdownFile(f)

console.log('Formatting feature card markdown files...')
for (const f of collectMarkdownFiles(path.join(root, 'playground-www/src/featureCards'))) formatMarkdownFile(f)

console.log('Formatting example project .dvala files...')
for (const f of collectDvalaFiles(path.join(root, 'examples'))) formatDvalaFile(f)

console.log('Formatting built-in module source .dvala files...')
for (const f of collectDvalaFiles(path.join(root, 'src/builtin/modules')).filter(file => !file.endsWith('.test.dvala'))) formatDvalaFile(f)

console.log(`\nDone. ${changed} file(s) changed, ${unchanged} already formatted.`)
