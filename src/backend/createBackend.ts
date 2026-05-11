import { allBuiltinModules } from '../allModules'
import { WorkspaceIndex, type ResolveImport } from '../languageService/WorkspaceIndex'
import type { FileSymbols, SymbolDef } from '../languageService/types'
import { parseToAst } from '../parser'
import { buildBuiltinCompletions, symbolDefToCompletion } from '../shared/completionBuilder'
import { buildParseDiagnostics, buildTypeDiagnostics } from '../shared/diagnosticBuilder'
import { findTypeAtPosition, formatHoverType } from '../shared/typeDisplay'
import { minifyTokenStream } from '../tokenizer/minifyTokenStream'
import { formatSource } from '../tooling'
import { tokenizeSource, parseTokenStreamRecoverable } from '../tooling'
import { typecheck } from '../typechecker/typecheck'

import type { DvalaBackend } from './DvalaBackend'
import { createInMemoryDocumentStore, type BackendDocumentStore } from './documentStore'
import type {
  BackendCancelResult,
  BackendCompletionRequest,
  BackendCompletionResult,
  BackendDiagnosticsRequest,
  BackendDiagnosticsResult,
  BackendFormattingRequest,
  BackendFormattingResult,
  BackendHoverRequest,
  BackendHoverResult,
  BackendNavigationRequest,
  BackendNavigationResult,
  BackendRequestFailure,
  BackendSessionInspectionResult,
  BackendSessionResumeRequest,
  BackendSessionResumeResult,
  BackendSessionStartRequest,
  BackendSessionStartResult,
  BackendTextDocument,
  BackendWorkspaceSnapshotFile,
} from './requests'

export interface CreateBackendOptions {
  documents?: BackendDocumentStore
}

const PLAYGROUND_FOLDER = '.dvala-playground'
const builtinCompletions = buildBuiltinCompletions()
const builtinModuleCompletions = allBuiltinModules.map(mod => ({
  label: mod.name,
  kind: 'module' as const,
  detail: 'module',
  sortText: `0_${mod.name}`,
}))

function clearCancelledRequest(cancelledRequests: Map<number, boolean>, requestId: number): void {
  cancelledRequests.delete(requestId)
}

function requestFailure(
  requestId: number,
  error: BackendRequestFailure['error'],
  path?: string,
  version?: number,
): BackendRequestFailure {
  return {
    ok: false,
    requestId,
    ...(path ? { path } : {}),
    ...(version !== undefined ? { version } : {}),
    error,
  }
}

function isCancelled(cancelledRequests: Map<number, boolean>, requestId: number): boolean {
  return cancelledRequests.get(requestId) === true
}

function isInPlaygroundFolder(path: string): boolean {
  return path === PLAYGROUND_FOLDER || path.startsWith(`${PLAYGROUND_FOLDER}/`)
}

function folderFromPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

function stripDvalaSuffix(name: string): string {
  return name.trim().replace(/\.dvala$/i, '')
}

function resolvePlaygroundPath(fromDir: string, importPath: string): string {
  const isAbsolute = importPath.startsWith('/')
  const segments = isAbsolute || fromDir === '' ? [] : fromDir.split('/').filter(seg => seg !== '')
  for (const segment of importPath.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) {
        throw new Error(`Import path escapes workspace root: '${importPath}' from '${fromDir}'`)
      }
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.join('/')
}

function matchesPrefix(label: string, prefix: string): boolean {
  if (!prefix) return true
  return label.toLowerCase().startsWith(prefix.toLowerCase())
}

function getScopedCompletionItems(prefix: string, visibleSymbols: SymbolDef[]) {
  const items = []
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

function getImportedExportCompletionItems(
  prefix: string,
  currentFileSymbols: FileSymbols | null,
  getFileSymbols: (filePath: string) => FileSymbols | null,
) {
  if (!currentFileSymbols) return []

  const items = []
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

function addImportCompletion(
  items: ReturnType<typeof getScopedCompletionItems>,
  seen: Set<string>,
  label: string,
  detail: string,
): void {
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
  if (parts.length === 1 && !parts[0]!.startsWith('.')) return `./${parts[0]}`
  if (parts[0]?.startsWith('..')) return parts.join('/')
  return `./${parts.join('/')}`
}

function relativeFolderImportPath(fromFilePath: string | undefined, folderPath: string): string {
  return relativeImportPath(fromFilePath, `${folderPath}/index.dvala`).replace(/\/index$/, '')
}

function importBasePath(currentFilePath: string | undefined): string | undefined {
  if (!currentFilePath) return undefined
  return isInPlaygroundFolder(currentFilePath) ? undefined : currentFilePath
}

function getImportFolderLabels(
  currentFilePath: string | undefined,
  workspaceFiles: readonly BackendWorkspaceSnapshotFile[],
  importPrefix: string,
): string[] {
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

function getImportCompletionItems(
  importPrefix: string,
  currentFilePath: string | undefined,
  workspaceFiles: readonly BackendWorkspaceSnapshotFile[],
) {
  const items: ReturnType<typeof getScopedCompletionItems> = []
  const seen = new Set<string>()
  const wantsPathCompletions = importPrefix.startsWith('.') || importPrefix.startsWith('/')
  const basePath = importBasePath(currentFilePath)

  if (!wantsPathCompletions) {
    for (const item of builtinModuleCompletions) {
      if (!matchesPrefix(item.label, importPrefix)) continue
      addImportCompletion(items, seen, item.label, 'module')
    }
  }

  for (const label of getImportFolderLabels(basePath, workspaceFiles, importPrefix)) {
    if (!matchesPrefix(label, importPrefix)) continue
    addImportCompletion(items, seen, label, 'folder')
  }

  for (const file of workspaceFiles) {
    if (isInPlaygroundFolder(file.path)) continue
    if (file.path === currentFilePath) continue
    const label = importPrefix.startsWith('/')
      ? `/${stripDvalaSuffix(file.path)}`
      : relativeImportPath(basePath, file.path)
    if (!matchesPrefix(label, importPrefix)) continue
    addImportCompletion(items, seen, label, 'workspace file')
  }

  return items
}

function computeTypecheckResult(source: string, path: string) {
  const tokens = tokenizeSource(source, true, path)
  try {
    const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
    const ast = parseToAst(minified)
    return typecheck(ast, { modules: allBuiltinModules })
  } catch {
    return { diagnostics: [], typeMap: new Map(), sourceMap: undefined }
  }
}

function computeHoverResult(request: BackendHoverRequest): string | undefined {
  const typecheckResult = computeTypecheckResult(request.source, request.path)
  const wordRange =
    request.startColumn !== undefined && request.endColumn !== undefined
      ? {
          start: { line: request.line, column: request.startColumn },
          end: { line: request.line, column: request.endColumn },
        }
      : undefined

  const type = findTypeAtPosition(
    typecheckResult.typeMap,
    typecheckResult.sourceMap,
    { line: request.line, column: request.column },
    wordRange,
  )

  return type ? formatHoverType(type) : undefined
}

function resolveWorkspaceImportPathForSnapshot(
  snapshotFiles: Map<string, string>,
  rawPath: string,
  fromFile: string,
): string | null {
  if (!(rawPath.startsWith('.') || rawPath.startsWith('/'))) return null

  let resolved: string
  try {
    resolved = resolvePlaygroundPath(isInPlaygroundFolder(fromFile) ? '' : folderFromPath(fromFile), rawPath)
  } catch {
    return null
  }

  if (isInPlaygroundFolder(resolved)) return null
  if (snapshotFiles.has(resolved)) return resolved
  if (snapshotFiles.has(`${resolved}.dvala`)) return `${resolved}.dvala`
  return null
}

function indexWorkspaceSnapshot(
  path: string,
  source: string,
  snapshotFiles: Map<string, string>,
  index: WorkspaceIndex,
  seen = new Set<string>(),
): void {
  if (seen.has(path)) return
  seen.add(path)

  const resolveImport: ResolveImport = (rawPath, fromFile) =>
    resolveWorkspaceImportPathForSnapshot(snapshotFiles, rawPath, fromFile)
  const fileSymbols = index.updateFile(path, source, resolveImport)
  for (const importedPath of fileSymbols.imports.values()) {
    if (seen.has(importedPath)) continue
    const importedSource = snapshotFiles.get(importedPath)
    if (importedSource === undefined) continue
    indexWorkspaceSnapshot(importedPath, importedSource, snapshotFiles, index, seen)
  }
}

function computeCompletionResult(request: BackendCompletionRequest) {
  const workspaceFiles = request.workspaceFiles ?? []
  if (request.importPrefix !== null) {
    return getImportCompletionItems(request.importPrefix, request.path, workspaceFiles)
  }

  const snapshotFiles = new Map(workspaceFiles.map(file => [file.path, file.code]))
  snapshotFiles.set(request.path, request.source)

  const index = new WorkspaceIndex()
  indexWorkspaceSnapshot(request.path, request.source, snapshotFiles, index)

  const currentFileSymbols = index.getFileSymbols(request.path)
  const seen = new Set<string>()
  const items = []

  for (const item of getScopedCompletionItems(
    request.prefix,
    index.getSymbolsInScope(request.path, request.line, request.column),
  )) {
    if (seen.has(item.label)) continue
    seen.add(item.label)
    items.push(item)
  }

  for (const item of getImportedExportCompletionItems(request.prefix, currentFileSymbols, filePath =>
    index.getFileSymbols(filePath),
  )) {
    if (seen.has(item.label)) continue
    seen.add(item.label)
    items.push(item)
  }

  return items
}

function getImportPathAtSourcePosition(source: string, line: number, column: number): string | null {
  const lineText = source.split('\n')[line - 1]
  if (lineText === undefined) return null

  const beforeCursor = lineText.slice(0, Math.max(0, column - 1))
  const prefixMatch = /import\(\s*"([^"]*)$/.exec(beforeCursor)
  if (!prefixMatch) return null

  const afterCursor = lineText.slice(Math.max(0, column - 1))
  const suffixMatch = /^([^"]*)"/.exec(afterCursor)
  const rawPath = `${prefixMatch[1] ?? ''}${suffixMatch?.[1] ?? ''}`
  return rawPath.length > 0 ? rawPath : ''
}

function computeNavigationResult(request: BackendNavigationRequest) {
  const snapshotFiles = new Map((request.workspaceFiles ?? []).map(file => [file.path, file.code]))
  snapshotFiles.set(request.path, request.source)

  const index = new WorkspaceIndex()
  indexWorkspaceSnapshot(request.path, request.source, snapshotFiles, index)

  if (request.kind === 'definition') {
    const importPath = getImportPathAtSourcePosition(request.source, request.line, request.column)
    if (importPath !== null) {
      const resolved = resolveWorkspaceImportPathForSnapshot(snapshotFiles, importPath, request.path)
      if (resolved) {
        return {
          locations: [
            {
              file: resolved,
              line: 1,
              column: 1,
              endColumn: 1,
            },
          ],
        }
      }
    }

    const def = index.findDefinition(request.path, request.line, request.column)
    return {
      locations: def
        ? [
            {
              file: def.location.file,
              line: def.location.line,
              column: def.location.column,
              endColumn: def.location.column + def.name.length,
            },
          ]
        : [],
    }
  }

  const canonical = index.resolveCanonicalFile(request.path, request.line, request.column)
  if (!canonical) return request.kind === 'rename' ? { edits: [] } : { locations: [] }

  const occurrences = index.findAllOccurrences(canonical.file, canonical.name)
  if (request.kind === 'references') {
    return {
      locations: occurrences.map(loc => ({
        file: loc.file,
        line: loc.line,
        column: loc.column,
        endColumn: loc.column + loc.nameLength,
      })),
    }
  }

  return {
    edits: occurrences.map(loc => ({
      file: loc.file,
      text: request.newName ?? canonical.name,
      range: {
        startLine: loc.line,
        startColumn: loc.column,
        endLine: loc.line,
        endColumn: loc.column + loc.nameLength,
      },
    })),
  }
}

export function createBackend(options: CreateBackendOptions = {}): DvalaBackend {
  const documents = options.documents ?? createInMemoryDocumentStore()
  const cancelledRequests = new Map<number, boolean>()

  return {
    async openDocument(document: BackendTextDocument): Promise<void> {
      documents.open(document)
    },

    async updateDocument(document: BackendTextDocument, previousVersion: number) {
      return documents.update(document, previousVersion)
    },

    async closeDocument(path: string): Promise<void> {
      documents.close(path)
    },

    async replaceWorkspaceSnapshot(request): Promise<void> {
      documents.replaceWorkspaceSnapshot(request)
    },

    async requestDiagnostics(request: BackendDiagnosticsRequest): Promise<BackendDiagnosticsResult> {
      const openDocument = documents.getOpenDocument(request.path)
      if (!openDocument || openDocument.version !== request.version) {
        return requestFailure(
          request.requestId,
          {
            kind: 'resync-required',
            message: `Backend document mirror missing or stale for ${request.path}`,
            path: request.path,
          },
          request.path,
          request.version,
        )
      }

      try {
        const tokenStream = tokenizeSource(openDocument.source, true, openDocument.path)
        const parseResult = parseTokenStreamRecoverable(tokenStream)
        const parseDiagnostics = buildParseDiagnostics(parseResult.errors)
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend diagnostics request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        const typecheckResult = computeTypecheckResult(openDocument.source, openDocument.path)
        const typeDiagnostics = buildTypeDiagnostics(typecheckResult)
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend diagnostics request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        clearCancelledRequest(cancelledRequests, request.requestId)
        return {
          ok: true,
          requestId: request.requestId,
          path: request.path,
          version: request.version,
          diagnostics: [...parseDiagnostics, ...typeDiagnostics],
        }
      } catch (error) {
        clearCancelledRequest(cancelledRequests, request.requestId)
        return requestFailure(
          request.requestId,
          {
            kind: 'analysis-failed',
            message: error instanceof Error ? error.message : `${error}`,
            path: request.path,
          },
          request.path,
          request.version,
        )
      }
    },

    async requestFormatting(request: BackendFormattingRequest): Promise<BackendFormattingResult> {
      try {
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend formatting request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        const formatted = formatSource(request.source)
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend formatting request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        clearCancelledRequest(cancelledRequests, request.requestId)
        return {
          ok: true,
          requestId: request.requestId,
          path: request.path,
          version: request.version,
          formatted,
        }
      } catch (error) {
        clearCancelledRequest(cancelledRequests, request.requestId)
        return requestFailure(
          request.requestId,
          {
            kind: 'analysis-failed',
            message: error instanceof Error ? error.message : `${error}`,
            path: request.path,
          },
          request.path,
          request.version,
        )
      }
    },

    async requestHover(request: BackendHoverRequest): Promise<BackendHoverResult> {
      try {
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend hover request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        const inferredType = computeHoverResult(request)
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend hover request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        clearCancelledRequest(cancelledRequests, request.requestId)
        return {
          ok: true,
          requestId: request.requestId,
          path: request.path,
          version: request.version,
          ...(inferredType ? { inferredType } : {}),
        }
      } catch (error) {
        clearCancelledRequest(cancelledRequests, request.requestId)
        return requestFailure(
          request.requestId,
          {
            kind: 'analysis-failed',
            message: error instanceof Error ? error.message : `${error}`,
            path: request.path,
          },
          request.path,
          request.version,
        )
      }
    },

    async requestCompletion(request: BackendCompletionRequest): Promise<BackendCompletionResult> {
      try {
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend completion request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        const items = computeCompletionResult(request)
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend completion request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        clearCancelledRequest(cancelledRequests, request.requestId)
        return {
          ok: true,
          requestId: request.requestId,
          path: request.path,
          version: request.version,
          items,
        }
      } catch (error) {
        clearCancelledRequest(cancelledRequests, request.requestId)
        return requestFailure(
          request.requestId,
          {
            kind: 'analysis-failed',
            message: error instanceof Error ? error.message : `${error}`,
            path: request.path,
          },
          request.path,
          request.version,
        )
      }
    },

    async requestNavigation(request: BackendNavigationRequest): Promise<BackendNavigationResult> {
      try {
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend navigation request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        const result = computeNavigationResult(request)
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend navigation request cancelled', path: request.path },
            request.path,
            request.version,
          )
        }

        clearCancelledRequest(cancelledRequests, request.requestId)
        return {
          ok: true,
          requestId: request.requestId,
          path: request.path,
          version: request.version,
          kind: request.kind,
          ...result,
        }
      } catch (error) {
        clearCancelledRequest(cancelledRequests, request.requestId)
        return requestFailure(
          request.requestId,
          {
            kind: 'analysis-failed',
            message: error instanceof Error ? error.message : `${error}`,
            path: request.path,
          },
          request.path,
          request.version,
        )
      }
    },

    async startSession(request: BackendSessionStartRequest): Promise<BackendSessionStartResult> {
      return requestFailure(
        request.requestId,
        {
          kind: 'invalid-request',
          message: 'Backend operation not implemented yet: startSession',
          ...(request.path ? { path: request.path } : {}),
        },
        request.path,
      )
    },

    async resumeSnapshot(request: BackendSessionResumeRequest): Promise<BackendSessionResumeResult> {
      return requestFailure(request.requestId, {
        kind: 'invalid-request',
        message: 'Backend operation not implemented yet: resumeSnapshot',
      })
    },

    async inspectSession(sessionId: string): Promise<BackendSessionInspectionResult> {
      return {
        ok: true,
        sessionId,
        status: 'missing',
      }
    },

    async stopSession(_sessionId: string): Promise<void> {},

    async cancelRequest(requestId: number): Promise<BackendCancelResult> {
      cancelledRequests.set(requestId, true)
      return { ok: true }
    },
  }
}
