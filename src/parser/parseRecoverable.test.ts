import { describe, expect, it } from 'vitest'
import { parseRecoverable } from './index'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { NodeTypes } from '../constants/constants'

function parseR(source: string) {
  const tokens = tokenize(source, true, undefined)
  const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
  return parseRecoverable(minified)
}

describe('parseRecoverable', () => {
  it('parses a valid program identically to normal parse', () => {
    const result = parseR('let x = 1; let y = 2; x + y')
    expect(result.errors).toHaveLength(0)
    expect(result.body).toHaveLength(3)
    expect(result.body[0]![0]).toBe(NodeTypes.Let)
    expect(result.body[1]![0]).toBe(NodeTypes.Let)
  })

  it('recovers from a broken statement and parses the rest', () => {
    // Second statement has a syntax error, first and third are valid
    const result = parseR('let x = 1; let y = ; let z = 3; z')
    expect(result.errors.length).toBeGreaterThan(0)
    // Should have parsed the valid statements (x and z)
    expect(result.body.length).toBeGreaterThanOrEqual(2)
    // First node should be the valid `let x = 1`
    expect(result.body[0]![0]).toBe(NodeTypes.Let)
  })

  it('recovers from multiple broken statements', () => {
    const result = parseR('let a = 1; !!!; let b = 2; @@@; let c = 3')
    expect(result.errors.length).toBeGreaterThan(0)
    // Should recover at least the valid let statements
    const letNodes = result.body.filter(n => n[0] === NodeTypes.Let)
    expect(letNodes.length).toBeGreaterThanOrEqual(2)
  })

  it('returns errors with source position info', () => {
    const result = parseR('let x = 1; let y = ; let z = 3')
    expect(result.errors.length).toBeGreaterThan(0)
    // Each error should have source code info
    for (const err of result.errors) {
      expect(err.sourceCodeInfo).toBeDefined()
    }
  })

  it('returns empty body and errors for a completely broken program', () => {
    const result = parseR('!!!')
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.body).toHaveLength(0)
  })

  it('reports error for missing end delimiter (known limitation: cascades)', () => {
    // Missing `end` causes the parser to consume past the semicolon looking for the
    // closing delimiter. This is a known limitation — the error is reported but
    // subsequent statements may be consumed by the unclosed construct.
    const result = parseR('let x = if true then 1; let y = 2')
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('produces a valid source map for recovered statements', () => {
    const result = parseR('let x = 1; let y = ; let z = 3')
    expect(result.sourceMap).toBeDefined()
    // The source map should have positions for the successfully parsed nodes
    expect(result.sourceMap!.positions.size).toBeGreaterThan(0)
  })

  it('handles tokenizer errors as diagnostics', () => {
    // Unterminated string produces a tokenizer error
    const result = parseR('"hello')
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('handles empty input', () => {
    const result = parseR('')
    expect(result.errors).toHaveLength(0)
    expect(result.body).toHaveLength(0)
  })

  it('recovers after unmatched parenthesis', () => {
    const result = parseR('let x = (1 + ; let y = 2; y')
    expect(result.errors.length).toBeGreaterThan(0)
    // Should recover and parse `let y = 2` and `y`
    expect(result.body.length).toBeGreaterThanOrEqual(1)
  })
})
