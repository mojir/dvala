/**
 * Round-trip stability tests: format(code) === code
 *
 * Verifies that all Dvala code snippets across the codebase are already
 * correctly formatted. A failure means either the source needs reformatting
 * (run `npm run format-snippets` for markdown/.dvala files) or the formatter
 * has a regression.
 *
 * TypeScript sources (reference/examples.ts, reference/datatype.ts, etc.) use
 * the `dvala` tagged template helper or `format()` directly — they are
 * self-enforcing and do not need separate round-trip tests here.
 */

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractCodeBlocks } from '../../reference/book'
import { format } from './format'

const root = path.resolve(import.meta.dirname, '../..')
const BUILTIN_MODULE_ROUNDTRIP_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return []
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...collectFiles(fullPath, ext))
    else if (entry.name.endsWith(ext)) results.push(fullPath)
  }
  return results.sort()
}

function rel(filePath: string): string {
  return path.relative(root, filePath)
}

// ---------------------------------------------------------------------------
// Book code blocks
// ---------------------------------------------------------------------------

describe('round-trip — book examples', () => {
  for (const filePath of collectFiles(path.join(root, 'book'), '.md')) {
    const markdown = fs.readFileSync(filePath, 'utf-8')
    const blocks = extractCodeBlocks(markdown)
    blocks.forEach((block, i) => {
      it(`${rel(filePath)} block ${i + 1}`, () => {
        const code = block.lines.join('\n').trimEnd()
        expect(format(code).trimEnd()).toBe(code)
      })
    })
  }
})

// ---------------------------------------------------------------------------
// Feature card code blocks
// ---------------------------------------------------------------------------

describe('round-trip — feature card examples', () => {
  for (const filePath of collectFiles(path.join(root, 'playground-www/src/featureCards'), '.md')) {
    const markdown = fs.readFileSync(filePath, 'utf-8')
    const blocks = extractCodeBlocks(markdown)
    blocks.forEach((block, i) => {
      it(`${rel(filePath)} block ${i + 1}`, () => {
        const code = block.lines.join('\n').trimEnd()
        expect(format(code).trimEnd()).toBe(code)
      })
    })
  }
})

// ---------------------------------------------------------------------------
// All .dvala files in the repo (auto-discovered)
// ---------------------------------------------------------------------------

// Directories excluded from .dvala round-trip testing (generated/temp content).
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'build', '.tmp-cli-test', '.wireit', 'coverage', 'test-results', '.cache'])

function collectDvalaFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...collectDvalaFiles(fullPath))
    else if (entry.name.endsWith('.dvala') && !entry.name.includes('.fixture.')) results.push(fullPath)
  }
  return results.sort()
}

describe('round-trip — all .dvala files', { timeout: BUILTIN_MODULE_ROUNDTRIP_TIMEOUT_MS }, () => {
  for (const filePath of collectDvalaFiles(root)) {
    it(rel(filePath), () => {
      const code = fs.readFileSync(filePath, 'utf-8').trimEnd()
      expect(format(code).trimEnd()).toBe(code)
    })
  }
})
