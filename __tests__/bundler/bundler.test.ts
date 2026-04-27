import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundle } from '../../src/bundler'
import { isDvalaBundle } from '../../src/bundler/interface'
import { serializeBundle, deserializeBundle } from '../../src/bundler/serialize'
import { createDvala } from '../../src/createDvala'

const fixturesDir = path.resolve(__dirname, 'fixtures')

describe('bundle', () => {
  it('bundles a simple file with no imports', () => {
    const result = bundle(path.join(fixturesDir, 'no-imports.dvala'))

    expect(isDvalaBundle(result)).toBe(true)
    expect(result.version).toBe(1)
    expect(result.ast.body.length).toBeGreaterThan(0)
  })

  it('bundles a file with imports and produces a runnable AST', () => {
    const result = bundle(path.join(fixturesDir, 'main.dvala'))

    expect(isDvalaBundle(result)).toBe(true)
    // The AST should contain inlined module let bindings + the program body
    expect(result.ast.body.length).toBeGreaterThan(1)
    // Should include source map
    expect(result.ast.sourceMap).toBeDefined()
    expect(result.ast.sourceMap!.sources.length).toBeGreaterThanOrEqual(2)
  })

  it('bundled AST is directly evaluable', () => {
    const result = bundle(path.join(fixturesDir, 'main.dvala'))
    const dvala = createDvala()
    // main.dvala imports math-helpers and constants, computes add(answer, 8)
    const output = dvala.run(result)
    expect(output).toBe(50) // 42 + 8
  })

  it('deduplicates shared dependencies (diamond)', () => {
    const result = bundle(path.join(fixturesDir, 'diamond.dvala'))
    // Should be runnable without errors (shared.dvala inlined once)
    const dvala = createDvala()
    const output = dvala.run(result)
    expect(output).toBeDefined()
  })

  it('detects circular dependencies', () => {
    expect(() => bundle(path.join(fixturesDir, 'circular-a.dvala'))).toThrow(/[Cc]ircular dependency/)
  })

  it('throws on missing file', () => {
    expect(() => bundle(path.join(fixturesDir, 'nonexistent.dvala'))).toThrow(/[Ff]ile not found/)
  })

  it('handles single-quoted import paths', () => {
    const result = bundle(path.join(fixturesDir, 'single-quote-import.dvala'))
    // Should produce a runnable bundle
    const dvala = createDvala()
    const output = dvala.run(result)
    expect(output).toBe(43) // constants.dvala returns 42, then 42 + 1
  })

  it('supports --no-sourcemap option', () => {
    const withMap = bundle(path.join(fixturesDir, 'main.dvala'), { sourceMap: true })
    const withoutMap = bundle(path.join(fixturesDir, 'main.dvala'), { sourceMap: false })

    expect(withMap.ast.sourceMap).toBeDefined()
    expect(withoutMap.ast.sourceMap).toBeUndefined()

    // Both should still be runnable
    const dvala = createDvala()
    expect(dvala.run(withMap)).toBe(50)
    expect(dvala.run(withoutMap)).toBe(50)
  })

  it('serializes and deserializes correctly', () => {
    const result = bundle(path.join(fixturesDir, 'main.dvala'))
    const json = serializeBundle(result)
    const parsed = JSON.parse(json)
    const restored = deserializeBundle(parsed)

    expect(restored).not.toBeNull()
    expect(restored!.version).toBe(1)
    expect(restored!.ast.body.length).toBe(result.ast.body.length)

    // Deserialized bundle should be runnable
    const dvala = createDvala()
    expect(dvala.run(restored!)).toBe(50)
  })

  it('serializes a bundle without a sourceMap', () => {
    const result = bundle(path.join(fixturesDir, 'no-imports.dvala'), { sourceMap: false })
    expect(result.ast.sourceMap).toBeUndefined()
    const json = serializeBundle(result)
    const parsed = JSON.parse(json)
    expect(parsed.ast.sourceMap).toBeUndefined()
    const restored = deserializeBundle(parsed)
    expect(restored).not.toBeNull()
    expect(restored!.ast.sourceMap).toBeUndefined()
  })
})

describe('deserializeBundle', () => {
  it('returns null for non-object input', () => {
    expect(deserializeBundle(null)).toBeNull()
    expect(deserializeBundle(undefined)).toBeNull()
    expect(deserializeBundle(42)).toBeNull()
    expect(deserializeBundle('str')).toBeNull()
    expect(deserializeBundle(true)).toBeNull()
  })

  it('returns null for wrong version', () => {
    expect(deserializeBundle({ version: 2, ast: { body: [] } })).toBeNull()
    expect(deserializeBundle({ version: 0, ast: { body: [] } })).toBeNull()
    expect(deserializeBundle({ ast: { body: [] } })).toBeNull()
  })

  it('returns null when ast or ast.body is invalid', () => {
    expect(deserializeBundle({ version: 1 })).toBeNull()
    expect(deserializeBundle({ version: 1, ast: null })).toBeNull()
    expect(deserializeBundle({ version: 1, ast: {} })).toBeNull()
    expect(deserializeBundle({ version: 1, ast: { body: 'not-an-array' } })).toBeNull()
  })

  it('returns a bundle without sourceMap when sourceMap field is missing or malformed', () => {
    // No sourceMap field at all
    const bundleNoMap = deserializeBundle({ version: 1, ast: { body: [] } })
    expect(bundleNoMap).not.toBeNull()
    expect(bundleNoMap!.ast.sourceMap).toBeUndefined()

    // Malformed sourceMap (missing required arrays) — falls through to no sourceMap
    const bundleMalformed = deserializeBundle({ version: 1, ast: { body: [], sourceMap: { sources: 'bad' } } })
    expect(bundleMalformed).not.toBeNull()
    expect(bundleMalformed!.ast.sourceMap).toBeUndefined()
  })
})

describe('isDvalaBundle', () => {
  it('returns true for valid bundles', () => {
    expect(isDvalaBundle({ version: 1, ast: { body: [] } })).toBe(true)
    expect(isDvalaBundle({ version: 1, ast: { body: [['Num', 42, 0]] } })).toBe(true)
  })

  it('returns false for non-bundles', () => {
    expect(isDvalaBundle(null)).toBe(false)
    expect(isDvalaBundle(undefined)).toBe(false)
    expect(isDvalaBundle('string')).toBe(false)
    expect(isDvalaBundle(42)).toBe(false)
    expect(isDvalaBundle({})).toBe(false)
    expect(isDvalaBundle({ version: 1 })).toBe(false)
    expect(isDvalaBundle({ version: 2, ast: { body: [] } })).toBe(false)
    // Old format should not match
    expect(isDvalaBundle({ program: 'code', fileModules: [] })).toBe(false)
  })
})
