import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundle } from '../../src/bundler'
import { isDvalaBundle } from '../../src/bundler/interface'
import type { DvalaBundle } from '../../src/bundler/interface'
import { Dvala } from '../../src/Dvala/Dvala'

const fixturesDir = path.resolve(__dirname, 'fixtures')

describe('bundle', () => {
  it('bundles a simple file with no imports', () => {
    const result = bundle(path.join(fixturesDir, 'no-imports.dvala'))

    expect(isDvalaBundle(result)).toBe(true)
    expect(result.program).toBe('1 + 2 + 3\n')
    expect(result.fileModules).toEqual([])
  })

  it('bundles a file with a single import', () => {
    const result = bundle(path.join(fixturesDir, 'main.dvala'))

    expect(isDvalaBundle(result)).toBe(true)
    expect(result.fileModules).toHaveLength(2) // math-helpers + constants

    // File modules should be in dependency order
    const moduleNames = result.fileModules.map(([name]) => name)
    expect(moduleNames).toContain('lib/math-helpers')
    expect(moduleNames).toContain('lib/constants')

    // Program should have rewritten imports (bare symbols, not strings)
    expect(result.program).toContain('import(lib/math-helpers)')
    expect(result.program).toContain('import(lib/constants)')
    expect(result.program).not.toContain('import("')
  })

  it('bundles multiple imports', () => {
    const result = bundle(path.join(fixturesDir, 'multi-import.dvala'))

    expect(result.fileModules).toHaveLength(3) // math-helpers, names, constants
    const moduleNames = result.fileModules.map(([name]) => name)
    expect(moduleNames).toContain('lib/math-helpers')
    expect(moduleNames).toContain('lib/names')
    expect(moduleNames).toContain('lib/constants')
  })

  it('deduplicates shared dependencies (diamond)', () => {
    const result = bundle(path.join(fixturesDir, 'diamond.dvala'))

    // shared.dvala should appear only once even though both dep-a and dep-b import it
    const moduleNames = result.fileModules.map(([name]) => name)
    const sharedCount = moduleNames.filter(n => n.includes('shared')).length
    expect(sharedCount).toBe(1)

    // shared must come before dep-a and dep-b in the array
    const sharedIdx = moduleNames.indexOf('lib/shared')
    const depAIdx = moduleNames.indexOf('lib/dep-a')
    const depBIdx = moduleNames.indexOf('lib/dep-b')
    expect(sharedIdx).toBeLessThan(depAIdx)
    expect(sharedIdx).toBeLessThan(depBIdx)
  })

  it('detects circular dependencies', () => {
    expect(() => bundle(path.join(fixturesDir, 'circular-a.dvala')))
      .toThrow(/[Cc]ircular dependency/)
  })

  it('avoids name collision with builtin module names', () => {
    const result = bundle(path.join(fixturesDir, 'import-math.dvala'))

    // math.dvala at root would naturally get name "math", which collides with builtin
    const moduleNames = result.fileModules.map(([name]) => name)
    expect(moduleNames).toHaveLength(1)
    // Should have a modified name, not "math"
    const mathModule = moduleNames[0]!
    expect(mathModule).not.toBe('math')
    // The program should reference the adjusted name
    expect(result.program).toContain(`import(${mathModule})`)
  })

  it('throws on missing file', () => {
    expect(() => bundle(path.join(fixturesDir, 'nonexistent.dvala')))
      .toThrow(/[Ff]ile not found/)
  })

  it('handles single-quoted import paths', () => {
    const result = bundle(path.join(fixturesDir, 'single-quote-import.dvala'))
    expect(result.fileModules).toHaveLength(1)
    expect(result.fileModules[0]![0]).toBe('lib/constants')
    expect(result.program).toContain('import(lib/constants)')
  })

  it('derives canonical name for a file outside the entry directory', () => {
    // subdir/entry.dvala imports ../lib/constants.dvala which is outside subdir/
    const result = bundle(path.join(fixturesDir, 'subdir', 'entry.dvala'))
    const moduleNames = result.fileModules.map(([name]) => name)
    // lib/constants.dvala has a relative path starting with ".." from subdir/,
    // so the fallback (last 2 path segments) is used: "lib/constants"
    expect(moduleNames).toContain('lib/constants')
  })

  it('derives canonical name for a file without .dvala extension', () => {
    // import-plain.dvala imports plain.txt (no .dvala extension)
    const result = bundle(path.join(fixturesDir, 'import-plain.dvala'))
    const moduleNames = result.fileModules.map(([name]) => name)
    // stripExtension does not strip non-.dvala extensions
    expect(moduleNames).toContain('plain.txt')
  })

  it('produces a JSON-serializable bundle', () => {
    const result = bundle(path.join(fixturesDir, 'main.dvala'))
    const serialized = JSON.stringify(result)
    const deserialized = JSON.parse(serialized) as DvalaBundle
    expect(isDvalaBundle(deserialized)).toBe(true)
    expect(deserialized.program).toBe(result.program)
    expect(deserialized.fileModules).toEqual(result.fileModules)
  })
})

describe('isDvalaBundle', () => {
  it('returns true for valid bundles', () => {
    expect(isDvalaBundle({ program: '', fileModules: [] })).toBe(true)
    expect(isDvalaBundle({ program: 'code', fileModules: [['name', 'source']] })).toBe(true)
  })

  it('returns false for non-bundles', () => {
    expect(isDvalaBundle(null)).toBe(false)
    expect(isDvalaBundle(undefined)).toBe(false)
    expect(isDvalaBundle('string')).toBe(false)
    expect(isDvalaBundle(42)).toBe(false)
    expect(isDvalaBundle({})).toBe(false)
    expect(isDvalaBundle({ program: 'code' })).toBe(false)
    expect(isDvalaBundle({ fileModules: [] })).toBe(false)
  })
})

describe('dvala.run with DvalaBundle', () => {
  const dvala = new Dvala()

  it('runs a bundle with no file modules', () => {
    const result = dvala.run({
      program: '1 + 2 + 3',
      fileModules: [],
    })
    expect(result).toBe(6)
  })

  it('runs a bundle with a value module (number)', () => {
    const result = dvala.run({
      program: 'let x = import(my-const); x + 1',
      fileModules: [['my-const', '42']],
    })
    expect(result).toBe(43)
  })

  it('runs a bundle with a value module (object with functions)', () => {
    const result = dvala.run({
      program: 'let { add } = import(helpers); add(3, 4)',
      fileModules: [['helpers', 'let add = (a, b) -> a + b; {"add": add}']],
    })
    expect(result).toBe(7)
  })

  it('runs a bundle with a value module (array)', () => {
    const result = dvala.run({
      program: 'let names = import(names); names[1]',
      fileModules: [['names', '["alice", "bob"]']],
    })
    expect(result).toBe('bob')
  })

  it('runs a bundle with multiple file modules in dependency order', () => {
    const result = dvala.run({
      program: 'let a = import(dep-a); let b = import(dep-b); a + b',
      fileModules: [
        ['base', '10'],
        ['dep-a', 'let b = import(base); b + 1'],
        ['dep-b', 'let b = import(base); b + 2'],
      ],
    })
    expect(result).toBe(23) // (10+1) + (10+2)
  })

  it('runs a bundled file end-to-end', () => {
    const b = bundle(path.join(fixturesDir, 'main.dvala'))
    const result = dvala.run(b)
    expect(result).toBe(50) // add(42, 8) = 50
  })

  it('runs diamond dependency end-to-end', () => {
    const b = bundle(path.join(fixturesDir, 'diamond.dvala'))
    const result = dvala.run(b)
    expect(result).toBe(203) // (100+1) + (100+2) = 203
  })

  it('runs multi-import end-to-end', () => {
    const b = bundle(path.join(fixturesDir, 'multi-import.dvala'))
    const result = dvala.run(b) as Record<string, unknown>
    expect(result).toEqual({
      sum: 50, // add(42, 8)
      firstName: 'alice',
      count: 3,
    })
  })

  it('runs a bundle with async.run', async () => {
    const result = await dvala.async.run({
      program: 'let x = import(my-const); x + 1',
      fileModules: [['my-const', '99']],
    })
    expect(result).toBe(100)
  })

  it('throws TypeError when a file module evaluation returns a Promise', () => {
    const asyncFn = async () => 42
    expect(() => dvala.run({
      program: 'import(my-module)',
      fileModules: [['my-module', 'asyncFn()']],
    }, { bindings: { asyncFn } })).toThrow()
  })

  it('throws TypeError when the main program evaluation returns a Promise', () => {
    const asyncFn = async () => 42
    expect(() => dvala.run({
      program: 'asyncFn()',
      fileModules: [],
    }, { bindings: { asyncFn } })).toThrow(TypeError)
  })
})
