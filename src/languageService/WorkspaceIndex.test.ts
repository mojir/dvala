import { describe, expect, it, beforeEach } from 'vitest'
import { WorkspaceIndex } from './WorkspaceIndex'

describe('WorkspaceIndex', () => {
  let index: WorkspaceIndex

  beforeEach(() => {
    index = new WorkspaceIndex()
  })

  describe('updateFile', () => {
    it('parses source and returns file symbols', () => {
      const result = index.updateFile('test.dvala', 'let x = 1; let y = 2')
      expect(result).not.toBeNull()
      expect(result!.definitions).toHaveLength(2)
      expect(result!.definitions[0]!.name).toBe('x')
      expect(result!.definitions[1]!.name).toBe('y')
    })

    it('returns definitions from broken files', () => {
      const result = index.updateFile('test.dvala', 'let x = 1; let y = ; let z = 3')
      expect(result).not.toBeNull()
      expect(result!.parseErrors.length).toBeGreaterThan(0)
      // Should still have definitions from valid statements
      const names = result!.definitions.map(d => d.name)
      expect(names).toContain('x')
      expect(names).toContain('z')
    })

    it('caches results and returns same symbols for unchanged content', () => {
      const source = 'let x = 1'
      const result1 = index.updateFile('test.dvala', source)
      const result2 = index.updateFile('test.dvala', source)
      expect(result1).toBe(result2) // same object reference (cached)
    })

    it('re-parses when content changes', () => {
      index.updateFile('test.dvala', 'let x = 1')
      const result = index.updateFile('test.dvala', 'let y = 2')
      expect(result!.definitions[0]!.name).toBe('y')
    })
  })

  describe('getDocumentSymbols', () => {
    it('returns only top-level definitions', () => {
      index.updateFile('test.dvala', 'let x = 1; let f = (y) -> y + x')
      const symbols = index.getDocumentSymbols('test.dvala')
      const names = symbols.map(s => s.name)
      expect(names).toContain('x')
      expect(names).toContain('f')
      expect(names).not.toContain('y') // parameter, not top-level
    })
  })

  describe('getDiagnostics', () => {
    it('reports parse errors', () => {
      index.updateFile('test.dvala', 'let x = ; let y = 2')
      const { parseErrors } = index.getDiagnostics('test.dvala')
      expect(parseErrors.length).toBeGreaterThan(0)
    })

    it('reports unresolved references', () => {
      index.updateFile('test.dvala', 'let x = undefinedVar')
      const { unresolvedRefs } = index.getDiagnostics('test.dvala')
      expect(unresolvedRefs.some(r => r.name === 'undefinedVar')).toBe(true)
    })

    it('does not report resolved references as errors', () => {
      index.updateFile('test.dvala', 'let x = 1; x + 1')
      const { unresolvedRefs } = index.getDiagnostics('test.dvala')
      expect(unresolvedRefs.filter(r => r.name === 'x')).toHaveLength(0)
    })
  })

  describe('findDefinition', () => {
    it('finds definition of a local symbol', () => {
      index.updateFile('test.dvala', 'let x = 1; x + 1')
      // The reference to `x` is on line 1, after the semicolon
      const symbols = index.getFileSymbols('test.dvala')
      const xRef = symbols!.references.find(r => r.name === 'x')
      expect(xRef).toBeDefined()
      const def = index.findDefinition('test.dvala', xRef!.location.line, xRef!.location.column)
      expect(def).not.toBeNull()
      expect(def!.name).toBe('x')
    })
  })

  describe('findReferences', () => {
    it('finds all references to a symbol in the file', () => {
      index.updateFile('test.dvala', 'let x = 1; x + x')
      const refs = index.findReferences('test.dvala', 'x')
      expect(refs.length).toBe(2) // two references to x (not counting the definition)
    })
  })

  describe('invalidation', () => {
    it('invalidates cached file', () => {
      index.updateFile('test.dvala', 'let x = 1')
      index.invalidateFile('test.dvala')
      expect(index.getFileSymbols('test.dvala')).toBeNull()
    })
  })

  describe('getDefinitions fallback', () => {
    it('returns token-scanned definitions when AST is unavailable', () => {
      // Even if full parse fails, getDefinitions should return something
      index.updateFile('test.dvala', 'let x = 1; let y = ; let z = 3')
      const defs = index.getDefinitions('test.dvala')
      expect(defs.length).toBeGreaterThan(0)
    })
  })
})
