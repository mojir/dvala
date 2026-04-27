import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { indexWorkspace, loadFile, nodeResolveImport } from './nodeWorkspaceIndexer'
import { WorkspaceIndex } from './WorkspaceIndex'

describe('nodeWorkspaceIndexer', () => {
  let tmpDir: string
  let index: WorkspaceIndex

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvala-node-indexer-'))
    index = new WorkspaceIndex()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeFile(name: string, content: string): string {
    const filePath = path.join(tmpDir, name)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content)
    return filePath
  }

  describe('loadFile', () => {
    it('reads a file from disk and indexes it', () => {
      const filePath = writeFile('a.dvala', 'let x = 42; x')
      const result = loadFile(index, filePath)
      expect(result).not.toBeNull()
      expect(result!.definitions.find(d => d.name === 'x')).toBeDefined()
    })

    it('returns null and clears the cache for a missing file', () => {
      const missing = path.join(tmpDir, 'nonexistent.dvala')
      // Seed the cache so we can verify invalidation happens.
      index.updateFile(missing, 'let x = 1')
      expect(index.getFileSymbols(missing)).not.toBeNull()
      const result = loadFile(index, missing)
      expect(result).toBeNull()
      expect(index.getFileSymbols(missing)).toBeNull()
    })

    it('resolves cross-file imports via nodeResolveImport', () => {
      const libPath = writeFile('lib.dvala', 'let pi = 3.14; { pi }')
      const mainPath = writeFile('main.dvala', 'let { pi } = import("./lib"); pi * 2')
      loadFile(index, libPath)
      loadFile(index, mainPath)
      const mainSymbols = index.getFileSymbols(mainPath)!
      expect([...mainSymbols.imports.values()]).toContain(libPath)
    })
  })

  describe('nodeResolveImport', () => {
    it('returns the path verbatim when the file already exists with that exact name', () => {
      const filePath = writeFile('exact.dvala', '')
      expect(nodeResolveImport('./exact.dvala', tmpDir)).toBe(filePath)
    })

    it('falls back to appending .dvala when the bare path is missing', () => {
      const filePath = writeFile('appended.dvala', '')
      expect(nodeResolveImport('./appended', tmpDir)).toBe(filePath)
    })

    it('returns null when neither variant exists', () => {
      expect(nodeResolveImport('./does-not-exist', tmpDir)).toBeNull()
    })
  })

  describe('indexWorkspace', () => {
    it('indexes every .dvala file recursively under the root', () => {
      const a = writeFile('a.dvala', 'let a = 1')
      const b = writeFile('nested/b.dvala', 'let b = 2')
      indexWorkspace(index, tmpDir)
      expect(index.getFileSymbols(a)).not.toBeNull()
      expect(index.getFileSymbols(b)).not.toBeNull()
    })

    it('skips node_modules and dot-prefixed directories', () => {
      const visible = writeFile('visible.dvala', 'let v = 1')
      const ignored = writeFile('node_modules/x.dvala', 'let x = 1')
      const dotted = writeFile('.hidden/y.dvala', 'let y = 1')
      indexWorkspace(index, tmpDir)
      expect(index.getFileSymbols(visible)).not.toBeNull()
      expect(index.getFileSymbols(ignored)).toBeNull()
      expect(index.getFileSymbols(dotted)).toBeNull()
    })

    it('is a no-op when the root does not exist', () => {
      const ghostRoot = path.join(tmpDir, 'ghost-root-that-does-not-exist')
      expect(() => indexWorkspace(index, ghostRoot)).not.toThrow()
    })
  })
})
