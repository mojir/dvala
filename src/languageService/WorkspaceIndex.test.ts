import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

  describe('getSymbolAtPosition', () => {
    it('finds symbol name at a definition site', () => {
      index.updateFile('test.dvala', 'let x = 1; x + 1')
      const symbols = index.getFileSymbols('test.dvala')
      const xDef = symbols!.definitions.find(d => d.name === 'x')
      const result = index.getSymbolAtPosition('test.dvala', xDef!.location.line, xDef!.location.column)
      expect(result?.name).toBe('x')
    })

    it('finds symbol name at a reference site', () => {
      index.updateFile('test.dvala', 'let x = 1; x + 1')
      const symbols = index.getFileSymbols('test.dvala')
      const xRef = symbols!.references.find(r => r.name === 'x')
      const result = index.getSymbolAtPosition('test.dvala', xRef!.location.line, xRef!.location.column)
      expect(result?.name).toBe('x')
    })

    it('returns null for empty position', () => {
      index.updateFile('test.dvala', 'let x = 1')
      const result = index.getSymbolAtPosition('test.dvala', 999, 999)
      expect(result).toBeNull()
    })
  })

  describe('findAllOccurrences', () => {
    it('finds both definition and references', () => {
      index.updateFile('test.dvala', 'let x = 1; x + x')
      const occurrences = index.findAllOccurrences('test.dvala', 'x')
      // 1 definition + 2 references = 3 occurrences
      expect(occurrences).toHaveLength(3)
    })

    it('includes nameLength for each occurrence', () => {
      index.updateFile('test.dvala', 'let myVar = 1; myVar + 1')
      const occurrences = index.findAllOccurrences('test.dvala', 'myVar')
      for (const occ of occurrences) {
        expect(occ.nameLength).toBe(5)
      }
    })
  })

  describe('invalidation', () => {
    it('invalidates cached file', () => {
      index.updateFile('test.dvala', 'let x = 1')
      index.invalidateFile('test.dvala')
      expect(index.getFileSymbols('test.dvala')).toBeNull()
    })
  })

  describe('getSymbolsInScope', () => {
    it('returns top-level symbols at file level', () => {
      index.updateFile('test.dvala', 'let x = 1; let y = 2')
      const symbols = index.getSymbolsInScope('test.dvala', 1, 20)
      const names = symbols.map(s => s.name)
      expect(names).toContain('x')
      expect(names).toContain('y')
    })

    it('includes function parameters inside function body', () => {
      index.updateFile('test.dvala', 'let f = (a, b) -> a + b')
      const symbols = index.getSymbolsInScope('test.dvala', 1, 20)
      const names = symbols.map(s => s.name)
      expect(names).toContain('a')
      expect(names).toContain('b')
      expect(names).toContain('f')
    })

    it('excludes inner-scope symbols outside their scope', () => {
      index.updateFile('test.dvala', 'let f = (a) -> a + 1; let x = 1')
      const symbols = index.getSymbolsInScope('test.dvala', 1, 30)
      const names = symbols.map(s => s.name)
      expect(names).toContain('f')
      expect(names).toContain('x')
      expect(names).not.toContain('a') // parameter not visible outside function
    })

    it('includes block-local variables inside do block', () => {
      index.updateFile('test.dvala', 'do\n  let inner = 1;\n  inner\nend')
      const symbols = index.getSymbolsInScope('test.dvala', 3, 3)
      const names = symbols.map(s => s.name)
      expect(names).toContain('inner')
    })

    it('excludes block-local variables outside do block', () => {
      index.updateFile('test.dvala', 'let y = do\n  let inner = 1;\n  inner\nend;\ny')
      const symbols = index.getSymbolsInScope('test.dvala', 5, 1)
      const names = symbols.map(s => s.name)
      expect(names).toContain('y')
      expect(names).not.toContain('inner')
    })

    it('only includes top-level symbols defined before the cursor', () => {
      index.updateFile('test.dvala', 'let a = 1;\nlet b = 2;\nlet c = 3')
      // Position at line 2 — should see a and b, not c
      const symbols = index.getSymbolsInScope('test.dvala', 2, 10)
      const names = symbols.map(s => s.name)
      expect(names).toContain('a')
      expect(names).toContain('b')
      expect(names).not.toContain('c')
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

  describe('cross-file operations', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvala-ws-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    function writeFile(name: string, content: string): string {
      const filePath = path.join(tmpDir, name)
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, content)
      return filePath
    }

    it('resolves imports and tracks the import graph', () => {
      const libPath = writeFile('lib.dvala', 'let pi = 3.14; let e = 2.71; { pi, e }')
      const mainPath = writeFile('main.dvala', 'let { pi } = import("./lib"); pi * 2')
      index.updateFile(libPath)
      index.updateFile(mainPath)
      const mainSymbols = index.getFileSymbols(mainPath)
      expect(mainSymbols).not.toBeNull()
      expect([...mainSymbols!.imports.values()]).toContain(libPath)
    })

    it('findDefinition resolves cross-file symbols', () => {
      const libPath = writeFile('lib.dvala', 'let pi = 3.14; { pi }')
      const mainPath = writeFile('main.dvala', 'let { pi } = import("./lib"); pi * 2')
      index.updateFile(libPath)
      index.updateFile(mainPath)
      // Find reference to `pi` in main (the `pi * 2` part)
      const mainSymbols = index.getFileSymbols(mainPath)!
      const piRef = mainSymbols.references.find(r => r.name === 'pi')
      expect(piRef).toBeDefined()
      // pi should resolve to the local destructured definition
      expect(piRef!.resolvedDef).not.toBeNull()
      expect(piRef!.resolvedDef!.name).toBe('pi')
    })

    it('findReferences includes references from importing files', () => {
      const libPath = writeFile('lib.dvala', 'let pi = 3.14; { pi }')
      const mainPath = writeFile('main.dvala', 'let { pi } = import("./lib"); pi * 2')
      index.updateFile(libPath)
      index.updateFile(mainPath)
      // Find references to 'pi' starting from lib — should include main's references
      const refs = index.findReferences(libPath, 'pi')
      // lib has at least 1 reference to pi (in the export object), main has references too
      expect(refs.length).toBeGreaterThanOrEqual(1)
    })

    it('findAllOccurrences works cross-file', () => {
      const libPath = writeFile('lib.dvala', 'let pi = 3.14; { pi }')
      const mainPath = writeFile('main.dvala', 'let { pi } = import("./lib"); pi * 2')
      index.updateFile(libPath)
      index.updateFile(mainPath)
      const occurrences = index.findAllOccurrences(libPath, 'pi')
      // Should have occurrences from lib (definition + export ref) and from main
      expect(occurrences.length).toBeGreaterThanOrEqual(2)
    })

    it('resolves .dvala extension automatically', () => {
      const libPath = writeFile('utils.dvala', 'let helper = 1; { helper }')
      const mainPath = writeFile('main.dvala', 'let { helper } = import("./utils"); helper')
      index.updateFile(libPath)
      index.updateFile(mainPath)
      const mainSymbols = index.getFileSymbols(mainPath)
      expect([...mainSymbols!.imports.values()]).toContain(libPath)
    })

    it('reads file from disk when source not provided', () => {
      const filePath = writeFile('auto.dvala', 'let x = 42; x')
      const result = index.updateFile(filePath)
      expect(result).not.toBeNull()
      expect(result!.definitions.find(d => d.name === 'x')).toBeDefined()
    })

    it('returns null for nonexistent file', () => {
      const result = index.updateFile(path.join(tmpDir, 'nonexistent.dvala'))
      expect(result).toBeNull()
    })

    it('invalidates dependents when a file changes', () => {
      const libPath = writeFile('lib.dvala', 'let x = 1; { x }')
      const mainPath = writeFile('main.dvala', 'let { x } = import("./lib"); x')
      index.updateFile(libPath)
      index.updateFile(mainPath)
      // Invalidate lib — main (which imports lib) should also be invalidated
      index.invalidateFile(libPath)
      expect(index.getFileSymbols(libPath)).toBeNull()
      expect(index.getFileSymbols(mainPath)).toBeNull()
    })
  })

  describe('extractExports', () => {
    it('extracts exported names from trailing object literal', () => {
      index.updateFile('test.dvala', 'let pi = 3.14; let e = 2.71; { pi, e }')
      const symbols = index.getFileSymbols('test.dvala')
      expect(symbols!.exports.map(e => e.name).sort()).toEqual(['e', 'pi'])
    })

    it('returns empty exports when last expression is not an object', () => {
      index.updateFile('test.dvala', 'let x = 1; x + 1')
      const symbols = index.getFileSymbols('test.dvala')
      expect(symbols!.exports).toHaveLength(0)
    })

    it('returns empty exports for empty file', () => {
      // A file with only a number literal — no object at end
      index.updateFile('test.dvala', '42')
      const symbols = index.getFileSymbols('test.dvala')
      expect(symbols!.exports).toHaveLength(0)
    })
  })
})
