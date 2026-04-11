import { describe, expect, it } from 'vitest'
import { parse } from '../src/parser'
import { prettyPrint } from '../src/prettyPrint'
import { minifyTokenStream } from '../src/tokenizer/minifyTokenStream'
import { tokenize } from '../src/tokenizer/tokenize'

// Helper: parse code to AST, then pretty-print it.
// minifyTokenStream strips whitespace so the parser can handle all syntax forms.
function pp(code: string): string {
  const tokens = minifyTokenStream(tokenize(code, false, undefined), { removeWhiteSpace: true })
  const ast = parse(tokens)
  if (ast.length === 1) return prettyPrint(ast[0])
  return ast.map(n => prettyPrint(n)).join(';\n')
}

describe('prettyPrint — atoms', () => {
  it('numbers', () => { expect(pp('42')).toBe('42') })
  it('negative numbers', () => { expect(pp('-5')).toBe('-5') })
  it('strings', () => { expect(pp('"hello"')).toBe('"hello"') })
  it('strings with escapes', () => { expect(pp('"a\\"b"')).toBe('"a\\"b"') })
  it('true/false/null', () => {
    expect(pp('true')).toBe('true')
    expect(pp('false')).toBe('false')
    expect(pp('null')).toBe('null')
  })
  it('symbols', () => { expect(pp('x')).toBe('x') })
  it('builtins', () => { expect(pp('+(1, 2)')).toBe('1 + 2') })
  it('effects', () => { expect(pp('@dvala.io.print')).toBe('@dvala.io.print') })
  it('import', () => { expect(pp('import("math")')).toBe('import("math")') })
})

describe('prettyPrint — operators', () => {
  it('infix arithmetic', () => { expect(pp('1 + 2')).toBe('1 + 2') })
  it('infix comparison', () => { expect(pp('x == y')).toBe('x == y') })
  it('infix concat', () => { expect(pp('"a" ++ "b"')).toBe('"a" ++ "b"') })
  it('infix bitwise', () => { expect(pp('x & y')).toBe('x & y') })
  it('and', () => { expect(pp('a && b')).toBe('a && b') })
  it('or', () => { expect(pp('a || b')).toBe('a || b') })
  it('nullish', () => { expect(pp('a ?? b')).toBe('a ?? b') })
  it('unary minus', () => { expect(pp('-(x)')).toBe('-(x)') })
  it('partial application preserves prefix form', () => {
    expect(pp('+(_, 10)')).toBe('+(_, 10)')
  })
})

describe('prettyPrint — dot access', () => {
  it('simple dot access', () => { expect(pp('obj.name')).toBe('obj.name') })
  it('chained dot access', () => { expect(pp('a.b.c')).toBe('a.b.c') })
  it('computed access stays as get()', () => {
    expect(pp('get(obj, 0)')).toBe('get(obj, 0)')
  })
})

describe('prettyPrint — pipe chains', () => {
  it('simple pipe', () => { expect(pp('x |> f')).toBe('f(x)') })
  it('multi-pipe', () => { expect(pp('x |> f |> g |> h')).toBe('x |> f |> g |> h') })
  it('long pipe chain breaks to multi-line', () => {
    const code = 'someVeryLongVariableName |> firstTransformFunction |> secondTransformFunction |> thirdTransformFunction'
    const result = pp(code)
    expect(result).toContain('|>')
    expect(result).toContain('\n')
  })
})

describe('prettyPrint — function calls', () => {
  it('simple call', () => { expect(pp('f(x, y)')).toBe('f(x, y)') })
  it('nested call stays as nested call (no implicit pipe rewrite)', () => { expect(pp('f(g(x))')).toBe('f(g(x))') })
  it('lambda callee gets parens', () => {
    expect(pp('((x) -> x)(42)')).toBe('((x) -> x)(42)')
  })
  it('long args break to multi-line', () => {
    const code = 'someFunction(firstArgument, secondArgument, thirdArgument, fourthArgument, fifthArgument)'
    const result = pp(code)
    expect(result).toContain('\n')
    expect(result).toContain('someFunction(')
  })
})

describe('prettyPrint — if/else', () => {
  it('simple if', () => { expect(pp('if true then 1 end')).toBe('if true then 1 end') })
  it('if/else', () => { expect(pp('if x then 1 else 2 end')).toBe('if x then 1 else 2 end') })
  it('if/else if chain', () => {
    expect(pp('if a then 1 else if b then 2 else 3 end')).toBe('if a then 1 else if b then 2 else 3 end')
  })
  it('long if breaks to multi-line', () => {
    const code = 'if someVeryLongConditionVariable then someVeryLongResultExpression else someOtherVeryLongResultExpression end'
    const result = pp(code)
    expect(result).toContain('\n')
    expect(result).toContain('if ')
    expect(result).toContain('end')
  })
  it('long if/else if breaks to multi-line', () => {
    const code = 'if someVeryLongConditionOne then someVeryLongResultOne else if someVeryLongConditionTwo then someVeryLongResultTwo else someDefaultResult end'
    const result = pp(code)
    expect(result).toContain('\n')
    expect(result).toContain('else if')
  })
  it('long if without else breaks to multi-line', () => {
    const code = 'if someVeryLongConditionVariable then someVeryLongResultExpression + anotherVeryLongTerm end'
    const result = pp(code)
    expect(result).toContain('\n')
    expect(result).toContain('if ')
    expect(result).toContain('end')
    expect(result).not.toContain('else')
  })
})

describe('prettyPrint — do blocks', () => {
  it('simple block', () => { expect(pp('do 1; 2; 3 end')).toBe('do\n  1;\n  2;\n  3;\nend') })
  it('single-line block stays inline without semicolon before end', () => {
    expect(pp('do 1 + 1 end')).toBe('do 1 + 1 end')
  })
  it('long block breaks to multi-line', () => {
    const code = 'do let veryLongVariableNameOne = 42; let veryLongVariableNameTwo = 99; veryLongVariableNameOne + veryLongVariableNameTwo end'
    const result = pp(code)
    expect(result).toContain('\n')
    expect(result).toContain('do')
    expect(result).toContain('end')
  })
})

describe('prettyPrint — let bindings', () => {
  it('simple let', () => { expect(pp('let x = 42')).toBe('let x = 42') })
  it('array destructuring', () => { expect(pp('let [a, b] = [1, 2]')).toBe('let [a, b] = [1, 2]') })
  it('object destructuring', () => { expect(pp('let { name } = obj')).toBe('let { name } = obj') })
  it('with default', () => { expect(pp('let x = 42')).toBe('let x = 42') })
  it('rest parameter', () => { expect(pp('let [a, ...rest] = xs')).toBe('let [a, ...rest] = xs') })
})

describe('prettyPrint — functions', () => {
  it('simple lambda', () => { expect(pp('(x) -> x + 1')).toBe('(x) -> x + 1') })
  it('multi-param', () => { expect(pp('(a, b) -> a + b')).toBe('(a, b) -> a + b') })
  it('multi-statement body', () => {
    expect(pp('(x) -> do let y = x * 2; y + 1 end')).toBe('(x) -> do\n  let y = x * 2;\n  y + 1;\nend')
  })
  it('long lambda breaks body', () => {
    const code = '(someVeryLongParamName) -> someVeryLongParamName + someVeryLongParamName + someVeryLongParamName'
    const result = pp(code)
    expect(result).toContain('->')
  })
  it('long multi-statement breaks to multi-line do', () => {
    const code = '(x) -> do let someVeryLongName = x * x * x * x; someVeryLongName + someVeryLongName + someVeryLongName end'
    const result = pp(code)
    expect(result).toContain('do')
    expect(result).toContain('\n')
  })
  it('default param', () => { expect(pp('(x = 10) -> x')).toBe('(x = 10) -> x') })
})

describe('prettyPrint — macros', () => {
  it('simple macro', () => { expect(pp('macro (ast) -> ast')).toBe('macro (ast) -> ast') })
  it('named macro', () => {
    expect(pp('macro@my.lib (ast) -> ast')).toBe('macro@my.lib (ast) -> ast')
  })
  it('multi-statement macro body', () => {
    const result = pp('macro (ast) -> do let x = ast; x end')
    expect(result).toContain('macro')
    expect(result).toContain('do')
  })
  it('long macro breaks', () => {
    const code = 'macro (someVeryLongAstParameterName) -> someVeryLongAstParameterName + someVeryLongAstParameterName + someVeryLongAstParameterName'
    const result = pp(code)
    expect(result).toContain('macro')
    expect(result).toContain('\n')
  })
  it('long multi-statement macro', () => {
    const code = 'macro (ast) -> do let veryLongVariableName = ast; let anotherVeryLongName = veryLongVariableName; anotherVeryLongName end'
    const result = pp(code)
    expect(result).toContain('macro')
    expect(result).toContain('do')
    expect(result).toContain('\n')
  })
})

describe('prettyPrint — perform', () => {
  it('perform with arg', () => { expect(pp('perform(@my.eff, 42)')).toBe('perform(@my.eff, 42)') })
  it('perform without arg', () => { expect(pp('perform(@my.eff)')).toBe('perform(@my.eff)') })
})

describe('prettyPrint — arrays and objects', () => {
  it('empty array', () => { expect(pp('[]')).toBe('[]') })
  it('simple array', () => { expect(pp('[1, 2, 3]')).toBe('[1, 2, 3]') })
  it('long array breaks', () => {
    const code = '[1111111111, 2222222222, 3333333333, 4444444444, 5555555555, 6666666666, 7777777777]'
    const result = pp(code)
    expect(result).toContain('\n')
    expect(result).toContain('[')
  })
  it('spread in array', () => { expect(pp('[...xs, 4]')).toBe('[...xs, 4]') })
  it('empty object', () => { expect(pp('{}')).toBe('{}') })
  it('simple object', () => { expect(pp('{ a: 1, b: 2 }')).toBe('{ a: 1, b: 2 }') })
  it('long object breaks', () => {
    const code = '{ firstVeryLongKey: "firstValue", secondVeryLongKey: "secondValue", thirdVeryLongKey: "thirdValue" }'
    const result = pp(code)
    expect(result).toContain('\n')
    expect(result).toContain('{')
  })
  it('spread in object', () => { expect(pp('{ ...base, x: 1 }')).toBe('{ ...base, x: 1 }') })
  it('computed key', () => {
    const result = pp('{ [k]: v }')
    expect(result).toContain('[k]')
  })
})

describe('prettyPrint — recur / parallel / race', () => {
  it('recur', () => { expect(pp('recur(1, 2)')).toBe('recur(1, 2)') })
  it('long recur breaks', () => {
    const code = 'recur(veryLongArgumentOne, veryLongArgumentTwo, veryLongArgumentThree, veryLongArgumentFour)'
    const result = pp(code)
    expect(result).toContain('\n')
    expect(result).toContain('recur(')
  })
  it('parallel', () => {
    expect(pp('parallel([-> 1, -> 2])')).toBe('parallel([-> 1, -> 2])')
  })
  it('race', () => {
    expect(pp('race([-> 1, -> 2])')).toBe('race([-> 1, -> 2])')
  })
  it('settled', () => {
    expect(pp('settled([-> 1, -> 2])')).toBe('settled([-> 1, -> 2])')
  })
})

describe('prettyPrint — loops', () => {
  it('simple loop', () => {
    expect(pp('loop (i = 0) -> i')).toBe('loop (i = 0) -> i')
  })
  it('long loop breaks', () => {
    const code = 'loop (veryLongIndexName = 0, veryLongAccumulatorName = 0) -> veryLongIndexName + veryLongAccumulatorName'
    const result = pp(code)
    expect(result).toContain('loop')
    expect(result).toContain('\n')
  })
})

describe('prettyPrint — for comprehension', () => {
  it('simple for', () => { expect(pp('for (x in [1, 2, 3]) -> x * 2')).toBe('for (x in [1, 2, 3]) -> x * 2') })
  it('for with when guard', () => {
    expect(pp('for (x in xs when x > 0) -> x')).toBe('for (x in xs when x > 0) -> x')
  })
  it('for with while guard', () => {
    expect(pp('for (x in xs while x < 10) -> x')).toBe('for (x in xs while x < 10) -> x')
  })
  it('for with let binding', () => {
    expect(pp('for (x in xs let y = x * 2) -> y')).toBe('for (x in xs let y = x * 2) -> y')
  })
  it('for with let and when combined', () => {
    expect(pp('for (x in xs let y = x * 2 when y > 0) -> y')).toBe('for (x in xs let y = x * 2 when y > 0) -> y')
  })
  it('for with no let bindings (null letBindings)', () => {
    // Exercises Array.isArray(letBindings) falsy branch
    expect(pp('for (x in [1, 2]) -> x')).toBe('for (x in [1, 2]) -> x')
  })
  it('long for breaks', () => {
    const code = 'for (veryLongVarName in someVeryLongCollectionName when veryLongVarName > 0) -> veryLongVarName * veryLongVarName'
    const result = pp(code)
    expect(result).toContain('for')
    expect(result).toContain('\n')
  })
})

describe('prettyPrint — match', () => {
  it('simple match', () => {
    expect(pp('match x case 0 then "zero" case _ then "other" end'))
      .toBe('match x case 0 then "zero" case _ then "other" end')
  })
  it('match with guard', () => {
    const result = pp('match x case n when n > 0 then "positive" case _ then "non-positive" end')
    expect(result).toContain('when')
  })
  it('match with destructuring', () => {
    const result = pp('match val case [a, b] then a + b case _ then 0 end')
    expect(result).toContain('[a, b]')
  })
  it('long match breaks', () => {
    const code = 'match someVeryLongExpressionValue case someVeryLongPatternOne then someVeryLongResultOne case someVeryLongPatternTwo then someVeryLongResultTwo end'
    const result = pp(code)
    expect(result).toContain('\n')
    expect(result).toContain('match')
    expect(result).toContain('end')
  })
})

describe('prettyPrint — template strings', () => {
  it('simple template', () => { expect(pp('`hello ${name}`')).toBe('`hello ${name}`') })
  it('multi-interpolation', () => { expect(pp('`${a} + ${b} = ${c}`')).toBe('`${a} + ${b} = ${c}`') })
})

describe('prettyPrint — handler nodes', () => {
  it('handler with clause', () => {
    const result = pp('handler @my.eff(x) -> resume(x) end')
    expect(result).toContain('handler')
    expect(result).toContain('@my.eff')
    expect(result).toContain('resume')
    expect(result).toContain('end')
  })
  it('handler with transform', () => {
    const result = pp('handler @my.eff(x) -> resume(x) transform y -> y * 2 end')
    expect(result).toContain('transform')
  })
  it('handler with no params clause', () => {
    const result = pp('handler @my.eff() -> resume(42) end')
    expect(result).toContain('@my.eff()')
  })
  it('handler with multi-statement clause body', () => {
    const result = pp('handler @my.eff(x) -> do let y = x; resume(y) end end')
    expect(result).toContain('@my.eff')
  })
  it('handler with multi-statement transform body', () => {
    const result = pp('handler transform x -> do let y = x * 2; y + 1 end end')
    expect(result).toContain('transform')
    expect(result).toContain('let y = x * 2')
  })
  it('handler with multi-statement clause and transform', () => {
    const result = pp('handler @eff(x) -> do let a = x; resume(a) end transform r -> do let b = r; b * 10 end end')
    expect(result).toContain('@eff')
    expect(result).toContain('transform')
  })
  it('resume with arg', () => { expect(pp('handler @eff(x) -> resume(x) end')).toContain('resume(x)') })
  it('bare resume via raw AST', () => {
    // Resume node with 'ref' payload — bare resume reference
    expect(prettyPrint(['Resume', 'ref', 0])).toBe('resume')
  })
  it('resume with arg via raw AST', () => {
    expect(prettyPrint(['Resume', ['Num', 42, 0], 0])).toBe('resume(42)')
  })
  it('with handler', () => {
    const result = pp('do with h; body end')
    expect(result).toContain('with')
  })
})

describe('prettyPrint — code templates (quote)', () => {
  it('simple quote', () => {
    const result = pp('quote 42 end')
    expect(result).toContain('quote')
    expect(result).toContain('42')
  })
  it('quote with splice', () => {
    const result = pp('let a = 1; quote $^{a} + $^{a} end')
    expect(result).toContain('$^{')
  })
  it('quote containing match (exercises substituteSplices non-array payload items)', () => {
    // Match cases have [pattern, body, guard] where guard can be null.
    // substituteSplices must handle null items in the payload array.
    const result = pp('quote match x case 0 then "zero" case _ then "other" end end')
    expect(result).toContain('quote')
    expect(result).toContain('match')
    expect(result).toContain('case')
  })
  it('quote containing if/else', () => {
    const result = pp('quote if a then b else c end end')
    expect(result).toContain('if')
  })
  it('quote containing let', () => {
    const result = pp('quote let x = 42 end')
    expect(result).toContain('let x = 42')
  })
  it('multi-line quote semicolon-terminates final line before end', () => {
    expect(pp('quote let x = 1; x + 1 end')).toBe('quote\n  let x = 1;\n  x + 1;\nend')
  })
})

describe('prettyPrint — binding targets', () => {
  it('object alias (as)', () => {
    const result = pp('let { name as n } = obj')
    expect(result).toContain('as')
  })
  it('object rest', () => {
    const result = pp('let { a, ...rest } = obj')
    expect(result).toContain('...rest')
  })
  it('nested object destructuring', () => {
    const result = pp('let { a: [x, y] } = obj')
    expect(result).toContain('[x, y]')
  })
  it('array with default', () => {
    const result = pp('let [a = 0, b = 1] = xs')
    expect(result).toContain('a = 0')
    expect(result).toContain('b = 1')
  })
  it('symbol with default', () => {
    expect(pp('(x = 10) -> x')).toContain('x = 10')
  })
  it('wildcard in match', () => {
    expect(pp('match x case _ then 1 end')).toContain('_')
  })
  it('literal in match', () => {
    expect(pp('match x case 42 then "found" end')).toContain('42')
  })
  it('rest with default in array', () => {
    const result = pp('let [...rest] = xs')
    expect(result).toContain('...rest')
  })
})

describe('prettyPrint — long binary chains', () => {
  it('long && breaks', () => {
    const code = 'veryLongVarA && veryLongVarB && veryLongVarC && veryLongVarD && veryLongVarE && veryLongVarF'
    const result = pp(code)
    expect(result).toContain('&&')
    expect(result).toContain('\n')
  })
  it('long || breaks', () => {
    const code = 'veryLongVarA || veryLongVarB || veryLongVarC || veryLongVarD || veryLongVarE || veryLongVarF'
    const result = pp(code)
    expect(result).toContain('||')
    expect(result).toContain('\n')
  })
  it('long ?? breaks', () => {
    const code = 'veryLongVarA ?? veryLongVarB ?? veryLongVarC ?? veryLongVarD ?? veryLongVarE ?? veryLongVarF'
    const result = pp(code)
    expect(result).toContain('??')
    expect(result).toContain('\n')
  })
})

describe('prettyPrint — binding targets with defaults', () => {
  it('rest param with default', () => {
    // Constructs AST for `...rest = []` rest binding target manually
    // since no Dvala syntax produces rest-with-default in destructuring
    const restTarget = ['rest', ['rest', ['Array', [], 0]], 0]
    const result = prettyPrint(['Let', [restTarget, ['Num', 42, 0]], 0])
    expect(result).toContain('...rest')
  })

  it('array destructuring with default in function param', () => {
    // `([a, b] = [0, 0]) -> a + b` — array param with default
    const result = pp('([a, b] = [0, 0]) -> a + b')
    expect(result).toContain('[a, b] = [0, 0]')
  })

  it('object destructuring with default in function param', () => {
    // `({ x, y } = { x: 0, y: 0 }) -> x + y` — object param with default
    const result = pp('({ x, y } = { x: 0, y: 0 }) -> x + y')
    expect(result).toContain('{ x, y }')
    expect(result).toContain('=')
  })
})

describe('prettyPrint — smart rewrites via raw AST', () => {
  it('0 - x rewrites to -x', () => {
    const ast = ['Call', [['Builtin', '-', 0], [['Num', 0, 0], ['Sym', 'x', 0]]], 0]
    expect(prettyPrint(ast)).toBe('-x')
  })
  it('non-zero minus stays as subtraction', () => {
    // 3 - x → NOT rewritten to unary minus (first arg is 3, not 0)
    const ast = ['Call', [['Builtin', '-', 0], [['Num', 3, 0], ['Sym', 'x', 0]]], 0]
    expect(prettyPrint(ast)).toBe('3 - x')
  })
})

describe('prettyPrint — raw AST edge cases', () => {
  it('splice node outside code template', () => {
    expect(prettyPrint(['Splice', 0, 0])).toBe('<Splice>')
  })

  it('binding target node passed to printNode', () => {
    // A Let node whose target is printed inline
    const symbolTarget = ['symbol', [['Sym', 'x', 0], undefined], 0]
    const letNode = ['Let', [symbolTarget, ['Num', 42, 0]], 0]
    expect(prettyPrint(letNode)).toBe('let x = 42')
  })

  it('unknown node type fallback', () => {
    expect(prettyPrint(['UnknownType', null, 0])).toBe('<UnknownType>')
  })

  it('code template with splice at top level exercises printNodeWithSplices', () => {
    // CodeTmpl: [bodyAst, spliceExprs]
    // bodyAst has a Splice node referencing spliceExprs[0]
    const spliceExpr = ['Num', 99, 0]
    const bodyAst = [['Splice', 0, 0]]
    const codeTmpl = ['CodeTmpl', [bodyAst, [spliceExpr]], 0]
    const result = prettyPrint(codeTmpl)
    expect(result).toContain('$^{99}')
  })

  it('code template with invalid splice index throws', () => {
    const bodyAst = [['Splice', 5, 0]] // index 5 doesn't exist
    const codeTmpl = ['CodeTmpl', [bodyAst, []], 0]
    expect(() => prettyPrint(codeTmpl)).toThrow(/Invalid splice index/)
  })

  it('macro callee gets parens', () => {
    // Covers the Macro branch of needsParens (line 219-220)
    const param = ['symbol', [['Sym', 'ast', 0], undefined], 0]
    const ast = ['Call', [['Macro', [[param], [['Sym', 'ast', 0]], null], 0], [['Num', 1, 0]]], 0]
    expect(prettyPrint(ast)).toBe('(macro (ast) -> ast)(1)')
  })

  it('substituteSplices fallback for missing splice expr', () => {
    // Splice index exists but spliceExprs[index] is undefined → fallback text
    // This exercises the falsy branch of `expr ?` in substituteSplices (line 509)
    const bodyAst = [['Call', [['Builtin', '+', 0], [['Splice', 0, 0], ['Num', 1, 0]]], 0]]
    const codeTmpl = ['CodeTmpl', [bodyAst, [undefined]], 0]
    const result = prettyPrint(codeTmpl)
    expect(result).toContain('$^{<splice0>}')
  })

  it('pipe chain breaks when inner callee is not a named symbol', () => {
    // f(g(x)) is a pipe chain, but f((a -> a)(x)) is not because callee is a lambda
    const ast = ['Call', [['Sym', 'f', 0], [['Call', [['Function', [[], [['Sym', 'x', 0]]], 0], [['Num', 1, 0]]], 0]]], 0]
    const result = prettyPrint(ast)
    // Should NOT produce pipe chain — inner callee is a Function, not Sym/Builtin
    expect(result).toContain('f(')
    expect(result).not.toContain('|>')
  })

  it('null slot in array destructuring prints as empty comma', () => {
    // Array binding target with a null element: [a, , b] → null stays as empty slot
    const arrayTarget = ['array', [[['symbol', [['Sym', 'a', 0], undefined], 0], null, ['symbol', [['Sym', 'b', 0], undefined], 0]], undefined], 0]
    const letNode = ['Let', [arrayTarget, ['Array', [['Num', 1, 0], ['Num', 2, 0], ['Num', 3, 0]], 0]], 0]
    const result = prettyPrint(letNode)
    expect(result).toBe('let [a, , b] = [1, 2, 3]')
  })

  it('binding target type passed directly to printNode', () => {
    // Binding targets (symbol, array, object, etc.) can appear in AST payloads.
    // prettyPrint delegates to printBindingTarget for these.
    expect(prettyPrint(['symbol', [['Sym', 'x', 0], undefined], 0])).toBe('x')
    expect(prettyPrint(['rest', ['r', undefined], 0])).toBe('...r')
    expect(prettyPrint(['wildcard', [], 0])).toBe('_')
    expect(prettyPrint(['array', [[['symbol', [['Sym', 'a', 0], undefined], 0]], undefined], 0])).toBe('[a]')
    expect(prettyPrint(['literal', [['Num', 42, 0]], 0])).toBe('42')
  })
})

// ---------------------------------------------------------------------------
// Session-specific rules: all formatting behaviours introduced or hardened
// ---------------------------------------------------------------------------

/** Assert that every semicolon in `s` appears at the end of its line. */
function assertNoMidLineSemicolons(s: string): void {
  for (const line of s.split('\n')) {
    const trimmed = line.trimEnd()
    if (trimmed.includes(';')) {
      expect(trimmed.endsWith(';')).toBe(true)
    }
  }
}

describe('prettyPrint — do block semicolons-last rule', () => {
  it('two-statement do block always expands', () => {
    expect(pp('do 1; 2 end')).toBe('do\n  1;\n  2;\nend')
  })
  it('no mid-line semicolons in expanded do block', () => {
    assertNoMidLineSemicolons(pp('do let x = 1; let y = 2; x + y end'))
  })
  it('single-stmt do block whose body is multi-line also expands', () => {
    // Inner do block is multi-line → outer single-stmt block cannot use flat form
    const result = pp('do do 1; 2 end end')
    expect(result).toContain('\n')
    expect(result).toMatch(/^do\n/)
  })
})

describe('prettyPrint — handler: single clause on same line', () => {
  it('short single-clause handler stays on one line', () => {
    expect(pp('handler @my.eff(x) -> resume(x) end')).toBe('handler @my.eff(x) -> resume(x) end')
  })
  it('single-clause with multi-statement body: clause stays inline with handler', () => {
    const result = pp('handler @my.eff(x) -> do let y = x; resume(y) end end')
    // Clause header is on the same opening line as `handler`
    expect(result).toMatch(/^handler @my\.eff\(x\) -> do\n/)
    // No mid-line semicolons inside the body
    assertNoMidLineSemicolons(result)
    // Exactly two `end` keywords — one for do, one for handler
    expect(result.match(/\bend\b/g)?.length).toBe(2)
  })
  it('single-clause handler with transform: clause inline, transform on new line', () => {
    const result = pp('handler @my.eff(x) -> resume(x) transform r -> r * 2 end')
    expect(result).toMatch(/^handler @my\.eff\(x\) -> resume\(x\)\n/)
    expect(result).toContain('\ntransform\n')
    expect(result).toContain('r -> r * 2')
  })
  it('multi-clause handler: each clause indented', () => {
    // First clause has a multi-statement body → flat check fails; 2 clauses → multi-clause form
    const result = pp('handler @my.a(x) -> do let r = x; resume(r) end @my.b(y) -> resume(y) end')
    expect(result).toMatch(/^handler\n/)
    expect(result).toContain('@my.a(x) ->')
    expect(result).toContain('@my.b(y) -> resume(y)')
  })
})

describe('prettyPrint — with handler body indentation', () => {
  it('with h; body sits at same indent level as with', () => {
    expect(pp('do with h; let x = 1; x end')).toBe('do\n  with h;\n  let x = 1;\n  x;\nend')
  })
  it('with h; never flat (would put semicolon mid-line)', () => {
    const result = pp('do with h; body end')
    // Must expand — `with` cannot be on the same line as surrounding do content
    expect(result).toContain('\n  with h;')
  })
})

describe('prettyPrint — object inline threshold (max 3 entries)', () => {
  it('object with 2 entries stays inline', () => {
    expect(pp('{ a: 1, b: 2 }')).toBe('{ a: 1, b: 2 }')
  })
  it('object with exactly 3 entries stays inline', () => {
    expect(pp('{ a: 1, b: 2, c: 3 }')).toBe('{ a: 1, b: 2, c: 3 }')
  })
  it('object with 4 entries expands to multi-line', () => {
    const result = pp('{ a: 1, b: 2, c: 3, d: 4 }')
    expect(result).toContain('\n')
    expect(result).toMatch(/^\{/)
  })
  it('object with multi-line value expands even with ≤3 entries', () => {
    // Value is a 4-entry object that itself expands → allSingleLine guard triggers
    const result = pp('{ a: { x: 1, y: 2, z: 3, w: 4 } }')
    expect(result).toContain('\n')
  })
})

describe('prettyPrint — array inline threshold (max 3 elements)', () => {
  it('array with exactly 3 elements stays inline', () => {
    expect(pp('[1, 2, 3]')).toBe('[1, 2, 3]')
  })
  it('array with 4 elements expands to multi-line', () => {
    const result = pp('[1, 2, 3, 4]')
    expect(result).toContain('\n')
    expect(result).toMatch(/^\[/)
  })
  it('array with a multi-line element expands even with ≤3 elements', () => {
    // The single element is a 4-entry object → multi-line → allSingleLine guard fires
    const result = pp('[{ a: 1, b: 2, c: 3, d: 4 }]')
    expect(result).toContain('\n')
  })
})

describe('prettyPrint — match: multi-line case body breaks after then', () => {
  it('single-line case bodies stay on same line as then', () => {
    expect(pp('match x case 0 then "zero" case _ then "other" end'))
      .toBe('match x case 0 then "zero" case _ then "other" end')
  })
  it('multi-line case body produces a newline after then', () => {
    // The do-block body expands → the case `then` line has no trailing body
    const result = pp('match x case n then do let y = n + 1; y end case _ then 0 end')
    const lines = result.split('\n')
    // The `case n then` line must end there — body is on the next line
    const caseLine = lines.find(l => l.includes('case n then'))
    expect(caseLine?.trimEnd()).toBe('  case n then')
    assertNoMidLineSemicolons(result)
  })
})

describe('prettyPrint — perform: line-breaking for large args', () => {
  it('perform with small arg stays inline', () => {
    expect(pp('perform(@my.eff, 42)')).toBe('perform(@my.eff, 42)')
  })
  it('perform with multi-line arg expands to multi-line form', () => {
    // 4-entry object arg expands → allSingleLine guard triggers multi-line perform
    const result = pp('perform(@my.eff, { a: 1, b: 2, c: 3, d: 4 })')
    expect(result).toContain('\n')
    expect(result).toMatch(/^perform\(/)
  })
})

describe('prettyPrint — quote: multi-statement expansion', () => {
  it('single-statement quote stays on one line when it fits', () => {
    expect(pp('quote x + 1 end')).toBe('quote x + 1 end')
  })
  it('multi-statement quote always expands with semicolons at end of line', () => {
    const result = pp('quote let x = 1; x + 1 end')
    expect(result).toMatch(/^quote\n/)
    expect(result).toContain('let x = 1')
    expect(result).toContain('x + 1')
    assertNoMidLineSemicolons(result)
  })
})

describe('prettyPrint — pipe chain: allSingleLine guard', () => {
  it('pipe chain with a multi-line node breaks to multi-line form', () => {
    // 4-element array expands; multi-step pipe (isPipe hint requires ≥2 |>) ensures
    // the pipe chain renderer is used, then allSingleLine guard forces multi-line form
    const result = pp('[1, 2, 3, 4] |> sort |> reverse')
    expect(result).toContain('\n')
    expect(result).toContain('|>')
  })
})

describe('prettyPrint — call: allSingleLine guard', () => {
  it('call with multi-line arg breaks to multi-line form', () => {
    const result = pp('foo({ a: 1, b: 2, c: 3, d: 4 })')
    expect(result).toContain('\n')
    expect(result).toMatch(/^foo\(/)
  })
})

describe('prettyPrint — MacroCall decorator formatting', () => {
  it('short non-let operand stays flat (root)', () => {
    expect(pp('#foo someValue')).toBe('#foo someValue')
  })

  it('let operand at root: decorator style, operand at same indent', () => {
    expect(pp('#foo let x = 1')).toBe('#foo\nlet x = 1')
  })

  it('let operand with function value at root: decorator style', () => {
    expect(pp('#foo let f = (x) -> x + 1')).toBe('#foo\nlet f = (x) -> x + 1')
  })

  it('chained macros at root: each on its own line, let at same indent', () => {
    expect(pp('#foo #bar let x = 1')).toBe('#foo\n#bar\nlet x = 1')
  })

  it('let operand inside do block: decorator style at block indent', () => {
    const result = pp('do #foo let x = 1; x end')
    expect(result).toBe('do\n  #foo\n  let x = 1;\n  x;\nend')
  })

  it('let operand as sub-expression (not root): stays flat', () => {
    // #foo is not the root expression here — it is the value of an outer let
    expect(pp('let a = #foo let b = 1')).toBe('let a = #foo let b = 1')
  })

  it('non-let operand too long: breaks with indent', () => {
    const result = pp('#foo (someVeryLongParameterName, anotherVeryLongParameterName) -> someVeryLongBodyExpression')
    expect(result).toMatch(/^#foo\n {2}/)
  })

  it('let operand inside loop body: decorator style', () => {
    // loop body is a root slot — #foo should use decorator style
    const result = pp('loop (i = 0) -> #foo let x = i')
    expect(result).toContain('#foo\n')
    expect(result).toContain('let x = i')
  })

  it('let operand inside for body: decorator style', () => {
    const result = pp('for (x in xs) -> #foo let y = x')
    expect(result).toContain('#foo\n')
    expect(result).toContain('let y = x')
  })

  it('let operand inside quote body: decorator style', () => {
    const result = pp('quote #foo let x = 1 end')
    expect(result).toContain('#foo\n')
    expect(result).toContain('let x = 1')
  })

  it('chained macros inside quote body: each on own line', () => {
    const result = pp('quote #foo #bar let x = 1 end')
    expect(result).toContain('#foo\n')
    expect(result).toContain('#bar\n')
    expect(result).toContain('let x = 1')
  })
})
