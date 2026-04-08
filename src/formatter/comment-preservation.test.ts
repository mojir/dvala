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
    const preserved = inputComments.length - missing.length

    // Known baseline: 310 of 2616 comments are dropped.
    // Remaining drops: leading block comments before closing delimiters (`)`, `end`,
    // `else`) and between entries in deeply nested objects. These are in leading trivia
    // of tokens that containers handle at statement boundaries.
    // As we fix more formatters, tighten this threshold. Goal: 0 dropped.
    const maxAllowedDropped = 310

    if (missing.length > maxAllowedDropped) {
      const sample = missing.slice(0, 10)
      expect.fail(
        `Regression: ${missing.length} comments dropped (was ${maxAllowedDropped}). ` +
        `Preserved ${preserved} of ${inputComments.length}. ` +
        `First missing: ${sample.join(', ')}`,
      )
    }
  })
})
