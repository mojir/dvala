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

  it('formatting preserves block comments', () => {
    const formatted = format(fixture)
    const outputSet = new Set(extractCommentNumbers(formatted))

    const missing = inputComments.filter(n => !outputSet.has(n))

    // All block comments must be preserved — zero tolerance for drops.
    if (missing.length > 0) {
      const sample = missing.slice(0, 10)
      expect.fail(
        `${missing.length} of ${inputComments.length} comments were dropped. ` +
        `First missing: ${sample.join(', ')}`,
      )
    }
  })
})
