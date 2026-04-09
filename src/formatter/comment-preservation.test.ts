import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { format } from './format'

// Extract all block comments matching /* N */ from a string
function extractCommentNumbers(source: string): number[] {
  const re = /\/\*\s*(\d+)\s*\*\//g
  const numbers: number[] = []
  let match
  while ((match = re.exec(source)) !== null) {
    numbers.push(Number(match[1]))
  }
  return numbers
}

describe('comment preservation', () => {
  const fixturePath = resolve(__dirname, 'comment-preservation.fixture.dvala')
  const fixture = readFileSync(fixturePath, 'utf8')
  const inputComments = extractCommentNumbers(fixture)

  it('fixture has comments', () => {
    expect(inputComments.length).toBeGreaterThan(2000)
  })

  it('formatting preserves all block comments', () => {
    const formatted = format(fixture)
    const outputComments = extractCommentNumbers(formatted)
    const outputSet = new Set(outputComments)

    // No comments dropped
    const missing = inputComments.filter(n => !outputSet.has(n))
    if (missing.length > 0) {
      expect.fail(
        `${missing.length} of ${inputComments.length} comments were dropped. ` +
        `First missing: ${missing.slice(0, 10).join(', ')}`,
      )
    }

    // No comments duplicated
    if (outputComments.length !== inputComments.length) {
      const counts = new Map<number, number>()
      for (const n of outputComments) counts.set(n, (counts.get(n) ?? 0) + 1)
      const dupes = [...counts.entries()].filter(([, c]) => c > 1).map(([n, c]) => `/* ${n} */ ×${c}`)
      expect.fail(
        `${outputComments.length - inputComments.length} duplicate comments in output. ` +
        `Duplicates: ${dupes.slice(0, 10).join(', ')}`,
      )
    }
  })
})
