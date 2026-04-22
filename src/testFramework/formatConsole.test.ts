import { describe, expect, it } from 'vitest'
import { DvalaError } from '../errors'
import { formatConsole } from './formatConsole'
import type { TestRunResult } from './result'

// eslint-disable-next-line no-control-regex
const ansiRe = /\x1B\[[0-9;]*m/g

function stripAnsi(s: string): string {
  return s.replace(ansiRe, '')
}

function makeRun(overrides: Partial<TestRunResult> = {}): TestRunResult {
  return {
    filePath: '/path/to/file.test.dvala',
    results: [],
    durationMs: 12.5,
    ...overrides,
  }
}

describe('formatConsole', () => {
  it('reports an empty test file as success', () => {
    const { text, success } = formatConsole(makeRun(), { color: false })
    expect(success).toBe(true)
    // Header with filePath and duration
    expect(text).toContain('/path/to/file.test.dvala')
    expect(text).toContain('(0.013s)')
    // Summary line with total count
    expect(text).toContain('(0)')
  })

  it('omits ansi codes when color is false', () => {
    const { text } = formatConsole(makeRun({
      results: [{ name: 'a > passes', status: 'passed', durationMs: 1 }],
    }), { color: false })
    expect(text).not.toMatch(ansiRe)
  })

  it('emits ansi codes by default (color on)', () => {
    const { text } = formatConsole(makeRun({
      results: [{ name: 'passes', status: 'passed', durationMs: 1 }],
    }))
    expect(text).toMatch(ansiRe)
  })

  it('hides passed tests by default, but shows them when verbose', () => {
    const results: TestRunResult['results'] = [
      { name: 'suite > passes', status: 'passed', durationMs: 1 },
    ]
    const quiet = stripAnsi(formatConsole(makeRun({ results }), { color: false }).text)
    expect(quiet).not.toContain('passes')
    expect(quiet).toContain('1 passed')

    const verbose = stripAnsi(formatConsole(makeRun({ results }), { color: false, verbose: true }).text)
    expect(verbose).toContain('passes')
    expect(verbose).toContain('suite')
    // Verbose shows a pass marker
    expect(verbose).toMatch(/✓ passes/)
  })

  it('renders skipped tests with optional reason', () => {
    const results: TestRunResult['results'] = [
      { name: 'suite > a', status: 'skipped' },
      { name: 'suite > b', status: 'skipped', reason: 'not matching' },
    ]
    const text = stripAnsi(formatConsole(makeRun({ results }), { color: false }).text)
    expect(text).toMatch(/○ a/)
    expect(text).toMatch(/○ b \(not matching\)/)
    expect(text).toContain('2 skipped')
  })

  it('renders a failed test with plain Error detail', () => {
    const results: TestRunResult['results'] = [
      { name: 'math > adds', status: 'failed', error: new Error('boom'), durationMs: 3 },
    ]
    const { text, success } = formatConsole(makeRun({ results }), { color: false })
    expect(success).toBe(false)
    const plain = stripAnsi(text)
    expect(plain).toMatch(/✗ adds/)
    expect(plain).toContain('boom')
    expect(plain).toContain('1 failed')
  })

  it('renders a DvalaError with source code info (location, code, marker)', () => {
    const err = new DvalaError('bad stuff', {
      position: { line: 3, column: 7 },
      code: 'let x = 42',
      filePath: '/tmp/foo.dvala',
    })
    const results: TestRunResult['results'] = [
      { name: 'adds', status: 'failed', error: err, durationMs: 2 },
    ]
    const text = stripAnsi(formatConsole(makeRun({ results }), { color: false }).text)
    expect(text).toContain('bad stuff')
    // Location line includes path and line:column
    expect(text).toContain('at /tmp/foo.dvala:3:7')
    // Inline source snippet
    expect(text).toContain('let x = 42')
  })

  it('shows BAIL OUT and marks failure when a bailout is present', () => {
    const { text, success } = formatConsole(makeRun({
      bailout: new Error('parse failed'),
      results: [],
    }), { color: false })
    expect(success).toBe(false)
    expect(text).toContain('BAIL OUT')
    expect(text).toContain('parse failed')
  })

  it('bailout message handles DvalaError via shortMessage', () => {
    const err = new DvalaError('tokenizer blew up', {
      position: { line: 1, column: 1 },
      code: '@@',
    })
    const { text } = formatConsole(makeRun({ bailout: err, results: [] }), { color: false })
    expect(text).toContain('tokenizer blew up')
  })

  it('omits the duration segment when durationMs is missing', () => {
    const { text } = formatConsole(makeRun({ durationMs: undefined }), { color: false })
    // No trailing "(Xs)" duration marker
    expect(text).not.toMatch(/\(\d+\.\d+s\)/)
  })

  it('produces a mixed summary line with passed, failed, and skipped counts', () => {
    const results: TestRunResult['results'] = [
      { name: 'a', status: 'passed', durationMs: 1 },
      { name: 'b', status: 'failed', error: new Error('nope'), durationMs: 1 },
      { name: 'c', status: 'skipped' },
    ]
    const text = stripAnsi(formatConsole(makeRun({ results }), { color: false }).text)
    expect(text).toContain('1 passed')
    expect(text).toContain('1 failed')
    expect(text).toContain('1 skipped')
    expect(text).toContain('(3)')
  })

  it('handles a DvalaError without sourceCodeInfo (no location line)', () => {
    const err = new DvalaError('no info', undefined)
    const results: TestRunResult['results'] = [
      { name: 'x', status: 'failed', error: err, durationMs: 1 },
    ]
    const text = stripAnsi(formatConsole(makeRun({ results }), { color: false }).text)
    expect(text).toContain('no info')
    expect(text).not.toContain(' at ')
  })
})
