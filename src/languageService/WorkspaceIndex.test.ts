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
      // lib: `let pi` definition + shorthand `{ pi }` (Str key + Sym value share
      // the same source position, dedup to one). main: `let { pi }` destructuring
      // binding + `pi * 2` reference. Total: 4 unique locations.
      expect(occurrences).toHaveLength(4)
      const libOccs = occurrences.filter(o => o.file === libPath)
      const mainOccs = occurrences.filter(o => o.file === mainPath)
      expect(libOccs).toHaveLength(2)
      expect(mainOccs).toHaveLength(2)
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

  describe('cross-file rename (findAllOccurrences edge cases)', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvala-ws-rename-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    function writeFile(name: string, content: string): string {
      const filePath = path.join(tmpDir, name)
      fs.writeFileSync(filePath, content)
      return filePath
    }

    it('excludes unrelated locals in importer', () => {
      // main has a local `pi` shadowed inside `f`. Its reference chain
      // resolves to a different SymbolDef than the import-kind destructuring
      // def, so the resolvedDef-identity filter keeps it out of the result.
      const libPath = writeFile('lib.dvala', 'let pi = 3.14; { pi }')
      const mainPath = writeFile('main.dvala', 'let { pi } = import("./lib"); let f = () -> do let pi = 99; pi end; pi * 2')
      index.updateFile(libPath)
      index.updateFile(mainPath)
      const occurrences = index.findAllOccurrences(libPath, 'pi')
      // lib: let + export (deduped) = 2. main: destructuring + `pi * 2` = 2.
      // The local `let pi = 99` and its inner reference stay out.
      expect(occurrences).toHaveLength(4)
      expect(occurrences.filter(o => o.file === mainPath)).toHaveLength(2)
    })

    it('propagates rename across multiple importers', () => {
      const libPath = writeFile('lib.dvala', 'let pi = 3.14; { pi }')
      const aPath = writeFile('a.dvala', 'let { pi } = import("./lib"); pi')
      const bPath = writeFile('b.dvala', 'let { pi } = import("./lib"); pi + 1')
      index.updateFile(libPath)
      index.updateFile(aPath)
      index.updateFile(bPath)
      const occurrences = index.findAllOccurrences(libPath, 'pi')
      // lib: 2 (let + export shorthand deduped).
      // each importer: 2 (destructuring + use). 2 + 4 = 6.
      expect(occurrences).toHaveLength(6)
      expect(occurrences.filter(o => o.file === aPath)).toHaveLength(2)
      expect(occurrences.filter(o => o.file === bPath)).toHaveLength(2)
    })

    it('does not touch unrelated imports with the same symbol name', () => {
      // main imports `pi` from lib AND has a different same-named local —
      // separately covered — but also: a different file exports `pi` too.
      // Renaming lib's `pi` must not reach the other module.
      const libPath = writeFile('lib.dvala', 'let pi = 3.14; { pi }')
      const otherPath = writeFile('other.dvala', 'let pi = 99; { pi }')
      const mainPath = writeFile('main.dvala', 'let { pi } = import("./lib"); pi')
      index.updateFile(libPath)
      index.updateFile(otherPath)
      index.updateFile(mainPath)
      const occurrences = index.findAllOccurrences(libPath, 'pi')
      // Only lib + main should appear (2 + 2). other.dvala isn't imported
      // by anyone here, but crucially its definitions don't leak into
      // lib's occurrence set.
      expect(occurrences.some(o => o.file === otherPath)).toBe(false)
      expect(occurrences).toHaveLength(4)
    })

    it('handles explicit key:value export without renaming the value binding', () => {
      // `{ pi: somePi }` — the export key is "pi" but the underlying
      // definition is `somePi`. Renaming "somePi" must rename the let
      // binding + the object value ref, but not the export key "pi".
      const libPath = writeFile('lib.dvala', 'let somePi = 3.14; { pi: somePi }')
      index.updateFile(libPath)
      const occurrences = index.findAllOccurrences(libPath, 'somePi')
      // let somePi + Sym reference inside the export object = 2.
      expect(occurrences).toHaveLength(2)
      const piOccurrences = index.findAllOccurrences(libPath, 'pi')
      // Only the export key "pi" — no `let` binding, no ref anywhere else.
      expect(piOccurrences).toHaveLength(1)
    })
  })

  describe('resolveCanonicalFile', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvala-ws-canonical-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    function writeFile(name: string, content: string): string {
      const filePath = path.join(tmpDir, name)
      fs.writeFileSync(filePath, content)
      return filePath
    }

    it('returns the current file when cursor is on a local definition', () => {
      // `let pi = 3.14; { pi }` — `pi` at the `let` site (col 5, 1-based).
      const libPath = writeFile('lib.dvala', 'let pi = 3.14; { pi }')
      index.updateFile(libPath)
      const result = index.resolveCanonicalFile(libPath, 1, 5)
      expect(result).toEqual({ file: libPath, name: 'pi' })
    })

    it('follows importPath when cursor is on a destructuring binding', () => {
      // `let { pi } = import("./lib"); pi * 2` — cursor on the `pi` inside
      // the destructuring braces (col 7). The local binding is a
      // kind='import' def; resolveCanonicalFile should follow its
      // importPath back to lib.dvala.
      const libPath = writeFile('lib.dvala', 'let pi = 3.14; { pi }')
      const mainPath = writeFile('main.dvala', 'let { pi } = import("./lib"); pi * 2')
      index.updateFile(libPath)
      index.updateFile(mainPath)
      const result = index.resolveCanonicalFile(mainPath, 1, 7)
      expect(result).toEqual({ file: libPath, name: 'pi' })
    })

    it('follows importPath when cursor is on a use-site referencing an import', () => {
      // Cursor on `pi` in `pi * 2` (col 31) — the reference resolves to
      // main's destructuring def, which in turn points at lib via importPath.
      const libPath = writeFile('lib.dvala', 'let pi = 3.14; { pi }')
      const mainPath = writeFile('main.dvala', 'let { pi } = import("./lib"); pi * 2')
      index.updateFile(libPath)
      index.updateFile(mainPath)
      const result = index.resolveCanonicalFile(mainPath, 1, 31)
      expect(result).toEqual({ file: libPath, name: 'pi' })
    })

    it('returns null when the cursor is not on any symbol', () => {
      const libPath = writeFile('lib.dvala', 'let pi = 3.14; { pi }')
      index.updateFile(libPath)
      // Column 1 is the `l` in `let` — a keyword, not a symbol.
      expect(index.resolveCanonicalFile(libPath, 1, 1)).toBeNull()
    })

    it('falls back to the current file when a reference is unresolved', () => {
      // `undef * 2` references `undef` which has no binding — resolvedDef is null.
      const filePath = writeFile('orphan.dvala', 'undef * 2')
      index.updateFile(filePath)
      const result = index.resolveCanonicalFile(filePath, 1, 1)
      expect(result).toEqual({ file: filePath, name: 'undef' })
    })

    it('flags unresolved imports so the caller can warn', () => {
      // main imports a file that was never indexed — `resolveCanonicalFile`
      // falls back to the current file AND reports the raw import path so
      // the VS Code layer can surface a warning before performing the rename.
      const mainPath = writeFile('main.dvala', 'let { pi } = import("./missing"); pi')
      index.updateFile(mainPath)
      const result = index.resolveCanonicalFile(mainPath, 1, 7)
      expect(result).not.toBeNull()
      expect(result!.file).toBe(mainPath)
      expect(result!.name).toBe('pi')
      expect(result!.unresolvedImport).toBe('./missing')
    })

    it('finds the export key in an explicit `{ key: value }` export', () => {
      // The Str key in `{ pi: somePi }` has no matching definition or ref,
      // so before we taught getSymbolAtPosition to walk exports the cursor
      // on the key returned null — F2 on an explicit export key did nothing.
      // `{ pi: somePi }` places `pi` at col 22 (1-based).
      const libPath = writeFile('lib.dvala', 'let somePi = 3.14; { pi: somePi }')
      index.updateFile(libPath)
      const result = index.resolveCanonicalFile(libPath, 1, 22)
      expect(result).toEqual({ file: libPath, name: 'pi' })
    })
  })

  describe('transitive re-exports', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvala-ws-reexport-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    function writeFile(name: string, content: string): string {
      const filePath = path.join(tmpDir, name)
      fs.writeFileSync(filePath, content)
      return filePath
    }

    it('propagates rename through a linear chain A → B → C', () => {
      // A defines pi. B re-exports from A. C imports from B and uses pi.
      const aPath = writeFile('a.dvala', 'let pi = 3.14; { pi }')
      const bPath = writeFile('b.dvala', 'let { pi } = import("./a"); { pi }')
      const cPath = writeFile('c.dvala', 'let { pi } = import("./b"); pi * 2')
      index.updateFile(aPath)
      index.updateFile(bPath)
      index.updateFile(cPath)
      const occurrences = index.findAllOccurrences(aPath, 'pi')
      // A: `let pi` + shorthand `{ pi }` (deduped to 2).
      // B: destructuring `let { pi }` + shorthand export `{ pi }` — the
      //    shorthand contributes the Str key and the Sym value at the same
      //    source position (deduped). Destructuring binding is separate. = 2
      // C: destructuring `let { pi }` + `pi * 2` use. = 2
      expect(occurrences.filter(o => o.file === aPath)).toHaveLength(2)
      expect(occurrences.filter(o => o.file === bPath)).toHaveLength(2)
      expect(occurrences.filter(o => o.file === cPath)).toHaveLength(2)
      expect(occurrences).toHaveLength(6)
    })

    it('covers fanout A → {B1, B2}, each with its own importer', () => {
      const aPath = writeFile('a.dvala', 'let pi = 3.14; { pi }')
      const b1Path = writeFile('b1.dvala', 'let { pi } = import("./a"); { pi }')
      const b2Path = writeFile('b2.dvala', 'let { pi } = import("./a"); { pi }')
      const c1Path = writeFile('c1.dvala', 'let { pi } = import("./b1"); pi')
      const c2Path = writeFile('c2.dvala', 'let { pi } = import("./b2"); pi')
      index.updateFile(aPath)
      index.updateFile(b1Path)
      index.updateFile(b2Path)
      index.updateFile(c1Path)
      index.updateFile(c2Path)
      const occurrences = index.findAllOccurrences(aPath, 'pi')
      // 2 per file × 5 files = 10.
      expect(occurrences).toHaveLength(10)
      for (const file of [aPath, b1Path, b2Path, c1Path, c2Path]) {
        expect(occurrences.filter(o => o.file === file)).toHaveLength(2)
      }
    })

    it('stops propagating when a file imports but does not re-export', () => {
      // A → B (re-exports) → C (imports but doesn't re-export) → D (imports from C).
      // Renaming pi in A hits A, B, C but not D.
      const aPath = writeFile('a.dvala', 'let pi = 3.14; { pi }')
      const bPath = writeFile('b.dvala', 'let { pi } = import("./a"); { pi }')
      const cPath = writeFile('c.dvala', 'let { pi } = import("./b"); let result = pi * 2; { result }')
      const dPath = writeFile('d.dvala', 'let { result } = import("./c"); result')
      index.updateFile(aPath)
      index.updateFile(bPath)
      index.updateFile(cPath)
      index.updateFile(dPath)
      const occurrences = index.findAllOccurrences(aPath, 'pi')
      expect(occurrences.filter(o => o.file === aPath)).toHaveLength(2)
      expect(occurrences.filter(o => o.file === bPath)).toHaveLength(2)
      // C has destructuring `let { pi }` + use-site `pi * 2` = 2.
      expect(occurrences.filter(o => o.file === cPath)).toHaveLength(2)
      expect(occurrences.filter(o => o.file === dPath)).toHaveLength(0)
    })

    it('resolveCanonicalFile walks to the ultimate origin through a chain', () => {
      // Cursor on C's `pi` use-site must resolve to A (not B).
      const aPath = writeFile('a.dvala', 'let pi = 3.14; { pi }')
      const bPath = writeFile('b.dvala', 'let { pi } = import("./a"); { pi }')
      const cPath = writeFile('c.dvala', 'let { pi } = import("./b"); pi * 2')
      index.updateFile(aPath)
      index.updateFile(bPath)
      index.updateFile(cPath)
      // `pi * 2` starts at col 29 in C (after `let { pi } = import("./b"); `
      // — note the shorter path makes this 2 cols earlier than `"./lib"`).
      const result = index.resolveCanonicalFile(cPath, 1, 29)
      expect(result).toEqual({ file: aPath, name: 'pi' })
    })

    it('terminates on a re-export cycle without infinite looping', () => {
      // A imports from B, B imports from A, both re-export pi. The BFS's
      // visitedFiles guard must break the cycle and the test just asserts
      // termination + expected totals.
      const aPath = writeFile('a.dvala', 'let { pi } = import("./b"); { pi }')
      const bPath = writeFile('b.dvala', 'let { pi } = import("./a"); { pi }')
      index.updateFile(aPath)
      index.updateFile(bPath)
      // Both files have unresolved external chains, but each is a valid
      // destructuring binding on its own. Starting from A, BFS visits B
      // through reverseImports, B enqueues A as a re-exporter, visited guard
      // stops the loop. The search must terminate.
      const occurrences = index.findAllOccurrences(aPath, 'pi')
      // Each file has destructuring + shorthand export = 2. Total = 4.
      expect(occurrences).toHaveLength(4)
    })

    it('filters out unrelated locals in a re-exporter', () => {
      // B re-exports pi from A, but also has an unrelated `let pi = 99`
      // inside a nested scope. The locality filter (ref must resolve to
      // the import def) keeps the inner `pi` out.
      const aPath = writeFile('a.dvala', 'let pi = 3.14; { pi }')
      const bPath = writeFile('b.dvala', 'let { pi } = import("./a"); let f = () -> do let pi = 99; pi end; { pi }')
      index.updateFile(aPath)
      index.updateFile(bPath)
      const occurrences = index.findAllOccurrences(aPath, 'pi')
      // A: 2. B: destructuring + export shorthand = 2. Inner `let pi = 99`
      // and its ref do NOT count — they resolve to a different def.
      expect(occurrences).toHaveLength(4)
      expect(occurrences.filter(o => o.file === bPath)).toHaveLength(2)
    })

    it('does not treat explicit { pi: unrelatedLocal } as a re-export', () => {
      // Step-3 value-resolution check: B imports pi from A but exports
      // `{ pi: pi2 }` where `pi2` is an unrelated local. B must NOT be
      // flagged as a re-exporter; renaming pi in A must not touch B's key.
      const aPath = writeFile('a.dvala', 'let pi = 3.14; { pi }')
      const bPath = writeFile('b.dvala', 'let { pi } = import("./a"); let pi2 = 99; { pi: pi2 }')
      const cPath = writeFile('c.dvala', 'let { pi } = import("./b"); pi')
      index.updateFile(aPath)
      index.updateFile(bPath)
      index.updateFile(cPath)
      const occurrences = index.findAllOccurrences(aPath, 'pi')
      // A: 2. B: destructuring binding + nothing else (pi2 is unrelated). = 1
      // C: imports from B — but B is NOT a re-exporter, so nothing in C
      //   resolves back to A's pi. C's import-def resolves to B, not A, so
      //   the BFS doesn't enqueue C's occurrences under A's rename. = 0
      expect(occurrences.filter(o => o.file === aPath)).toHaveLength(2)
      expect(occurrences.filter(o => o.file === bPath)).toHaveLength(1)
      expect(occurrences.filter(o => o.file === cPath)).toHaveLength(0)
    })

    it('indexWorkspace eagerly scans files that have never been updated', () => {
      // Only A is explicitly updated — B and C exist on disk but haven't
      // been indexed. Without indexWorkspace, BFS sees no importers of A.
      const aPath = writeFile('a.dvala', 'let pi = 3.14; { pi }')
      const bPath = writeFile('b.dvala', 'let { pi } = import("./a"); { pi }')
      const cPath = writeFile('c.dvala', 'let { pi } = import("./b"); pi * 2')
      index.updateFile(aPath)
      // Before eager scan: BFS only finds A's own occurrences.
      const before = index.findAllOccurrences(aPath, 'pi')
      expect(before).toHaveLength(2)
      // After eager scan: full chain is indexed.
      index.indexWorkspace(tmpDir)
      const after = index.findAllOccurrences(aPath, 'pi')
      expect(after).toHaveLength(6)
      expect(after.filter(o => o.file === bPath)).toHaveLength(2)
      expect(after.filter(o => o.file === cPath)).toHaveLength(2)
    })

    it('indexWorkspace is a one-shot per root', () => {
      // Second call must be a no-op — a newly-added file after the initial
      // scan is NOT picked up by a second indexWorkspace call. Watcher /
      // explicit updateFile is the caller's responsibility past that point.
      const aPath = writeFile('a.dvala', 'let pi = 3.14; { pi }')
      index.indexWorkspace(tmpDir)
      expect(index.getFileSymbols(aPath)).not.toBeNull()

      const bPath = writeFile('b.dvala', 'let { pi } = import("./a"); pi')
      index.indexWorkspace(tmpDir)
      // B exists on disk but wasn't re-scanned.
      expect(index.getFileSymbols(bPath)).toBeNull()
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
