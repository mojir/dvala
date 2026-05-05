import { buildBuiltinCompletions, symbolDefToCompletion } from '../../src/shared/completionBuilder'
import type { CompletionItem } from '../../src/shared/completionBuilder'
import type { SymbolDef } from '../../src/languageService/types'
import { allBuiltinModules } from '../../src/allModules'
import type { WorkspaceFile } from './fileStorage'
import { folderFromPath, isInPlaygroundFolder, stripDvalaSuffix } from './filePath'

const builtinCompletions = buildBuiltinCompletions()
const builtinModuleCompletions: CompletionItem[] = allBuiltinModules.map(mod => ({
  label: mod.name,
  kind: 'module',
  detail: 'module',
  sortText: `0_${mod.name}`,
}))

function matchesPrefix(label: string, prefix: string): boolean {
  if (!prefix) return true
  return label.toLowerCase().startsWith(prefix.toLowerCase())
}

export function getScopedCompletionItems(prefix: string, visibleSymbols: SymbolDef[]): CompletionItem[] {
  const items: CompletionItem[] = []
  const seen = new Set<string>()

  for (const def of visibleSymbols) {
    if (!matchesPrefix(def.name, prefix)) continue
    if (seen.has(def.name)) continue
    seen.add(def.name)
    items.push(symbolDefToCompletion(def))
  }

  for (const item of builtinCompletions) {
    if (!matchesPrefix(item.label, prefix)) continue
    if (seen.has(item.label)) continue
    seen.add(item.label)
    items.push(item)
  }

  return items
}

export function getImportCompletionPrefix(lineText: string, column: number): string | null {
  const beforeCursor = lineText.slice(0, Math.max(0, column - 1))
  const match = /import\(\s*"([^"]*)$/.exec(beforeCursor)
  return match?.[1] ?? null
}

function relativeImportPath(fromFilePath: string | undefined, targetPath: string): string {
  const fromDir = fromFilePath ? folderFromPath(fromFilePath) : ''
  const fromSegments = fromDir === '' ? [] : fromDir.split('/')
  const toSegments = targetPath.split('/')
  const fileName = toSegments.pop()!

  let shared = 0
  while (shared < fromSegments.length && shared < toSegments.length && fromSegments[shared] === toSegments[shared]) {
    shared++
  }

  const up = fromSegments.slice(shared).map(() => '..')
  const down = toSegments.slice(shared)
  const parts = [...up, ...down, stripDvalaSuffix(fileName)]
  if (parts.length === 1 && !parts[0]!.startsWith('.')) {
    return `./${parts[0]}`
  }
  if (parts[0]?.startsWith('..')) {
    return parts.join('/')
  }
  return `./${parts.join('/')}`
}

export function getImportCompletionItems(
  importPrefix: string,
  currentFilePath: string | undefined,
  workspaceFiles: WorkspaceFile[],
): CompletionItem[] {
  const items: CompletionItem[] = []
  const seen = new Set<string>()
  const wantsPathCompletions = importPrefix.startsWith('.') || importPrefix.startsWith('/')

  if (!wantsPathCompletions) {
    for (const item of builtinModuleCompletions) {
      if (!matchesPrefix(item.label, importPrefix)) continue
      if (seen.has(item.label)) continue
      seen.add(item.label)
      items.push(item)
    }
  }

  for (const file of workspaceFiles) {
    if (isInPlaygroundFolder(file.path)) continue
    if (file.path === currentFilePath) continue
    const label = importPrefix.startsWith('/') ? `/${stripDvalaSuffix(file.path)}` : relativeImportPath(currentFilePath, file.path)
    if (!matchesPrefix(label, importPrefix)) continue
    if (seen.has(label)) continue
    seen.add(label)
    items.push({
      label,
      kind: 'module',
      detail: 'workspace file',
      sortText: `1_${label}`,
    })
  }

  return items
}