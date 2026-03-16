/**
 * End-to-end tests for the Dvala Playground.
 *
 * These tests exercise the playground's core logic layers:
 *  1. StateHistory – undo/redo history management
 *  2. Playground workflows – the same Dvala operations the playground performs
 *     (run, analyze, tokenize, parse, format) with context bindings
 *  3. State encoding – shareable URL state round-trip
 *  4. Example loading – all built-in examples parse and run without errors
 *
 * The tests are intentionally decoupled from DOM structure so they remain
 * stable as the playground UI evolves.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import type { RunResult } from '../src/evaluator/effectTypes'
import { allBuiltinModules } from '../src/allModules'
import { getAutoCompleter, getUndefinedSymbols, parseTokenStream, tokenizeSource, untokenize } from '../src/tooling'
import { StateHistory } from '../playground-www/src/StateHistory'
import type { HistoryEntry, HistoryStatus } from '../playground-www/src/StateHistory'
import { stringifyValue } from '../common/utils'
import { examples } from '../reference/examples'

// ---------------------------------------------------------------------------
// Helpers – mirror the playground's own patterns
// ---------------------------------------------------------------------------

function makePlaygroundDvala(debug = false) {
  return createDvala({ debug, modules: allBuiltinModules })
}

function runValue(result: RunResult): unknown {
  if (result.type !== 'completed')
    throw new Error(`Expected completed result, got ${result.type}`)
  return result.value
}

/** Parse a JSON context string just like the playground does. */
function parseContext(contextJson: string): { bindings?: Record<string, unknown> } {
  if (!contextJson.trim())
    return {}

  const parsed = JSON.parse(contextJson) as Record<string, unknown>
  return {
    bindings: (parsed.bindings ?? {}) as Record<string, unknown>,
  }
}

// ---------------------------------------------------------------------------
// 1. StateHistory
// ---------------------------------------------------------------------------

describe('stateHistory', () => {
  function entry(text: string, start = 0, end = 0): HistoryEntry {
    return { text, selectionStart: start, selectionEnd: end }
  }

  function createHistory(initial: HistoryEntry) {
    let lastStatus: HistoryStatus = { canUndo: false, canRedo: false }
    const history = new StateHistory(initial, s => {
      lastStatus = s
    })
    return { history, getStatus: () => lastStatus }
  }

  it('starts with initial entry and cannot undo/redo', () => {
    const { history } = createHistory(entry('hello'))
    expect(history.peek().text).toBe('hello')
    expect(() => history.undo()).toThrow()
    expect(() => history.redo()).toThrow()
  })

  it('supports push, undo, and redo', async () => {
    const { history, getStatus } = createHistory(entry('a'))
    history.push(entry('b'))
    history.push(entry('c'))

    // Wait for status notification (setTimeout)
    await new Promise(r => setTimeout(r, 10))
    expect(getStatus().canUndo).toBe(true)
    expect(getStatus().canRedo).toBe(false)

    expect(history.undo().text).toBe('b')
    expect(history.undo().text).toBe('a')
    expect(() => history.undo()).toThrow()

    await new Promise(r => setTimeout(r, 10))
    expect(getStatus().canRedo).toBe(true)

    expect(history.redo().text).toBe('b')
    expect(history.redo().text).toBe('c')
    expect(() => history.redo()).toThrow()
  })

  it('truncates future on new push after undo', () => {
    const { history } = createHistory(entry('a'))
    history.push(entry('b'))
    history.push(entry('c'))

    history.undo() // -> b
    history.push(entry('d'))

    expect(history.peek().text).toBe('d')
    expect(() => history.redo()).toThrow()
    expect(history.undo().text).toBe('b')
  })

  it('replaces current entry when text is identical', () => {
    const { history } = createHistory(entry('a', 0, 0))
    // Same text, different selection – should replace, not push
    history.push(entry('a', 3, 5))
    expect(history.peek().selectionStart).toBe(3)
    // Still only one entry, so undo should throw
    expect(() => history.undo()).toThrow()
  })

  it('reset clears all history', () => {
    const { history } = createHistory(entry('a'))
    history.push(entry('b'))
    history.push(entry('c'))

    history.reset(entry('fresh'))
    expect(history.peek().text).toBe('fresh')
    expect(() => history.undo()).toThrow()
    expect(() => history.redo()).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 2. Playground workflows – run / analyze / tokenize / parse / format
// ---------------------------------------------------------------------------

describe('playground workflows', () => {
  const dvala = makePlaygroundDvala()

  describe('run', () => {
    it('evaluates simple arithmetic', async () => {
      const result = runValue(await dvala.runAsync('10 + 20'))
      expect(result).toBe(30)
    })

    it('evaluates with context bindings', async () => {
      const result = runValue(await dvala.runAsync('x + y', { bindings: { x: 15, y: 27 } }))
      expect(result).toBe(42)
    })

    it('evaluates complex expressions', async () => {
      const result = runValue(await dvala.runAsync('((a, b) -> a + b)(3, 4)'))
      expect(result).toBe(7)
    })

    it('evaluates let expressions', async () => {
      const result = runValue(await dvala.runAsync('let x = 10; let y = 20; x + y'))
      expect(result).toBe(30)
    })

    it('supports array operations', async () => {
      const result = runValue(await dvala.runAsync('map([1, 2, 3], -> $ * $)'))
      expect(result).toEqual([1, 4, 9])
    })

    it('supports object access', async () => {
      const result = runValue(await dvala.runAsync('{a: 1, b: 2, c: 3}.b'))
      expect(result).toBe(2)
    })

    it('formats output using stringifyValue', async () => {
      const result = runValue(await dvala.runAsync('"hello world"'))
      expect(stringifyValue(result, false)).toBe('"hello world"')
    })

    it('returns error result on invalid code', async () => {
      const result = await dvala.runAsync('(+ 1')
      expect(result.type).toBe('error')
    })
  })

  describe('analyze (getUndefinedSymbols)', () => {
    it('returns empty set for fully-resolved code', () => {
      const result = getUndefinedSymbols('10 + 20')
      expect(result.size).toBe(0)
    })

    it('detects undefined symbols', () => {
      const result = getUndefinedSymbols('x + y')
      expect(result.has('x')).toBe(true)
      expect(result.has('y')).toBe(true)
    })

    it('resolves symbols provided via bindings', () => {
      const result = getUndefinedSymbols('x + y', { bindings: { x: 1, y: 2 } })
      expect(result.size).toBe(0)
    })

    it('resolves symbols defined with let', () => {
      const result = getUndefinedSymbols('let z = 5; z + 1')
      expect(result.size).toBe(0)
    })
  })

  describe('tokenize', () => {
    it('produces tokens for valid code', () => {
      const tokenStream = tokenizeSource('10 + 20')
      expect(tokenStream.tokens.length).toBeGreaterThan(0)
    })

    it('includes expected token types', () => {
      const tokenStream = tokenizeSource('let x = 42')
      const types = tokenStream.tokens.map(t => t[0])
      expect(types).toContain('Symbol')
      expect(types).toContain('Number')
    })
  })

  describe('parse', () => {
    it('produces an AST from tokens', () => {
      const ast = parseTokenStream(tokenizeSource('10 + 20'))
      expect(ast.body).toBeDefined()
      expect(ast.body.length).toBeGreaterThan(0)
    })

    it('round-trips tokenize → parse → evaluate', async () => {
      const code = 'let x = 5; x * x'
      const ast = parseTokenStream(tokenizeSource(code))
      expect(ast.body.length).toBeGreaterThan(0)

      // Verify the same code evaluates correctly
      const result = runValue(await dvala.runAsync(code))
      expect(result).toBe(25)
    })
  })

  describe('format (untokenize)', () => {
    it('round-trips code through tokenize → untokenize', () => {
      const code = '(+ 1 2)'
      const formatted = untokenize(tokenizeSource(code))
      expect(formatted.trim()).toBe(code)
    })

    it('preserves semantics after formatting', async () => {
      const code = 'let x = 10;   let y = 20;   x   +   y'
      const formatted = untokenize(tokenizeSource(code))

      const original = runValue(await dvala.runAsync(code))
      const reformatted = runValue(await dvala.runAsync(formatted))
      expect(reformatted).toBe(original)
    })
  })
})

// ---------------------------------------------------------------------------
// 3. State encoding round-trip
// ---------------------------------------------------------------------------

describe('state encoding', () => {
  // Mirror the playground's encodeState / applyEncodedState logic
  function encodeState(dvalaCode: string, context: string): string {
    const sharedState = { 'dvala-code': dvalaCode, context }
    return btoa(encodeURIComponent(JSON.stringify(sharedState)))
  }

  function decodeState(encoded: string): { 'dvala-code': string; 'context': string } {
    return JSON.parse(decodeURIComponent(atob(encoded))) as { 'dvala-code': string; 'context': string }
  }

  it('round-trips code and context', () => {
    const code = 'x + y'
    const context = '{"bindings": {"x": 1, "y": 2}}'
    const encoded = encodeState(code, context)
    const decoded = decodeState(encoded)
    expect(decoded['dvala-code']).toBe(code)
    expect(decoded.context).toBe(context)
  })

  it('handles empty values', () => {
    const encoded = encodeState('', '')
    const decoded = decodeState(encoded)
    expect(decoded['dvala-code']).toBe('')
    expect(decoded.context).toBe('')
  })

  it('handles unicode in code', () => {
    const code = 'let π = 3.14; π'
    const encoded = encodeState(code, '')
    const decoded = decodeState(encoded)
    expect(decoded['dvala-code']).toBe(code)
  })
})

// ---------------------------------------------------------------------------
// 4. Built-in examples – every example should parse and run without errors
// ---------------------------------------------------------------------------

describe('built-in examples', () => {
  const dvala = makePlaygroundDvala()

  it('has examples defined', () => {
    expect(examples.length).toBeGreaterThan(0)
  })

  // Examples that require host handlers or use unsupported effects in Node
  const skipIds = new Set(['async-interactive', 'text-based-game', 'matrix-multiplication'])

  const parseableExamples = examples.filter(e => !skipIds.has(e.id))

  for (const example of parseableExamples) {
    it(`tokenizes and parses: ${example.name}`, () => {
      const ast = parseTokenStream(tokenizeSource(example.code))
      expect(ast.body.length).toBeGreaterThan(0)
    })
  }
  const runnableExamples = examples.filter(
    e => !skipIds.has(e.id)
      && (!e.context?.effectHandlers || Object.keys(e.context.effectHandlers).length === 0),
  )

  for (const example of runnableExamples) {
    it(`runs without error: ${example.name}`, async () => {
      const result = await dvala.runAsync(example.code, { bindings: example.context?.bindings })
      expect(result.type).not.toBe('error')
    })
  }
})

// ---------------------------------------------------------------------------
// 5. Context parsing – mirrors playground's getDvalaParamsFromContext
// ---------------------------------------------------------------------------

describe('context parsing', () => {
  it('parses empty string as empty params', () => {
    expect(parseContext('')).toEqual({})
  })

  it('parses bindings from JSON', () => {
    const ctx = parseContext('{"bindings": {"x": 42, "name": "test"}}')
    expect(ctx.bindings).toEqual({ x: 42, name: 'test' })
  })

  it('handles missing bindings key', () => {
    const ctx = parseContext('{}')
    expect(ctx.bindings).toEqual({})
  })

  it('uses bindings in evaluation', async () => {
    const dvala = makePlaygroundDvala()
    const contextJson = '{"bindings": {"items": [1, 2, 3, 4, 5]}}'
    const params = parseContext(contextJson)
    const result = runValue(await dvala.runAsync('reduce(items, +, 0)', { bindings: params.bindings }))
    expect(result).toBe(15)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseContext('not valid json')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 6. AutoCompleter – playground's Alt+Space feature
// ---------------------------------------------------------------------------

describe('autoCompleter', () => {
  it('provides suggestions for partial input', () => {
    const completer = getAutoCompleter('ma', 2)
    const suggestion = completer.getNextSuggestion()
    expect(suggestion).not.toBeNull()
    expect(suggestion!.program.length).toBeGreaterThan(0)
  })

  it('cycles through suggestions', () => {
    const completer = getAutoCompleter('fi', 2)
    const first = completer.getNextSuggestion()
    const second = completer.getNextSuggestion()
    // Should provide at least one suggestion
    expect(first).not.toBeNull()
    // May cycle or provide different suggestions
    if (second) {
      expect(second.program).toBeDefined()
    }
  })

  it('returns original state on no match', () => {
    const code = 'xyzzyNotAFunction'
    const completer = getAutoCompleter(code, code.length)
    // If no match, suggestion may be null or return something
    // The key is it doesn't crash
    expect(() => completer.getNextSuggestion()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 7. Start page example.dvala
// ---------------------------------------------------------------------------

describe('start page example', () => {
  const dvala = makePlaygroundDvala()
  const exampleCode = readFileSync(
    join(__dirname, '../playground-www/src/startPageExample.dvala'),
    'utf-8',
  )

  it('runs with mocked io effect handlers', async () => {
    let printlnValue: unknown
    const result = await dvala.runAsync(exampleCode, {
      effectHandlers: [
        { pattern: 'dvala.io.pick', handler: ctx => { ctx.resume(1) } },
        { pattern: 'dvala.io.println', handler: ctx => { printlnValue = ctx.args[0]; ctx.resume(ctx.args[0] ?? null) } },
      ],
    })
    expect(result.type).toBe('completed')
    expect(printlnValue).toBe('Total: $47.67 (You saved $5.3)')
  })
})
