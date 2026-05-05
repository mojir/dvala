import { describe, expect, it } from 'vitest'

import type { FileSymbols, SymbolDef } from '../../src/languageService/types'
import { getImportCompletionItems, getImportCompletionPrefix, getImportedExportCompletionItems, getScopedCompletionItems } from './lsCompletions'

function def(overrides: Partial<SymbolDef> = {}): SymbolDef {
  return {
    name: 'value',
    kind: 'variable',
    nodeId: 1,
    location: { file: 'test.dvala', line: 1, column: 1 },
    scope: 0,
    ...overrides,
  }
}

function fileSymbols(overrides: Partial<FileSymbols> = {}): FileSymbols {
  return {
    filePath: 'test.dvala',
    definitions: [],
    references: [],
    imports: new Map(),
    exports: [],
    parseErrors: [],
    scopeRanges: [],
    ...overrides,
  }
}

describe('getScopedCompletionItems', () => {
  it('includes visible user-defined symbols', () => {
    const items = getScopedCompletionItems('', [def({ name: 'localValue' }), def({ name: 'helper', kind: 'function' })])
    expect(items.map(item => item.label)).toContain('localValue')
    expect(items.map(item => item.label)).toContain('helper')
  })

  it('filters by prefix across user symbols and builtins', () => {
    const items = getScopedCompletionItems('ma', [def({ name: 'makeThing', kind: 'function' }), def({ name: 'other' })])
    expect(items.map(item => item.label)).toContain('makeThing')
    expect(items.map(item => item.label)).toContain('map')
    expect(items.map(item => item.label)).not.toContain('other')
  })

  it('prefers visible symbols over builtins with the same name', () => {
    const items = getScopedCompletionItems('map', [def({ name: 'map', kind: 'variable' })])
    expect(items.filter(item => item.label === 'map')).toHaveLength(1)
    expect(items.find(item => item.label === 'map')?.kind).toBe('variable')
  })
})

describe('getImportCompletionPrefix', () => {
  it('detects import string context before the cursor', () => {
    const line = 'let x = import("./ut")'
    expect(getImportCompletionPrefix(line, line.indexOf('")') + 1)).toBe('./ut')
  })

  it('returns null outside import string context', () => {
    expect(getImportCompletionPrefix('let x = "./ut"', 15)).toBeNull()
  })
})

describe('getImportCompletionItems', () => {
  const workspaceFiles = [
    { id: '1', path: 'utils.dvala', code: '', context: '', createdAt: 0, updatedAt: 0 },
    { id: '2', path: 'lib/math.dvala', code: '', context: '', createdAt: 0, updatedAt: 0 },
    { id: '3', path: '.dvala-playground/scratch.dvala', code: '', context: '', createdAt: 0, updatedAt: 0 },
  ]

  it('suggests builtin module names for bare import prefixes', () => {
    const items = getImportCompletionItems('fun', 'main.dvala', workspaceFiles)
    expect(items.map(item => item.label)).toContain('functional')
  })

  it('suggests relative workspace file imports without the .dvala suffix', () => {
    const items = getImportCompletionItems('./u', 'main.dvala', workspaceFiles)
    expect(items.map(item => item.label)).toContain('./utils')
  })

  it('suggests folder prefixes before nested files', () => {
    const items = getImportCompletionItems('./l', 'main.dvala', workspaceFiles)
    expect(items.map(item => item.label)).toContain('./lib/')
    expect(items.find(item => item.label === './lib/')?.detail).toBe('folder')
  })

  it('suggests parent-relative workspace file imports from nested files', () => {
    const items = getImportCompletionItems('../l', 'examples/main.dvala', workspaceFiles)
    expect(items.map(item => item.label)).toContain('../lib/')
    expect(items.map(item => item.label)).toContain('../lib/math')
  })

  it('omits playground-internal files and the current file', () => {
    const items = getImportCompletionItems('./', 'utils.dvala', workspaceFiles)
    expect(items.map(item => item.label)).not.toContain('./utils')
    expect(items.map(item => item.label).some(label => label.includes('.dvala-playground'))).toBe(false)
  })
})

describe('getImportedExportCompletionItems', () => {
  it('includes exports from directly imported files', () => {
    const current = fileSymbols({ imports: new Map([['./utils', 'utils.dvala']]) })
    const imported = fileSymbols({
      filePath: 'utils.dvala',
      exports: [def({ name: 'value', kind: 'variable', location: { file: 'utils.dvala', line: 1, column: 1 } })],
    })

    const items = getImportedExportCompletionItems('va', current, filePath => (filePath === 'utils.dvala' ? imported : null))
    expect(items.map(item => item.label)).toContain('value')
    expect(items.find(item => item.label === 'value')?.detail).toBe('imported export')
  })

  it('deduplicates exports across imported files', () => {
    const current = fileSymbols({ imports: new Map([['./a', 'a.dvala'], ['./b', 'b.dvala']]) })
    const imported = fileSymbols({
      exports: [def({ name: 'shared', kind: 'function', params: ['x'] })],
    })

    const items = getImportedExportCompletionItems('sh', current, () => imported)
    expect(items.filter(item => item.label === 'shared')).toHaveLength(1)
  })

  it('preserves callable insertText for imported exports', () => {
    const current = fileSymbols({ imports: new Map([['./utils', 'utils.dvala']]) })
    const imported = fileSymbols({
      exports: [def({ name: 'shared', kind: 'function', params: ['x'] })],
    })

    const items = getImportedExportCompletionItems('sh', current, () => imported)
    expect(items.find(item => item.label === 'shared')?.insertText).toBe('shared(${1:x})')
  })
})