import { describe, expect, it } from 'vitest'
import { buildSymbolTable } from './SymbolTableBuilder'
import { tokenize } from '../tokenizer/tokenize'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { parseRecoverable } from '../parser'
import { builtin } from '../builtin'

// Collect all builtin names for the builder
const builtinNames = new Set<string>([
  ...Object.keys(builtin.normalExpressions),
  'true', 'false', 'null', 'E', 'PI', 'Infinity',
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
