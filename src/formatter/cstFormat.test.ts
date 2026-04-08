/**
 * Tests for the CST-based formatter.
 *
 * Tests are organized by concern:
 * 1. Basic formatting — simple constructs produce expected output
 * 2. Line wrapping — long lines break correctly
 * 3. Comment preservation — comments survive formatting
 * 4. Idempotency — format(format(x)) === format(x)
 */
import { describe, expect, it } from 'vitest'
import { tokenize } from '../tokenizer/tokenize'
import { parseToCst } from '../parser'
import { formatCst } from './cstFormat'

function fmt(source: string): string {
  const fullTokenStream = tokenize(source, true, undefined)
  const { tree, trailingTrivia } = parseToCst(fullTokenStream)
  return formatCst(tree, trailingTrivia)
}

// ---------------------------------------------------------------------------
// Basic formatting
// ---------------------------------------------------------------------------

describe('cstFormat — basic', () => {
  it('formats a number', () => {
    expect(fmt('42')).toBe('42\n')
  })

  it('formats a string', () => {
    expect(fmt('"hello"')).toBe('"hello"\n')
  })

  it('formats a symbol', () => {
    expect(fmt('foo')).toBe('foo\n')
  })

  it('formats true/false/null', () => {
    expect(fmt('true')).toBe('true\n')
    expect(fmt('false')).toBe('false\n')
    expect(fmt('null')).toBe('null\n')
  })

  it('formats a binary expression', () => {
    expect(fmt('1 + 2')).toBe('1 + 2\n')
  })

  it('formats a let binding', () => {
    expect(fmt('let x = 42')).toBe('let x = 42\n')
  })

  it('formats multiple statements', () => {
    expect(fmt('let x = 1; let y = 2')).toBe('let x = 1;\nlet y = 2\n')
  })

  it('formats an empty array', () => {
    expect(fmt('[]')).toBe('[]\n')
  })

  it('formats a short array', () => {
    expect(fmt('[1, 2, 3]')).toBe('[1, 2, 3]\n')
  })

  it('formats an empty object', () => {
    expect(fmt('{}')).toBe('{}\n')
  })

  it('formats property access', () => {
    expect(fmt('foo.bar')).toBe('foo.bar\n')
  })

  it('formats index access', () => {
    expect(fmt('arr[0]')).toBe('arr[0]\n')
  })

  it('formats function call', () => {
    expect(fmt('foo(1, 2)')).toBe('foo(1, 2)\n')
  })

  it('formats function call with no args', () => {
    expect(fmt('foo()')).toBe('foo()\n')
  })

  it('formats parenthesized expression', () => {
    expect(fmt('(1 + 2)')).toBe('(1 + 2)\n')
  })

  it('formats spread', () => {
    expect(fmt('[...xs]')).toBe('[...xs]\n')
  })

  it('formats unary minus', () => {
    expect(fmt('-x')).toBe('-x\n')
  })

  it('formats effect name', () => {
    expect(fmt('@my.effect')).toBe('@my.effect\n')
  })

  it('formats template string', () => {
    expect(fmt('`hello ${name}`')).toBe('`hello ${name}`\n')
  })
})

// ---------------------------------------------------------------------------
// Complex constructs
// ---------------------------------------------------------------------------

describe('cstFormat — complex constructs', () => {
  it('formats if/then/end', () => {
    const result = fmt('if true then 1 end')
    expect(result).toBe('if true then\n  1\nend\n')
  })

  it('formats if/then/else/end', () => {
    const result = fmt('if x then 1 else 2 end')
    expect(result).toBe('if x then\n  1\nelse\n  2\nend\n')
  })

  it('formats do/end block', () => {
    const result = fmt('do 1; 2 end')
    expect(result).toBe('do\n  1;\n  2\nend\n')
  })

  it('formats lambda', () => {
    expect(fmt('(x) -> x + 1')).toBe('(x) -> x + 1\n')
  })

  it('formats shorthand lambda', () => {
    expect(fmt('-> $ + 1')).toBe('-> $ + 1\n')
  })

  it('formats match expression', () => {
    const result = fmt('match x case 1 then "one" case _ then "other" end')
    expect(result).toBe('match x\n  case 1 then "one"\n  case _ then "other"\nend\n')
  })

  it('formats handler expression', () => {
    const result = fmt('handler @my.eff(x) -> resume(x) end')
    expect(result).toContain('handler')
    expect(result).toContain('@my.eff')
    expect(result).toContain('end')
  })

  it('formats resume with args', () => {
    expect(fmt('resume(42)')).toBe('resume(42)\n')
  })

  it('formats bare resume', () => {
    expect(fmt('resume')).toBe('resume\n')
  })

  it('formats nested if in else', () => {
    const result = fmt('if a then 1 else if b then 2 else 3 end')
    expect(result).toContain('else if')
    expect(result).toContain('end')
  })

  it('formats do with handler', () => {
    const src = 'do with h; 1 end'
    const result = fmt(src)
    expect(result).toContain('do')
    expect(result).toContain('with h;')
    expect(result).toContain('end')
  })
})

// ---------------------------------------------------------------------------
// Line wrapping
// ---------------------------------------------------------------------------

describe('cstFormat — line wrapping', () => {
  it('wraps long array across lines', () => {
    const source = '[very_long_element_a, very_long_element_b, very_long_element_c, very_long_element_d]'
    const result = fmt(source)
    expect(result).toContain('\n')
    expect(result).toContain('  very_long_element_a')
  })

  it('wraps long function call across lines', () => {
    const source = 'some_function(very_long_arg_a, very_long_arg_b, very_long_arg_c)'
    const result = fmt(source)
    expect(result).toContain('\n')
  })

  it('wraps binary op when line is long', () => {
    const source = 'very_long_variable_name + another_very_long_variable_name + yet_another_long_name'
    const result = fmt(source)
    expect(result).toContain('\n')
  })
})

// ---------------------------------------------------------------------------
// Comment preservation
// ---------------------------------------------------------------------------

describe('cstFormat — comments', () => {
  it('preserves trailing line comment', () => {
    const result = fmt('42 // hello')
    expect(result).toContain('// hello')
  })

  it('preserves leading line comment', () => {
    const result = fmt('// hello\n42')
    expect(result).toContain('// hello')
    expect(result).toContain('42')
  })

  it('preserves block comment', () => {
    const result = fmt('/* hello */ 42')
    expect(result).toContain('/* hello */')
    expect(result).toContain('42')
  })

  it('preserves inline block comment in function call', () => {
    const result = fmt('foo(/* arg */ 42)')
    expect(result).toContain('/* arg */')
    expect(result).toContain('42')
  })

  it('preserves comment between statements', () => {
    const result = fmt('let x = 1;\n// middle\nlet y = 2')
    expect(result).toContain('// middle')
  })

  it('preserves blank lines between statements', () => {
    const result = fmt('let x = 1;\n\nlet y = 2')
    // Should have a blank line between the two statements
    expect(result).toMatch(/let x = 1;\n\nlet y = 2/)
  })
})

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('cstFormat — idempotency', () => {
  const cases = [
    '42',
    '"hello"',
    'foo',
    '1 + 2',
    'let x = 42',
    '[1, 2, 3]',
    'foo(1, 2)',
    'foo.bar',
    'arr[0]',
    '(1 + 2)',
    '[...xs, 1]',
    '-x',
    '@my.effect',
  ]

  for (const source of cases) {
    it(`idempotent for: ${source}`, () => {
      const once = fmt(source)
      const twice = fmt(once.trimEnd())
      expect(twice).toBe(once)
    })
  }
})
