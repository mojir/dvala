import { describe, expect, it } from 'vitest'
import { buildSymbolTable } from './SymbolTableBuilder'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { parseRecoverable } from '../parser'
import { builtin } from '../builtin'
import { reservedSymbolRecord } from '../tokenizer/reservedNames'

// Collect all builtin names — must mirror WorkspaceIndex.ts
const builtinNames = new Set<string>([
  ...Object.keys(builtin.normalExpressions),
  ...Object.keys(builtin.specialExpressions),
  ...Object.keys(reservedSymbolRecord),
])

function build(source: string) {
  const tokens = tokenize(source, true, 'test.dvala')
  const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
  const result = parseRecoverable(minified)
  return buildSymbolTable(result.body, result.sourceMap, 'test.dvala', builtinNames)
}

describe('buildSymbolTable', () => {
  describe('definitions', () => {
    it('finds let bindings', () => {
      const { definitions } = build('let x = 1; let y = 2')
      expect(definitions).toHaveLength(2)
      expect(definitions[0]!.name).toBe('x')
      expect(definitions[1]!.name).toBe('y')
    })

    it('classifies function definitions', () => {
      const { definitions } = build('let f = (x) -> x + 1')
      const f = definitions.find(d => d.name === 'f')
      expect(f?.kind).toBe('function')
      // Parameter should also be registered
      const x = definitions.find(d => d.name === 'x')
      expect(x?.kind).toBe('parameter')
    })

    it('extracts parameter names for functions', () => {
      const { definitions } = build('let add = (a, b) -> a + b')
      const add = definitions.find(d => d.name === 'add')
      expect(add?.params).toEqual(['a', 'b'])
    })

    it('extracts parameter names for macros', () => {
      const { definitions } = build('let m = macro (x) -> quote $^{x} end')
      const m = definitions.find(d => d.name === 'm')
      expect(m?.params).toEqual(['x'])
    })

    it('does not add params to non-function definitions', () => {
      const { definitions } = build('let x = 42')
      const x = definitions.find(d => d.name === 'x')
      expect(x?.params).toBeUndefined()
    })

    it('handles rest parameters in param extraction', () => {
      const { definitions } = build('let f = (a, ...rest) -> a')
      const f = definitions.find(d => d.name === 'f')
      expect(f?.params).toEqual(['a', '...rest'])
    })

    it('handles destructured parameters in param extraction', () => {
      const { definitions } = build('let f = ({ x, y }) -> x + y')
      const f = definitions.find(d => d.name === 'f')
      expect(f?.params).toEqual(['{...}'])
    })

    it('classifies macro definitions', () => {
      const { definitions } = build('let m = macro (x) -> quote $^{x} end')
      const m = definitions.find(d => d.name === 'm')
      expect(m?.kind).toBe('macro')
    })

    it('classifies handler definitions', () => {
      const { definitions } = build('let h = handler @my.eff(x) -> resume(x) end')
      const h = definitions.find(d => d.name === 'h')
      expect(h?.kind).toBe('handler')
    })

    it('handles destructured let bindings', () => {
      const { definitions } = build('let { a, b } = { a: 1, b: 2 }')
      expect(definitions.map(d => d.name).sort()).toEqual(['a', 'b'])
    })

    it('handles array destructuring', () => {
      const { definitions } = build('let [first, ...rest] = [1, 2, 3]')
      const names = definitions.map(d => d.name)
      expect(names).toContain('first')
      expect(names).toContain('rest')
    })

    it('finds function parameters', () => {
      const { definitions } = build('let f = (a, b, c) -> a + b + c')
      const params = definitions.filter(d => d.kind === 'parameter')
      expect(params.map(d => d.name).sort()).toEqual(['a', 'b', 'c'])
    })

    it('tracks scope depth', () => {
      const { definitions } = build('let x = 1; let f = (y) -> y + x')
      const x = definitions.find(d => d.name === 'x')
      const f = definitions.find(d => d.name === 'f')
      const y = definitions.find(d => d.name === 'y')
      expect(x?.scope).toBe(0)
      expect(f?.scope).toBe(0)
      expect(y?.scope).toBe(1) // inside function scope
    })

    it('includes source locations', () => {
      const { definitions } = build('let x = 42')
      expect(definitions[0]!.location.file).toBe('test.dvala')
      expect(definitions[0]!.location.line).toBe(1)
      expect(definitions[0]!.location.column).toBeGreaterThan(0)
    })
  })

  describe('references', () => {
    it('finds symbol references', () => {
      const { references } = build('let x = 1; x + 1')
      const xRefs = references.filter(r => r.name === 'x')
      expect(xRefs.length).toBeGreaterThan(0)
    })

    it('resolves references to definitions', () => {
      const { references } = build('let x = 1; x + 1')
      const xRef = references.find(r => r.name === 'x')
      expect(xRef?.resolvedDef).not.toBeNull()
      expect(xRef?.resolvedDef?.name).toBe('x')
    })

    it('marks unresolved references', () => {
      const { references } = build('y + 1')
      const yRef = references.find(r => r.name === 'y')
      expect(yRef?.resolvedDef).toBeNull()
    })

    it('does not include builtin references', () => {
      const { references } = build('let x = 1; str(x)')
      // `str` is a builtin — should not appear in references
      const strRefs = references.filter(r => r.name === 'str')
      expect(strRefs).toHaveLength(0)
    })

    it('resolves references to the innermost scope', () => {
      const { references, definitions } = build('let x = 1; let f = (x) -> x + 1')
      // The reference to `x` inside the function should resolve to the parameter, not the outer let
      const innerX = definitions.find(d => d.name === 'x' && d.kind === 'parameter')
      const xRefInFunc = references.find(r => r.name === 'x')
      expect(xRefInFunc?.resolvedDef?.nodeId).toBe(innerX?.nodeId)
    })
  })

  describe('scoping', () => {
    it('handles do blocks with separate scope', () => {
      // Variables defined inside `do` should not leak out
      const { definitions } = build('do let inner = 1; inner end')
      const inner = definitions.find(d => d.name === 'inner')
      expect(inner?.scope).toBe(1) // inside block scope
    })

    it('handles for loop bindings', () => {
      const { definitions } = build('for (x in [1, 2, 3]) -> x')
      const x = definitions.find(d => d.name === 'x')
      expect(x).toBeDefined()
      expect(x?.scope).toBeGreaterThan(0)
    })

    it('handles match case bindings', () => {
      const { definitions } = build('match 1 | x -> x end')
      const x = definitions.find(d => d.name === 'x')
      expect(x).toBeDefined()
      expect(x?.scope).toBeGreaterThan(0)
    })

    it('handles handler clause parameters', () => {
      const { definitions } = build('handler @my.eff(val) -> resume(val) end')
      const val = definitions.find(d => d.name === 'val')
      expect(val?.kind).toBe('parameter')
      expect(val?.scope).toBeGreaterThan(0)
    })
  })

  describe('AST walking — compound nodes', () => {
    it('walks if/then/else branches', () => {
      const { references } = build('let x = 1; if x > 0 then x + 1 else x - 1 end')
      const xRefs = references.filter(r => r.name === 'x')
      expect(xRefs.length).toBe(3) // condition, then, else
    })

    it('walks function call arguments', () => {
      const { references } = build('let f = (a) -> a; let x = 1; f(x)')
      const xRef = references.find(r => r.name === 'x')
      expect(xRef?.resolvedDef?.name).toBe('x')
      const fRef = references.find(r => r.name === 'f')
      expect(fRef?.resolvedDef?.name).toBe('f')
    })

    it('walks macro call arguments', () => {
      const { references } = build('let m = macro (x) -> quote $^{x} end; let val = 1; #m val')
      const valRef = references.find(r => r.name === 'val')
      expect(valRef?.resolvedDef?.name).toBe('val')
    })

    it('walks object entries', () => {
      const { references } = build('let x = 1; let y = 2; { a: x, b: y }')
      expect(references.find(r => r.name === 'x')?.resolvedDef).not.toBeNull()
      expect(references.find(r => r.name === 'y')?.resolvedDef).not.toBeNull()
    })

    it('walks array elements', () => {
      const { references } = build('let x = 1; let y = 2; [x, y]')
      expect(references.filter(r => r.name === 'x' || r.name === 'y')).toHaveLength(2)
    })

    it('walks template string interpolations', () => {
      const { references } = build('let name = "world"; `hello ${name}`')
      expect(references.find(r => r.name === 'name')?.resolvedDef).not.toBeNull()
    })

    it('reports correct position for symbols inside template interpolations', () => {
      const { references } = build('let name = "world"; `hello ${name}`')
      const nameRef = references.find(r => r.name === 'name')
      expect(nameRef).toBeDefined()
      // `name` inside the template: backtick at col 20 (0-based), +1 for backtick,
      // +8 for "hello ${" = col 29 (0-based) → 30 (1-based)
      expect(nameRef!.location).toEqual({ file: 'test.dvala', line: 1, column: 30 })
    })

    it('walks spread expressions', () => {
      const { references } = build('let xs = [1, 2]; [...xs, 3]')
      expect(references.find(r => r.name === 'xs')?.resolvedDef).not.toBeNull()
    })

    it('walks and/or/qq chains', () => {
      const { references } = build('let a = true; let b = false; a && b || a')
      expect(references.filter(r => r.name === 'a').length).toBeGreaterThanOrEqual(2)
      expect(references.find(r => r.name === 'b')?.resolvedDef).not.toBeNull()
    })

    it('walks perform expressions', () => {
      const { references } = build('let x = 1; perform(@my.eff, x)')
      expect(references.find(r => r.name === 'x')?.resolvedDef).not.toBeNull()
    })

    it('walks resume expressions', () => {
      const { definitions, references } = build('handler @my.eff(x) -> resume(x + 1) end')
      expect(definitions.find(d => d.name === 'resume')).toBeDefined()
      const xRef = references.find(r => r.name === 'x')
      expect(xRef?.resolvedDef?.name).toBe('x')
    })

    it('walks handler transform clause', () => {
      const { definitions, references } = build(
        'handler @my.eff(x) -> resume(x) transform result -> result + 1 end',
      )
      const result = definitions.find(d => d.name === 'result')
      expect(result?.kind).toBe('parameter')
      const resultRef = references.find(r => r.name === 'result')
      expect(resultRef?.resolvedDef?.name).toBe('result')
    })

    it('walks match case with guard expressions', () => {
      const { references } = build('let x = 5; match x case n when n > 0 then n + 1 case _ then 0 end')
      // n should be used in guard and body
      const nRefs = references.filter(r => r.name === 'n')
      expect(nRefs.length).toBeGreaterThanOrEqual(2) // guard + body
    })

    it('walks for loop with let bindings and when/while', () => {
      const { definitions, references } = build(
        'for (i in [1, 2, 3, 4, 5] let sq = i * i when sq > 4 while sq < 20) -> sq',
      )
      expect(definitions.find(d => d.name === 'i')).toBeDefined()
      expect(definitions.find(d => d.name === 'sq')).toBeDefined()
      // sq should be referenced in when, while, and body
      const sqRefs = references.filter(r => r.name === 'sq')
      expect(sqRefs.length).toBeGreaterThanOrEqual(3)
    })

    it('walks do-with-handler blocks', () => {
      const { references } = build(
        'let h = handler @my.eff(x) -> resume(x) end; do with h; perform(@my.eff, 1) end',
      )
      expect(references.find(r => r.name === 'h')?.resolvedDef).not.toBeNull()
    })

    it('walks loop bindings', () => {
      const { definitions, references } = build(
        'loop (n = 10, acc = 1) -> if n <= 1 then acc else recur(n - 1, acc * n) end',
      )
      expect(definitions.find(d => d.name === 'n')).toBeDefined()
      expect(definitions.find(d => d.name === 'acc')).toBeDefined()
      expect(references.filter(r => r.name === 'n').length).toBeGreaterThanOrEqual(2)
    })

    it('handles wildcard and literal patterns in match', () => {
      const { references } = build('let x = 1; match x case 0 then "zero" case _ then "other" end')
      expect(references.find(r => r.name === 'x')?.resolvedDef).not.toBeNull()
    })
  })

  describe('scope ranges', () => {
    it('creates scope range for function body', () => {
      const { scopeRanges } = build('let f = (a, b) -> a + b')
      expect(scopeRanges.length).toBeGreaterThan(0)
      const funcScope = scopeRanges.find(sr => sr.definitions.some(d => d.name === 'a'))
      expect(funcScope).toBeDefined()
      expect(funcScope!.definitions.map(d => d.name).sort()).toEqual(['a', 'b'])
    })

    it('creates scope range for do block', () => {
      const { scopeRanges } = build('do let x = 1; x end')
      const blockScope = scopeRanges.find(sr => sr.definitions.some(d => d.name === 'x'))
      expect(blockScope).toBeDefined()
    })

    it('creates scope range for match cases', () => {
      const { scopeRanges } = build('match 1 case n then n end')
      const matchScope = scopeRanges.find(sr => sr.definitions.some(d => d.name === 'n'))
      expect(matchScope).toBeDefined()
    })

    it('creates scope range for for loops', () => {
      const { scopeRanges } = build('for (i in [1, 2, 3]) -> i')
      const forScope = scopeRanges.find(sr => sr.definitions.some(d => d.name === 'i'))
      expect(forScope).toBeDefined()
    })

    it('creates scope range for handler clauses with resume', () => {
      const { scopeRanges } = build('handler @my.eff(val) -> resume(val) end')
      const handlerScope = scopeRanges.find(sr => sr.definitions.some(d => d.name === 'val'))
      expect(handlerScope).toBeDefined()
      expect(handlerScope!.definitions.map(d => d.name)).toContain('resume')
    })

    it('scope ranges have valid start/end positions', () => {
      const { scopeRanges } = build('let f = (x) -> x + 1')
      for (const sr of scopeRanges) {
        expect(sr.startLine).toBeGreaterThan(0)
        expect(sr.endLine).toBeGreaterThanOrEqual(sr.startLine)
        expect(sr.startColumn).toBeGreaterThan(0)
      }
    })

    it('does not create empty scope ranges', () => {
      // Import node — no definitions inside
      const { scopeRanges } = build('let x = import("foo")')
      // Should not have a scope range with zero definitions
      for (const sr of scopeRanges) {
        expect(sr.definitions.length).toBeGreaterThan(0)
      }
    })
  })

  describe('partial AST (error recovery)', () => {
    it('builds symbol table from partial AST', () => {
      const tokens = tokenize('let x = 1; let y = ; let z = 3', true, 'test.dvala')
      const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
      const result = parseRecoverable(minified)
      // Should have parse errors but also some valid nodes
      expect(result.errors.length).toBeGreaterThan(0)
      const { definitions } = buildSymbolTable(result.body, result.sourceMap, 'test.dvala', builtinNames)
      // Should find definitions from the valid statements
      const names = definitions.map(d => d.name)
      expect(names).toContain('x')
      expect(names).toContain('z')
    })
  })
})
