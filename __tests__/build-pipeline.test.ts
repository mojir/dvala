import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { bundle } from '../src/bundler'
import { expandMacros } from '../src/ast/expandMacros'
import { treeShake } from '../src/ast/treeShake'
import { serializeBundle, deserializeBundle } from '../src/bundler/serialize'
import { findConfig } from '../src/config'
import { parseToAst } from '../src/parser'
import { tokenize } from '../src/tokenizer/tokenize'
import { minifyTokenStream } from '../src/tokenizer/minifyTokenStream'

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
    const raw = dvala.run(result) as Record<string, unknown>
    const output = raw.result as Record<string, number>
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
    const raw = dvala.run(expanded) as Record<string, unknown>
    const output = raw.result as Record<string, number>
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
    const raw = dvala.run(restored!) as Record<string, unknown>
    const output = raw.result as Record<string, number>
    expect(output.avg).toBe(5)
  })

  it('--no-sourcemap produces bundle without source map', () => {
    const resolved = findConfig(exampleProjectDir)!
    const entryPath = path.resolve(resolved.rootDir, resolved.config.entry)
    const result = bundle(entryPath, { sourceMap: false })

    expect(result.ast.sourceMap).toBeUndefined()

    // Still runnable
    const dvala = createDvala()
    const raw = dvala.run(result) as Record<string, unknown>
    const output = raw.result as Record<string, number>
    expect(output.avg).toBe(5)
  })

  it('build config defaults are applied', () => {
    const resolved = findConfig(exampleProjectDir)!
    expect(resolved.config.build.expandMacros).toBe(true)
    expect(resolved.config.build.sourceMap).toBe(true)
  })

  it('macro expansion expands macro calls in bundled output', () => {
    const resolved = findConfig(exampleProjectDir)!
    const entryPath = path.resolve(resolved.rootDir, resolved.config.entry)
    const bundled = bundle(entryPath)
    const expanded = { ...bundled, ast: expandMacros(bundled.ast) }

    // The expanded bundle should have no macro Call nodes for "double" or "withDefault"
    const json = JSON.stringify(expanded.ast.body)
    // "double" and "withDefault" should not appear as Call targets (Sym references in Call nodes)
    // but may still appear as Let binding names (definitions are kept)
    expect(json).not.toContain('"Call",[["Sym","double"')
    expect(json).not.toContain('"Call",[["Sym","withDefault"')

    // The expanded bundle is still runnable and produces correct results
    const dvala = createDvala()
    const raw = dvala.run(expanded) as Record<string, unknown>
    const output = raw.result as Record<string, number>
    expect(output.doubled).toBe(10) // double(5) → 5 + 5
    expect(output.safe).toBe(42) // withDefault(null, 42) → if isNull(null) then 42 else null end
  })

  it('without macro expansion, macro calls remain in AST', () => {
    const resolved = findConfig(exampleProjectDir)!
    const entryPath = path.resolve(resolved.rootDir, resolved.config.entry)
    const bundled = bundle(entryPath)

    // Without expansion, the AST should contain Macro nodes
    const json = JSON.stringify(bundled.ast.body)
    expect(json).toContain('"Macro"')

    // Still runnable (macros expand at runtime)
    const dvala = createDvala()
    const raw = dvala.run(bundled) as Record<string, unknown>
    const output = raw.result as Record<string, number>
    expect(output.doubled).toBe(10)
    expect(output.safe).toBe(42)
  })

  it('tree-shaking removes unused bindings after macro expansion', () => {
    // Use a self-contained program with a known unused binding so the test
    // is not sensitive to changes in the example project files.
    const dvala = createDvala()
    const used = dvala.run('let x = 1; let unused = 99999; x') as number
    expect(used).toBe(1)

    // Parse into a bundle-like structure so we can call expandMacros + treeShake
    const source = 'let x = 1; let unused = 99999; x'
    let id = 0
    const tokens = minifyTokenStream(tokenize(source, false, undefined), { removeWhiteSpace: true })
    const ast = parseToAst(tokens, () => id++)
    const fakeBundle = { version: 1 as const, ast }

    const expanded = { ...fakeBundle, ast: expandMacros(fakeBundle.ast) }
    const shaken = { ...expanded, ast: treeShake(expanded.ast) }

    const expandedSize = JSON.stringify(expanded.ast.body).length
    const shakenSize = JSON.stringify(shaken.ast.body).length
    expect(shakenSize).toBeLessThan(expandedSize)

    // The shaken program still evaluates correctly
    expect(dvala.run(shaken) as number).toBe(1)
  })

  it('build config includes treeShake default', () => {
    const resolved = findConfig(exampleProjectDir)!
    expect(resolved.config.build.treeShake).toBe(true)
  })
})
