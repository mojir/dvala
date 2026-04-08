/**
 * Tests for parseToCst() — verifies that the parser in CST mode
 * produces an untyped tree whose tokens, when concatenated with trivia,
 * reproduce the original source exactly (losslessness).
 */
import { describe, expect, it } from 'vitest'
import { tokenize } from '../tokenizer/tokenize'
import { parseToCst } from '../parser'
import type { UntypedCstNode } from './builder'
import type { CstToken, TriviaNode } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function triviaText(trivia: TriviaNode[]): string {
  return trivia.map(t => t.text).join('')
}

function tokenText(token: CstToken): string {
  return triviaText(token.leadingTrivia) + token.text + triviaText(token.trailingTrivia)
}

/** Collect all CstTokens from an untyped CST tree in document order. */
function collectAllTokens(node: UntypedCstNode): CstToken[] {
  const tokens: CstToken[] = []
  for (const child of node.children) {
    if ('kind' in child) {
      tokens.push(...collectAllTokens(child as UntypedCstNode))
    } else {
      // It's a CstToken
      tokens.push(child as CstToken)
    }
  }
  return tokens
}

/** Reconstruct source from untyped tree tokens + trailing trivia. */
function printUntypedTree(tree: UntypedCstNode, trailingTrivia: TriviaNode[]): string {
  const tokens = collectAllTokens(tree)
  let output = ''
  for (const token of tokens) {
    output += tokenText(token)
  }
  output += triviaText(trailingTrivia)
  return output
}

function parseAndPrint(source: string): string {
  const fullTokenStream = tokenize(source, true, undefined)
  const { tree, trailingTrivia } = parseToCst(fullTokenStream)
  return printUntypedTree(tree, trailingTrivia)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseToCst — losslessness', () => {
  it('simple number', () => {
    expect(parseAndPrint('42')).toBe('42')
  })

  it('number with trailing newline', () => {
    expect(parseAndPrint('42\n')).toBe('42\n')
  })

  it('two statements', () => {
    expect(parseAndPrint('1; 2')).toBe('1; 2')
  })

  it('let binding', () => {
    expect(parseAndPrint('let x = 42')).toBe('let x = 42')
  })

  it('binary expression', () => {
    expect(parseAndPrint('1 + 2')).toBe('1 + 2')
  })

  it('function call', () => {
    expect(parseAndPrint('foo(1, 2)')).toBe('foo(1, 2)')
  })

  it('array literal', () => {
    expect(parseAndPrint('[1, 2, 3]')).toBe('[1, 2, 3]')
  })

  it('object literal', () => {
    expect(parseAndPrint('{a: 1, b: 2}')).toBe('{a: 1, b: 2}')
  })

  it('if expression', () => {
    const src = 'if true then 1 else 2 end'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('preserves line comment', () => {
    const src = '// hello\n42'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('preserves trailing line comment', () => {
    const src = '42 // hello\n'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('preserves block comment', () => {
    const src = '/* hello */ 42'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('preserves inline block comment', () => {
    const src = 'foo(/* arg */ 42)'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('multiple statements with comments', () => {
    const src = 'let x = 1; // x\nlet y = 2 // y\n'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('preserves blank lines', () => {
    const src = 'let x = 1;\n\nlet y = 2\n'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('lambda expression', () => {
    const src = '(x, y) -> x + y'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('shorthand lambda', () => {
    const src = '-> $ + 1'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('pipe expression', () => {
    const src = '1 |> inc'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('do block', () => {
    const src = 'do\n  let x = 1;\n  x + 1\nend'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('match expression', () => {
    const src = 'match x case 1 then "one" case _ then "other" end'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('for expression', () => {
    const src = 'for (x in [1, 2, 3]) -> x * 2'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('loop expression', () => {
    const src = 'loop (i = 0) -> if i >= 10 then i else recur(i + 1) end'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('handler expression', () => {
    const src = 'handler @my.eff(x) -> resume(x * 2) end'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('property access', () => {
    const src = 'foo.bar.baz'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('index access', () => {
    const src = 'arr[0]'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('template string', () => {
    const src = '`hello ${name}`'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('spread in array', () => {
    const src = '[...xs, 1]'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('effect name', () => {
    const src = 'perform(@my.effect, 42)'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('complex multiline program', () => {
    const src = `// A small program
let greet = (name) -> "Hello, " ++ name;

// Use it
let result = greet("world");
result
`
    expect(parseAndPrint(src)).toBe(src)
  })

  it('preserves shebang', () => {
    const src = '#!/usr/bin/env dvala\n42\n'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('unary minus', () => {
    const src = '-42'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('nested parentheses', () => {
    const src = '((1 + 2) * 3)'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('infix function call', () => {
    const src = '"hello" ++ " world"'
    expect(parseAndPrint(src)).toBe(src)
  })
})

describe('parseToCst — tree structure', () => {
  it('root node is Program', () => {
    const fullTokenStream = tokenize('42', true, undefined)
    const { tree } = parseToCst(fullTokenStream)
    expect(tree.kind).toBe('Program')
  })

  it('program has token children', () => {
    const fullTokenStream = tokenize('42', true, undefined)
    const { tree } = parseToCst(fullTokenStream)
    // At this stage (before sub-parser instrumentation), all tokens are
    // direct children of Program — no nested nodes yet.
    expect(tree.children.length).toBeGreaterThan(0)
  })
})
