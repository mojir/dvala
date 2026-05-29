import { describe, expect, it } from 'vitest'
import { tokenize } from '../tokenizer/tokenize'
import { attachTrivia, printTokens } from './attachTrivia'

/**
 * Losslessness property: attaching trivia to tokens and printing them back
 * must reproduce the original source exactly.
 */
function assertLossless(source: string): void {
  const { tokens } = tokenize(source, true, undefined)
  const result = attachTrivia(tokens)
  const printed = printTokens(result)
  expect(printed).toBe(source)
}

describe('attachTrivia', () => {
  describe('losslessness — printTokens(attachTrivia(tokenize(source))) === source', () => {
    it('empty source', () => assertLossless(''))

    it('single number', () => assertLossless('42'))

    it('simple expression', () => assertLossless('1 + 2'))

    it('let binding', () => assertLossless('let x = 42'))

    it('multiline statements', () => assertLossless('let x = 1\nlet y = 2'))

    it('semicolon-separated statements', () => assertLossless('let x = 1; let y = 2'))

    it('trailing newline', () => assertLossless('let x = 1\n'))

    it('multiple trailing newlines', () => assertLossless('let x = 1\n\n\n'))

    it('leading whitespace', () => assertLossless('  42'))

    it('leading newlines', () => assertLossless('\n\n42'))

    it('trailing line comment', () => assertLossless('let x = 1 // comment'))

    it('trailing line comment with newline', () => assertLossless('let x = 1 // comment\n'))

    it('leading line comment', () => assertLossless('// comment\nlet x = 1'))

    it('block comment inline', () => assertLossless('foo(/* note */ a, b)'))

    it('block comment trailing', () => assertLossless('let x = 1 /* inline */'))

    it('block comment on own line', () => assertLossless('/* standalone */\nlet x = 1'))

    it('multiple comments', () =>
      assertLossless('// header\n// another\nlet x = 1 // trailing\nlet y = 2\n// footer\n'))

    it('blank line between statements', () => assertLossless('let x = 1\n\nlet y = 2'))

    it('if expression', () => assertLossless('if true then 1 else 2 end'))

    it('multiline if', () => assertLossless('if x > 0 then\n  x\nelse\n  -x\nend'))

    it('array literal', () => assertLossless('[1, 2, 3]'))

    it('object literal', () => assertLossless('{a: 1, b: 2}'))

    it('function call', () => assertLossless('foo(a, b, c)'))

    it('pipe chain', () => assertLossless('x |> foo |> bar'))

    it('property access', () => assertLossless('obj.field.nested'))

    it('index access', () => assertLossless('arr[0]'))

    it('lambda', () => assertLossless('(x, y) -> x + y'))

    it('shorthand lambda', () => assertLossless('-> $ + 1'))

    it('do block', () => assertLossless('do\n  let x = 1;\n  x + 1\nend'))

    it('string with escapes', () => assertLossless('"hello\\nworld"'))

    it('template string', () => assertLossless('`hello ${name}`'))

    it('spread', () => assertLossless('[...xs, 4, 5]'))

    it('comment between args', () => assertLossless('filter(/* an array */ [a, b], pred)'))

    it('complex mixed whitespace', () => assertLossless('  // file header\n\nlet x = 1\n  \n// section\nlet y = 2\n'))

    it('shebang', () => assertLossless('#!/usr/bin/env dvala\nlet x = 1'))

    it('nested comments in blocks', () => assertLossless('do\n  // step 1\n  let x = 1;\n  // step 2\n  x + 1\nend'))

    it('match expression', () => assertLossless('match x\n  case 1 then "one"\n  case 2 then "two"\nend'))

    it('handler expression', () => assertLossless('handler\n  @my.eff(x) -> resume(x * 2)\nend'))

    it('tabs and mixed whitespace', () => assertLossless('\t\tlet x = 1'))

    it('only comments', () => assertLossless('// just a comment\n'))

    it('only block comment', () => assertLossless('/* block */'))

    it('adjacent block comments', () => assertLossless('/* a *//* b */'))

    it('comment after closing delimiter', () => assertLossless('[1, 2] // numbers'))

    it('macro prefix', () => assertLossless('#myMacro(1 + 2)'))

    it('effect names', () => assertLossless('perform(@dvala.io.print, "hello")'))

    it('infix operators', () => assertLossless('let result = a + b * c - d / e % f'))

    it('comparison and logical', () => assertLossless('if x > 0 && y < 10 || z == 0 then true else false end'))

    it('null coalesce', () => assertLossless('a ?? b ?? c'))

    it('string concat operator', () => assertLossless('"hello" ++ " " ++ "world"'))

    it('destructuring let', () => assertLossless('let [a, b, ...rest] = [1, 2, 3, 4, 5]'))

    it('object destructuring', () => assertLossless('let {name, age} = {name: "Alice", age: 30}'))

    it('computed object key', () => assertLossless('let key = "foo"; {[key]: 42}'))

    it('loop expression', () => assertLossless('loop (i = 0) -> if i >= 10 then i else recur(i + 1) end'))

    it('for expression', () => assertLossless('for (x in [1, 2, 3]) -> x * 2'))

    it('match expression with guards', () =>
      assertLossless('match x case n when n > 0 then "positive" case _ then "non-positive" end'))

    it('handler with transform', () =>
      assertLossless('handler @my.eff(x) -> resume(x * 2) transform result -> result + 1 end'))

    it('do with handler', () => assertLossless('do with myHandler; perform(@my.eff, 42) end'))

    it('import', () => assertLossless('let { test } = import("test")'))

    it('regex shorthand', () => assertLossless('#"^hello"i'))

    it('chained access and calls', () => assertLossless('obj.method(a, b).field[0]'))

    it('spread in args', () => assertLossless('foo(a, ...rest, b)'))

    it('shorthand object entries', () => assertLossless('{a, b, c: 3}'))

    it('multiline real-world code', () =>
      assertLossless(
        `let { test, describe } = import("test");
let { assertEqual } = import("assertion");

let add = (a, b) -> a + b;
let sub = (a, b) -> a - b;

describe("math", -> do
  test("add", -> assertEqual(add(1, 2), 3));

  describe("subtraction", -> do
    test("sub", -> assertEqual(sub(3, 1), 2));
  end);
end);
`,
      ))

    it('deeply nested with comments', () =>
      assertLossless(
        `// main program
let process = (items) -> do
  // filter valid items
  let valid = filter(items, -> $ > 0);
  // transform
  let result = for (x in valid) -> x * 2;
  result
end;

// entry point
process([1, -2, 3, -4, 5]) // run it
`,
      ))
  })

  describe('trivia attachment — split convention', () => {
    it('trailing comment attaches to previous token', () => {
      const { tokens: fullTokens } = tokenize('x // comment\ny', true, undefined)
      const { tokens } = attachTrivia(fullTokens)

      // Token "x" should have trailing trivia containing the comment
      expect(tokens[0]!.text).toBe('x')
      expect(tokens[0]!.trailingTrivia.length).toBeGreaterThan(0)
      expect(tokens[0]!.trailingTrivia.some(t => t.kind === 'lineComment')).toBe(true)

      // Token "y" should have no comment in leading trivia
      expect(tokens[1]!.text).toBe('y')
      expect(tokens[1]!.leadingTrivia.every(t => t.kind !== 'lineComment')).toBe(true)
    })

    it('same-line block comment attaches as trailing', () => {
      const { tokens: fullTokens } = tokenize('x /* note */\ny', true, undefined)
      const { tokens } = attachTrivia(fullTokens)

      expect(tokens[0]!.text).toBe('x')
      expect(tokens[0]!.trailingTrivia.some(t => t.kind === 'blockComment')).toBe(true)
    })

    it('next-line comment attaches as leading', () => {
      const { tokens: fullTokens } = tokenize('x\n// comment\ny', true, undefined)
      const { tokens } = attachTrivia(fullTokens)

      // "x" trailing should have the newline but not the comment
      expect(tokens[0]!.text).toBe('x')
      expect(tokens[0]!.trailingTrivia.every(t => t.kind !== 'lineComment')).toBe(true)

      // "y" leading should have the comment
      expect(tokens[1]!.text).toBe('y')
      expect(tokens[1]!.leadingTrivia.some(t => t.kind === 'lineComment')).toBe(true)
    })

    it('file-level trailing trivia is separate', () => {
      const { tokens: fullTokens } = tokenize('x\n// eof comment\n', true, undefined)
      const result = attachTrivia(fullTokens)

      // "x" should only have same-line trailing trivia (the newline)
      expect(result.tokens[0]!.text).toBe('x')

      // The EOF comment and final newline should be in trailingTrivia
      const allText =
        result.tokens
          .map(t => t.leadingTrivia.map(tr => tr.text).join('') + t.text + t.trailingTrivia.map(tr => tr.text).join(''))
          .join('') + result.trailingTrivia.map(t => t.text).join('')

      expect(allText).toBe('x\n// eof comment\n')
    })

    it('empty file produces no tokens', () => {
      const { tokens: fullTokens } = tokenize('', true, undefined)
      const result = attachTrivia(fullTokens)
      expect(result.tokens).toHaveLength(0)
      expect(result.trailingTrivia).toHaveLength(0)
    })

    it('whitespace-only file produces only trailing trivia', () => {
      const { tokens: fullTokens } = tokenize('  \n  \n', true, undefined)
      const result = attachTrivia(fullTokens)
      expect(result.tokens).toHaveLength(0)
      expect(result.trailingTrivia.length).toBeGreaterThan(0)
    })
  })
})
