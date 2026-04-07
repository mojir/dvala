import { describe, expect, it } from 'vitest'
import { format } from './format'

/**
 * Each test uses `check(input, expected)` so that before and after are
 * visually aligned and easy to scan as documentation.
 *
 * The formatter always appends a trailing newline; `check` trims both sides
 * so expected strings don't need to carry it.
 */
function check(input: string, expected: string): void {
  expect(format(input).trimEnd()).toBe(expected.trimEnd())
}

// ---------------------------------------------------------------------------
// Structural formatting — let bindings
// ---------------------------------------------------------------------------

describe('formatter — let bindings', () => {
  it('adds spaces around =', () => check(
    'let x=42',
    'let x = 42;',
  ))

  it('adds spaces around operators', () => check(
    'let x=1+2',
    'let x = 1 + 2;',
  ))

  it('already-correct code is unchanged', () => check(
    'let x = 42;',
    'let x = 42;',
  ))

  it('array destructuring', () => check(
    'let [a,b]=arr',
    'let [a, b] = arr;',
  ))

  it('object destructuring', () => check(
    'let {x,y}=obj',
    'let { x, y } = obj;',
  ))
})

// ---------------------------------------------------------------------------
// Structural formatting — functions
// ---------------------------------------------------------------------------

describe('formatter — functions', () => {
  it('adds spaces around -> and between params', () => check(
    'let f=(a,b)->a+b',
    'let f = (a, b) -> a + b;',
  ))

  it('shorthand lambda: preserves -> form without ($) prefix', () => check(
    'let f = -> $ + 1',
    'let f = -> $ + 1;',
  ))

  it('shorthand lambda with multiple placeholders', () => check(
    'let f = -> $ + $2',
    'let f = -> $ + $2;',
  ))

  it('default parameter', () => check(
    'let f=(x,y=10)->x+y',
    'let f = (x, y = 10) -> x + y;',
  ))

  it('rest parameter', () => check(
    'let f=(first,...rest)->rest',
    'let f = (first, ...rest) -> rest;',
  ))

  it('short do-block stays on one line', () => check(
    'let f = (x) -> do\nlet y = x * 2;\ny + 1\nend',
    'let f = (x) -> do let y = x * 2; y + 1 end;',
  ))
})

// ---------------------------------------------------------------------------
// Structural formatting — infix calls (authored form preserved)
// ---------------------------------------------------------------------------

describe('formatter — infix calls', () => {
  it('user-defined infix call stays as infix', () => check(
    'let r = 1 add 2',
    'let r = 1 add 2;',
  ))

  it('prefix call stays as prefix', () => check(
    'let r = add(1, 2)',
    'let r = add(1, 2);',
  ))
})

// ---------------------------------------------------------------------------
// Structural formatting — pipe chains (authored form preserved)
// ---------------------------------------------------------------------------

describe('formatter — pipe chains', () => {
  it('pipe chain stays as pipe chain', () => check(
    'let r = x |> f |> g',
    'let r = x |> f |> g;',
  ))

  it('nested call without |> stays as nested call', () => check(
    'let r = g(f(x))',
    'let r = g(f(x));',
  ))
})

// ---------------------------------------------------------------------------
// Structural formatting — collections
// ---------------------------------------------------------------------------

describe('formatter — collections', () => {
  it('array literal spacing', () => check(
    '[1,2,3]',
    '[1, 2, 3];',
  ))

  it('object literal spacing', () => check(
    '{x:1,y:2}',
    '{ x: 1, y: 2 };',
  ))

  it('nested object', () => check(
    '{a:{b:1}}',
    '{ a: { b: 1 } };',
  ))

  it('spread in array', () => check(
    '[...a,4]',
    '[...a, 4];',
  ))

  it('object shorthand: {x:x} normalises to {x}', () => check(
    'let o = {x:x,y:y}',
    'let o = { x, y };',
  ))
})

// ---------------------------------------------------------------------------
// Structural formatting — control flow
// ---------------------------------------------------------------------------

describe('formatter — control flow', () => {
  it('if/else', () => check(
    'if x>0 then 1 else -1 end',
    'if x > 0 then 1 else -1 end;',
  ))

  it('if without else', () => check(
    'if done then perform(@dvala.io.print,"done") end',
    'if done then perform(@dvala.io.print, "done") end;',
  ))
})

// ---------------------------------------------------------------------------
// Structural formatting — multiple statements
// ---------------------------------------------------------------------------

describe('formatter — multiple statements', () => {
  it('no blank line between statements is preserved', () => check(
    'let x = 1;\nlet y = 2;',
    'let x = 1;\nlet y = 2;',
  ))

  it('one blank line between statements is preserved', () => check(
    'let x = 1;\n\nlet y = 2;',
    'let x = 1;\n\nlet y = 2;',
  ))

  it('two or more blank lines are reduced to one', () => check(
    'let x = 1;\n\n\nlet y = 2;',
    'let x = 1;\n\nlet y = 2;',
  ))

  it('three or more blank lines are also reduced to one', () => check(
    'let x = 1;\n\n\n\nlet y = 2;',
    'let x = 1;\n\nlet y = 2;',
  ))

  it('standalone comment with blank lines', () => check(
    'let x = 1;\n\n// section\n\nlet y = 2;',
    'let x = 1;\n\n// section\nlet y = 2;',
  ))
})

// ---------------------------------------------------------------------------
// Comment placement — inline
// ---------------------------------------------------------------------------

describe('formatter — inline block comments', () => {
  it('keeps comment between function params', () => check(
    'let foo=(foo /*FOO*/, bar)->foo++bar',
    'let foo = (foo /*FOO*/, bar) -> foo ++ bar;',
  ))

  it('keeps comment between array elements', () => check(
    'let a=[1,/*two*/2,3]',
    'let a = [1, /*two*/ 2, 3];',
  ))

  it('keeps comment between object entries', () => check(
    'let o={x:1,/*y*/y:2}',
    'let o = { x: 1, /*y*/ y: 2 };',
  ))

  it('keeps multiple inline comments at their positions', () => check(
    'f(a /*A*/, b /*B*/, c)',
    'f(a /*A*/, b /*B*/, c);',
  ))
})

// ---------------------------------------------------------------------------
// Comment placement — trailing
// ---------------------------------------------------------------------------

describe('formatter — trailing line comments', () => {
  it('preserves trailing // comment', () => check(
    'let x = 1; // the answer',
    'let x = 1; // the answer',
  ))

  it('preserves trailing // after reformatted expression', () => check(
    'let x=1+2 // sum',
    'let x = 1 + 2; // sum',
  ))

  it('trailing comment on each of multiple statements', () => check(
    'let x = 1; // first\nlet y = 2; // second',
    'let x = 1; // first\nlet y = 2; // second',
  ))
})

describe('formatter — trailing block comments', () => {
  it('preserves trailing block comment at end of line', () => check(
    'let x = 1; /* note */',
    'let x = 1; /* note */',
  ))

  it('demotes trailing comment to leading when line would exceed 80 cols', () => check(
    'let reallyLongVariableName = someReallyLongFunctionCall(argument); // this comment would push the line way past 80 chars',
    '// this comment would push the line way past 80 chars\nlet reallyLongVariableName = someReallyLongFunctionCall(argument);',
  ))
})

// ---------------------------------------------------------------------------
// Comment placement — leading
// ---------------------------------------------------------------------------

describe('formatter — leading comments', () => {
  it('preserves // comment immediately before statement', () => check(
    '// init\nlet x = 1;',
    '// init\nlet x = 1;',
  ))

  it('preserves multi-line leading comment block', () => check(
    '// line one\n// line two\nlet x = 1;',
    '// line one\n// line two\nlet x = 1;',
  ))

  it('leading comment before second statement', () => check(
    'let x = 1;\n// next\nlet y = 2;',
    'let x = 1;\n// next\nlet y = 2;',
  ))

  it('leading block comment', () => check(
    '/* setup */\nlet x = 1;',
    '/* setup */\nlet x = 1;',
  ))
})

// ---------------------------------------------------------------------------
// Comment placement — standalone
// ---------------------------------------------------------------------------

describe('formatter — standalone comments', () => {
  it('standalone comment between statements stays with one blank line before', () => check(
    'let x = 1;\n\n// section header\n\nlet y = 2;',
    'let x = 1;\n\n// section header\nlet y = 2;',
  ))
})

// ---------------------------------------------------------------------------
// Preamble and epilogue
// ---------------------------------------------------------------------------

describe('formatter — preamble and epilogue', () => {
  it('comment before first statement', () => check(
    '// file header\nlet x = 1;',
    '// file header\nlet x = 1;',
  ))

  it('comment after last statement', () => check(
    'let x = 1;\n// end of file',
    'let x = 1;\n// end of file',
  ))
})

// ---------------------------------------------------------------------------
// Shebang
// ---------------------------------------------------------------------------

describe('formatter — shebang', () => {
  it('preserves shebang as first line', () => check(
    '#!/usr/bin/env dvala\nlet x = 1;',
    '#!/usr/bin/env dvala\nlet x = 1;',
  ))
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('formatter — post-processing', () => {
  it('strips trailing whitespace from lines', () => {
    expect(format('let x = 1;   \nlet y = 2;  ').trimEnd()).toBe('let x = 1;\nlet y = 2;')
  })

  it('strips leading blank lines', () => {
    expect(format('\n\nlet x = 1;').trimEnd()).toBe('let x = 1;')
  })

  it('always ends with a single newline', () => {
    expect(format('let x = 1;')).toMatch(/[^\n]\n$/)
  })
})

describe('formatter — comment-only files', () => {
  it('preserves a single comment with no statements', () => check(
    '// just a comment',
    '// just a comment',
  ))

  it('preserves multiple comments with no statements', () => check(
    '// line one\n// line two',
    '// line one\n// line two',
  ))

  it('preserves comment-only file with shebang', () => check(
    '#!/usr/bin/env dvala\n// only a comment',
    '#!/usr/bin/env dvala\n// only a comment',
  ))
})

describe('formatter — edge cases', () => {
  it('empty string returns empty string', () => {
    expect(format('')).toBe('')
  })

  it('whitespace-only returns empty string', () => {
    expect(format('   \n   ')).toBe('')
  })

  it('parse error returns original source unchanged', () => {
    const broken = 'let x = ) garbage ('
    expect(format(broken)).toBe(broken)
  })

  it('single expression without let', () => check(
    '1+2',
    '1 + 2;',
  ))

  it('already formatted code is stable', () => {
    const source = 'let f = (a, b) -> a + b;\nlet x = f(1, 2);'
    expect(format(source).trimEnd()).toBe(source)
  })
})

// ---------------------------------------------------------------------------
// Round-trip stability: format(format(x)) === format(x)
// ---------------------------------------------------------------------------

describe('formatter — round-trip stability', () => {
  const cases = [
    'let x=1+2',
    'let f=(a,b)->a+b',
    'let f = -> $ + 1',
    'let x=1; // comment',
    'let r = 1 add 2',
    'let r = x |> f |> g',
    'let foo=(foo /*FOO*/, bar)->foo++bar',
    '// header\nlet x = 1;\nlet y = x + 1; // done',
    'if x>0 then\nlet r=x*2;\nr\nelse\n0\nend',
  ]

  for (const source of cases) {
    it(`stable: ${source.replace(/\n/g, '↵')}`, () => {
      const once = format(source)
      const twice = format(once)
      expect(twice).toBe(once)
    })
  }
})

// ---------------------------------------------------------------------------
// Operator precedence — parentheses preservation
// ---------------------------------------------------------------------------

describe('formatter — operator precedence parens', () => {
  it('preserves parens when lower-precedence op is left arg of higher-precedence op', () => check(
    '(x - avg) ^ 2',
    '(x - avg) ^ 2;',
  ))

  it('preserves parens for addition inside multiplication', () => check(
    '(a + b) * c',
    '(a + b) * c;',
  ))

  it('preserves parens for bitwise OR inside shift', () => check(
    '(a | b) << 2',
    '(a | b) << 2;',
  ))

  it('does not add unnecessary parens when inner op binds tighter', () => check(
    'a + b * c',
    'a + b * c;',
  ))

  it('does not add parens around function calls', () => check(
    'mySum(arr) / count(arr)',
    'mySum(arr) / count(arr);',
  ))
})
