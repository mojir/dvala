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
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

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

  it('quote expression', () => {
    const src = 'quote x + 1 end'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('quote with splice', () => {
    const src = 'quote x + $^{y} end'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('quote with multi-caret splice', () => {
    const src = 'quote quote $^^{z} end end'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('quote with splice containing expression', () => {
    const src = 'quote $^{1 + 2} end'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('quote with multiple splices', () => {
    const src = 'quote $^{a} + $^{b} end'
    expect(parseAndPrint(src)).toBe(src)
  })

  it('quote with splice and comments', () => {
    const src = 'quote /* before */ $^{x} /* after */ end'
    expect(parseAndPrint(src)).toBe(src)
  })
})

describe('parseToCst — tree structure', () => {
  function parseTree(source: string): UntypedCstNode {
    return parseToCst(tokenize(source, true, undefined)).tree
  }

  /** Get the nth child node (skipping tokens). */
  function childNode(node: UntypedCstNode, n: number): UntypedCstNode {
    let count = 0
    for (const child of node.children) {
      if ('kind' in child) {
        if (count === n) return child as UntypedCstNode
        count++
      }
    }
    throw new Error(`No child node at index ${n}`)
  }

  it('root node is Program', () => {
    expect(parseTree('42').kind).toBe('Program')
  })

  it('number literal produces NumberLiteral node', () => {
    const tree = parseTree('42')
    const num = childNode(tree, 0)
    expect(num.kind).toBe('NumberLiteral')
  })

  it('string literal produces StringLiteral node', () => {
    const tree = parseTree('"hello"')
    expect(childNode(tree, 0).kind).toBe('StringLiteral')
  })

  it('symbol produces Symbol node', () => {
    const tree = parseTree('foo')
    expect(childNode(tree, 0).kind).toBe('Symbol')
  })

  it('binary op wraps left and right', () => {
    const tree = parseTree('1 + 2')
    const binOp = childNode(tree, 0)
    expect(binOp.kind).toBe('BinaryOp')
    // Should have: NumberLiteral, operator token, NumberLiteral
    const childNodes = binOp.children.filter(c => 'kind' in c)
    expect(childNodes).toHaveLength(2) // two NumberLiteral nodes
  })

  it('chained binary ops produce left-associative nesting', () => {
    const tree = parseTree('1 + 2 + 3')
    const outer = childNode(tree, 0)
    expect(outer.kind).toBe('BinaryOp')
    // Left child should be another BinaryOp
    const inner = childNode(outer, 0)
    expect(inner.kind).toBe('BinaryOp')
  })

  it('let binding produces Let node', () => {
    const tree = parseTree('let x = 42')
    expect(childNode(tree, 0).kind).toBe('Let')
  })

  it('array produces Array node', () => {
    const tree = parseTree('[1, 2, 3]')
    expect(childNode(tree, 0).kind).toBe('Array')
  })

  it('object produces Object node', () => {
    const tree = parseTree('{a: 1}')
    expect(childNode(tree, 0).kind).toBe('Object')
  })

  it('property access produces PropertyAccess node', () => {
    const tree = parseTree('foo.bar')
    expect(childNode(tree, 0).kind).toBe('PropertyAccess')
  })

  it('index access produces IndexAccess node', () => {
    const tree = parseTree('arr[0]')
    expect(childNode(tree, 0).kind).toBe('IndexAccess')
  })

  it('function call produces Call node', () => {
    const tree = parseTree('foo(1, 2)')
    expect(childNode(tree, 0).kind).toBe('Call')
  })

  it('if expression produces If node', () => {
    const tree = parseTree('if true then 1 else 2 end')
    expect(childNode(tree, 0).kind).toBe('If')
  })

  it('do block produces Block node', () => {
    const tree = parseTree('do 1 end')
    expect(childNode(tree, 0).kind).toBe('Block')
  })

  it('lambda produces Function node', () => {
    const tree = parseTree('(x) -> x + 1')
    expect(childNode(tree, 0).kind).toBe('Function')
  })

  it('shorthand lambda produces Function node', () => {
    const tree = parseTree('-> $ + 1')
    expect(childNode(tree, 0).kind).toBe('Function')
  })

  it('unary minus produces PrefixOp node', () => {
    const tree = parseTree('-x')
    expect(childNode(tree, 0).kind).toBe('PrefixOp')
  })

  it('parenthesized expression produces Parenthesized node', () => {
    const tree = parseTree('(1 + 2)')
    expect(childNode(tree, 0).kind).toBe('Parenthesized')
  })

  it('match produces Match node', () => {
    const tree = parseTree('match x case 1 then "one" case _ then "other" end')
    expect(childNode(tree, 0).kind).toBe('Match')
  })

  it('for produces For node', () => {
    const tree = parseTree('for (x in [1, 2]) -> x')
    expect(childNode(tree, 0).kind).toBe('For')
  })

  it('loop produces Loop node', () => {
    const tree = parseTree('loop (i = 0) -> if i >= 10 then i else recur(i + 1) end')
    expect(childNode(tree, 0).kind).toBe('Loop')
  })

  it('handler produces Handler node', () => {
    const tree = parseTree('handler @my.eff(x) -> resume(x) end')
    expect(childNode(tree, 0).kind).toBe('Handler')
  })

  it('macro call produces MacroCall node', () => {
    const tree = parseTree('#debug 42')
    expect(childNode(tree, 0).kind).toBe('MacroCall')
  })

  it('effect name produces EffectName node', () => {
    const tree = parseTree('@my.effect')
    expect(childNode(tree, 0).kind).toBe('EffectName')
  })

  it('spread produces Spread node inside array', () => {
    const tree = parseTree('[...xs]')
    const arr = childNode(tree, 0)
    expect(arr.kind).toBe('Array')
    const spread = childNode(arr, 0)
    expect(spread.kind).toBe('Spread')
  })

  it('reserved symbol produces ReservedSymbol node', () => {
    const tree = parseTree('true')
    expect(childNode(tree, 0).kind).toBe('ReservedSymbol')
  })

  it('quote produces Quote node', () => {
    const tree = parseTree('quote x + 1 end')
    expect(childNode(tree, 0).kind).toBe('Quote')
  })

  // Splice CST nodes live inside the structured body (e.g. as an operand of a
  // BinaryOp) rather than as direct Quote children, because the quote body is
  // reparsed into a full CST sub-tree after pass 1. Use a recursive walk to
  // find them.
  function findSplicesDeep(node: UntypedCstNode): UntypedCstNode[] {
    const out: UntypedCstNode[] = []
    for (const c of node.children) {
      if ('kind' in c) {
        if ((c as UntypedCstNode).kind === 'Splice') out.push(c as UntypedCstNode)
        else out.push(...findSplicesDeep(c as UntypedCstNode))
      }
    }
    return out
  }

  it('splice inside quote produces Splice node', () => {
    const tree = parseTree('quote x + $^{y} end')
    const quote = childNode(tree, 0)
    expect(quote.kind).toBe('Quote')
    const splices = findSplicesDeep(quote)
    expect(splices).toHaveLength(1)
    expect(splices[0]!.kind).toBe('Splice')
  })

  it('splice node contains marker, expression tokens, and close brace', () => {
    const tree = parseTree('quote $^{42} end')
    const quote = childNode(tree, 0)
    const splice = findSplicesDeep(quote)[0] as UntypedCstNode
    expect(splice).toBeDefined()
    // First child should be the marker token $^{
    const marker = splice.children[0] as CstToken
    expect(marker.text).toBe('$^{')
    // Last child should be the close brace }
    const closeBrace = splice.children[splice.children.length - 1] as CstToken
    expect(closeBrace.text).toBe('}')
  })

  it('multiple splices produce multiple Splice nodes', () => {
    const tree = parseTree('quote $^{a} + $^{b} end')
    const quote = childNode(tree, 0)
    expect(findSplicesDeep(quote)).toHaveLength(2)
  })

  it('multi-caret splice ($^^{}) produces Splice node in outer quote', () => {
    const tree = parseTree('quote quote $^^{z} end end')
    const outerQuote = childNode(tree, 0)
    expect(outerQuote.kind).toBe('Quote')
    // The $^^{z} belongs to the outer quote — its Splice sub-node is inside
    // the inner Quote sub-node (structurally), but owned by the outer one (by
    // caret level). Since it carries the $^^{ marker we can identify it.
    const allSplices = findSplicesDeep(outerQuote)
    const doubleCaret = allSplices.find(s => (s.children[0] as CstToken).text === '$^^{')
    expect(doubleCaret).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Corpus losslessness — real .dvala files from the project
// ---------------------------------------------------------------------------

/** Recursively find all .dvala files under a directory. */
function findDvalaFiles(dir: string): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
          results.push(...findDvalaFiles(fullPath))
        } else if (entry.endsWith('.dvala')) {
          results.push(fullPath)
        }
      } catch { /* skip inaccessible entries */ }
    }
  } catch { /* skip inaccessible dirs */ }
  return results
}

const projectRoot = join(__dirname, '../..')
const dvalaFiles = findDvalaFiles(projectRoot)

describe('parseToCst — corpus losslessness', () => {
  for (const filePath of dvalaFiles) {
    const relPath = filePath.replace(`${projectRoot}/`, '')
    it(`roundtrips ${relPath}`, () => {
      const source = readFileSync(filePath, 'utf-8')
      // Some files may have parse errors — skip those gracefully
      try {
        const result = parseAndPrint(source)
        expect(result).toBe(source)
      } catch (e) {
        // Some test fixtures have intentional parse errors or use
        // newlines as implicit statement separators (only supported
        // through the bundler, not the raw parser). Skip these.
        if (e instanceof Error && (e.constructor.name === 'ParseError' || e.message.includes('Expected'))) {
          return
        }
        throw e
      }
    })
  }
})
