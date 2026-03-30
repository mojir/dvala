import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { bundle } from '../src/bundler'
import { expandMacros } from '../src/ast/expandMacros'
import { serializeBundle, deserializeBundle } from '../src/bundler/serialize'
import { findConfig } from '../src/config'

const exampleProjectDir = path.resolve(__dirname, '../examples/project')

describe('build pipeline', () => {
  it('finds dvala.json in example project', () => {
    const resolved = findConfig(exampleProjectDir)
    expect(resolved).not.toBeNull()
    expect(resolved!.rootDir).toBe(exampleProjectDir)
    expect(resolved!.config.entry).toBe('main.dvala')
  })

  it('bundles example project', () => {
    const resolved = findConfig(exampleProjectDir)!
    const entryPath = path.resolve(resolved.rootDir, resolved.config.entry)
    const result = bundle(entryPath)

    expect(result.version).toBe(1)
    expect(result.ast.body.length).toBeGreaterThan(1)
    expect(result.ast.sourceMap).toBeDefined()
  })

  it('bundled example project is evaluable', () => {
    const resolved = findConfig(exampleProjectDir)!
    const entryPath = path.resolve(resolved.rootDir, resolved.config.entry)
    const result = bundle(entryPath)

    const dvala = createDvala()
    const output = dvala.run(result) as Record<string, number>
    expect(output.avg).toBe(5)
    expect(output.clamped).toBe(5)
    expect(output.interpolated).toBeCloseTo(1.5708, 3)
  })

  it('macro expansion does not break the bundle', () => {
    const resolved = findConfig(exampleProjectDir)!
    const entryPath = path.resolve(resolved.rootDir, resolved.config.entry)
    const result = bundle(entryPath)
    const expanded = { ...result, ast: expandMacros(result.ast) }

    const dvala = createDvala()
    const output = dvala.run(expanded) as Record<string, number>
    expect(output.avg).toBe(5)
    expect(output.clamped).toBe(5)
  })

  it('serialize → deserialize round-trip produces runnable bundle', () => {
    const resolved = findConfig(exampleProjectDir)!
    const entryPath = path.resolve(resolved.rootDir, resolved.config.entry)
    const result = bundle(entryPath)

    const json = serializeBundle(result)
    const parsed = JSON.parse(json)
    const restored = deserializeBundle(parsed)

    expect(restored).not.toBeNull()
    const dvala = createDvala()
    const output = dvala.run(restored!) as Record<string, number>
    expect(output.avg).toBe(5)
  })

  it('--no-sourcemap produces bundle without source map', () => {
    const resolved = findConfig(exampleProjectDir)!
    const entryPath = path.resolve(resolved.rootDir, resolved.config.entry)
    const result = bundle(entryPath, { sourceMap: false })

    expect(result.ast.sourceMap).toBeUndefined()

    // Still runnable
    const dvala = createDvala()
    const output = dvala.run(result) as Record<string, number>
    expect(output.avg).toBe(5)
  })

  it('build config defaults are applied', () => {
    const resolved = findConfig(exampleProjectDir)!
    expect(resolved.config.build.expandMacros).toBe(true)
    expect(resolved.config.build.sourceMap).toBe(true)
  })
})
