import { buildBuiltinCompletions, symbolDefToCompletion } from '../../src/shared/completionBuilder'
import type { CompletionItem } from '../../src/shared/completionBuilder'
import type { FileSymbols, SymbolDef } from '../../src/languageService/types'
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

export function getImportedExportCompletionItems(
  prefix: string,
  currentFileSymbols: FileSymbols | null,
  getFileSymbols: (filePath: string) => FileSymbols | null,
): CompletionItem[] {
  if (!currentFileSymbols) return []

  const items: CompletionItem[] = []
  const seen = new Set<string>()

  for (const importedPath of currentFileSymbols.imports.values()) {
    const importedSymbols = getFileSymbols(importedPath)
    if (!importedSymbols) continue
    for (const exp of importedSymbols.exports) {
      if (!matchesPrefix(exp.name, prefix)) continue
      if (seen.has(exp.name)) continue
      seen.add(exp.name)
      items.push({
        ...symbolDefToCompletion(exp),
        detail: 'imported export',
        sortText: `2_${exp.name}`,
      })
    }
  }

  return items
}

export function getImportCompletionPrefix(lineText: string, column: number): string | null {
  const beforeCursor = lineText.slice(0, Math.max(0, column - 1))
  const match = /import\(\s*"([^"]*)$/.exec(beforeCursor)
  return match?.[1] ?? null
}

function addImportCompletion(items: CompletionItem[], seen: Set<string>, label: string, detail: string): void {
  if (seen.has(label)) return
  seen.add(label)
  items.push({
    label,
    kind: 'module',
    detail,
    sortText: detail === 'folder' ? `1_${label}` : `2_${label}`,
  })
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

function relativeFolderImportPath(fromFilePath: string | undefined, folderPath: string): string {
  const folderImport = relativeImportPath(fromFilePath, `${folderPath}/index.dvala`)
  return folderImport.replace(/\/index$/, '')
}

function getImportFolderLabels(currentFilePath: string | undefined, workspaceFiles: WorkspaceFile[], importPrefix: string): string[] {
  const labels = new Set<string>()

  for (const file of workspaceFiles) {
    if (isInPlaygroundFolder(file.path)) continue
    const segments = file.path.split('/')
    segments.pop()
    let folderPath = ''
    for (const segment of segments) {
      folderPath = folderPath === '' ? segment : `${folderPath}/${segment}`
      const label = importPrefix.startsWith('/')
        ? `/${folderPath}/`
        : `${relativeFolderImportPath(currentFilePath, folderPath)}/`
      labels.add(label)
    }
  }

  return [...labels]
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
      addImportCompletion(items, seen, item.label, 'module')
    }
  }

  for (const label of getImportFolderLabels(currentFilePath, workspaceFiles, importPrefix)) {
    if (!matchesPrefix(label, importPrefix)) continue
    addImportCompletion(items, seen, label, 'folder')
  }

  for (const file of workspaceFiles) {
    if (isInPlaygroundFolder(file.path)) continue
    if (file.path === currentFilePath) continue
    const label = importPrefix.startsWith('/') ? `/${stripDvalaSuffix(file.path)}` : relativeImportPath(currentFilePath, file.path)
    if (!matchesPrefix(label, importPrefix)) continue
    addImportCompletion(items, seen, label, 'workspace file')
  }

  return items
}