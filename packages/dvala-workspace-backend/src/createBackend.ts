import {
  allBuiltinModules,
  WorkspaceIndex,
  type ResolveImport,
  type FileSymbols,
  type SymbolDef,
  parseToAst,
  buildBuiltinCompletions,
  symbolDefToCompletion,
  findCallContext as findSharedCallContext,
  buildParseDiagnostics,
  buildSymbolDiagnostics,
  buildTypeDiagnostics,
  findTypeAtPosition,
  formatHoverType,
  minifyTokenStream,
  formatSource,
  tokenizeSource,
  typecheck,
  type MacroEvalDvalaFactory,
} from '@mojir/dvala-core-tooling'
import { allReference, isFunctionReference } from '../../../reference/index'

import type { DvalaBackend } from './DvalaBackend'
import { createInMemoryDocumentStore, type BackendDocumentStore } from './documentStore'
import { createBackendRuntimeAdapter, type BackendRuntimeAdapter } from './runtime/runtimeAdapter'
import type {
  BackendCancelResult,
  BackendCompletionRequest,
  BackendCompletionResult,
  BackendDiagnosticsRequest,
  BackendDiagnosticsResult,
  BackendDocumentSymbol,
  BackendDocumentVersion,
  BackendDocumentSymbolsRequest,
  BackendDocumentSymbolsResult,
  BackendFormattingRequest,
  BackendFormattingResult,
  BackendHoverRequest,
  BackendHoverResult,
  BackendSignatureHelpRequest,
  BackendSignatureHelpSignature,
  BackendSignatureHelpResult,
  BackendNavigationRequest,
  BackendNavigationResult,
  BackendRequestFailure,
  BackendRequestId,
  BackendSnapshotBindingsInspectionRequest,
  BackendSnapshotBindingsInspectionResult,
  BackendSnapshotInspectionRequest,
  BackendSnapshotInspectionResult,
  BackendSnapshotValidationRequest,
  BackendSnapshotValidationResult,
  BackendSessionInspectionResult,
  BackendSessionResumeRequest,
  BackendSessionResumeResult,
  BackendSessionStartRequest,
  BackendSessionStartResult,
  BackendSymbolKind,
  BackendTextDocument,
  BackendWorkspaceSymbol,
  BackendWorkspaceSnapshotFile,
  BackendWorkspaceSymbolsRequest,
  BackendWorkspaceSymbolsResult,
} from './requests'

export interface CreateBackendOptions {
  documents?: BackendDocumentStore
  runtime?: BackendRuntimeAdapter
  /**
   * Host factory used by the typechecker to evaluate macro definitions so that
   * macro calls receive concrete types. Without it, macro expansion is skipped
   * during type inference and macro-using sites are typed as Unknown.
   */
  createDvala?: MacroEvalDvalaFactory
}

const PLAYGROUND_FOLDER = '.dvala-playground'
const builtinCompletions = buildBuiltinCompletions()
const builtinModuleCompletions = allBuiltinModules.map(mod => ({
  label: mod.name,
  kind: 'module' as const,
  detail: 'module',
  sortText: `0_${mod.name}`,
}))

function clearCancelledRequest(cancelledRequests: Map<BackendRequestId, boolean>, requestId: BackendRequestId): void {
  cancelledRequests.delete(requestId)
}

function requestFailure(
  requestId: BackendRequestId,
  error: BackendRequestFailure['error'],
  path?: string,
): BackendRequestFailure {
  return {
    ok: false,
    requestId,
    error: path && !error.path ? { ...error, path } : error,
  }
}

function isCancelled(cancelledRequests: Map<BackendRequestId, boolean>, requestId: BackendRequestId): boolean {
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

function computeTypecheckResult(
  source: string,
  path: string,
  documents?: BackendDocumentStore,
  createDvala?: MacroEvalDvalaFactory,
) {
  const tokens = tokenizeSource(source, true, path)
  try {
    const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
    const ast = parseToAst(minified)
    return typecheck(ast, {
      modules: allBuiltinModules,
      ...(documents
        ? {
            fileResolver: createRuntimeFileResolver(documents),
            fileResolverBaseDir: runtimeBaseDir(path),
          }
        : {}),
      createDvala,
    })
  } catch {
    return { diagnostics: [], typeMap: new Map(), sourceMap: undefined }
  }
}

function computeHoverResult(
  request: BackendHoverRequest,
  documents: BackendDocumentStore,
  createDvala?: MacroEvalDvalaFactory,
): string | undefined {
  if (request.source === undefined) return undefined
  const typecheckResult = computeTypecheckResult(request.source, request.path, documents, createDvala)
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

function runtimeBaseDir(path?: string): string {
  if (!path || isInPlaygroundFolder(path)) return ''
  return folderFromPath(path)
}

function createRuntimeFileResolver(documents: BackendDocumentStore) {
  return (importPath: string, fromDir: string): string => {
    const resolved = resolvePlaygroundPath(isInPlaygroundFolder(fromDir) ? '' : fromDir, importPath)
    if (isInPlaygroundFolder(resolved)) {
      throw new Error(
        `Cannot import '${importPath}' from '${fromDir || '<root>'}': ${PLAYGROUND_FOLDER}/ is playground state, not part of the deployable project`,
      )
    }
    const exact = documents.getEffectiveSource(resolved)
    if (exact !== undefined) return exact

    const withSuffix = documents.getEffectiveSource(`${resolved}.dvala`)
    if (withSuffix !== undefined) return withSuffix

    throw new Error(`File not found: ${importPath} (resolved from '${fromDir}' to '${resolved}')`)
  }
}

function resolveWorkspaceImportPathForDocuments(
  documents: BackendDocumentStore,
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
  if (documents.getEffectiveSource(resolved) !== undefined) return resolved
  if (documents.getEffectiveSource(`${resolved}.dvala`) !== undefined) return `${resolved}.dvala`
  return null
}

function indexBackendDocuments(
  path: string,
  documents: BackendDocumentStore,
  index: WorkspaceIndex,
  seen = new Set<string>(),
): void {
  if (seen.has(path)) return
  seen.add(path)

  const source = documents.getEffectiveSource(path)
  if (source === undefined) return

  const resolveImport: ResolveImport = (rawPath, fromFile) =>
    resolveWorkspaceImportPathForDocuments(documents, rawPath, fromFile)
  const fileSymbols = index.updateFile(path, source, resolveImport)

  for (const importedPath of fileSymbols.imports.values()) {
    if (seen.has(importedPath)) continue
    indexBackendDocuments(importedPath, documents, index, seen)
  }
}

function computeCompletionResult(
  request: BackendCompletionRequest,
  workspaceFiles: readonly BackendWorkspaceSnapshotFile[],
) {
  if (request.source === undefined) return []
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

function computeNavigationResult(
  request: BackendNavigationRequest,
  workspaceFiles: readonly BackendWorkspaceSnapshotFile[],
) {
  if (request.source === undefined) return request.kind === 'rename' ? { edits: [] } : { locations: [] }
  const snapshotFiles = new Map(workspaceFiles.map(file => [file.path, file.code]))
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

function indexAllBackendDocuments(documents: BackendDocumentStore, index: WorkspaceIndex): void {
  const seen = new Set<string>()

  for (const file of documents.getWorkspaceSnapshot()) {
    indexBackendDocuments(file.path, documents, index, seen)
  }

  for (const document of documents.getOpenDocuments()) {
    indexBackendDocuments(document.path, documents, index, seen)
  }
}

function getEffectiveWorkspaceSnapshot(documents: BackendDocumentStore): readonly BackendWorkspaceSnapshotFile[] {
  const snapshot = new Map<string, BackendWorkspaceSnapshotFile>()

  for (const file of documents.getWorkspaceSnapshot()) {
    snapshot.set(file.path, file)
  }

  for (const document of documents.getOpenDocuments()) {
    snapshot.set(document.path, {
      path: document.path,
      code: document.source,
    })
  }

  return [...snapshot.values()]
}

function toBackendDocumentSymbol(def: SymbolDef): BackendDocumentSymbol {
  return {
    name: def.name,
    kind: def.kind as BackendSymbolKind,
    line: def.location.line,
    column: def.location.column,
  }
}

function computeSignatureHelpResult(request: BackendSignatureHelpRequest, documents: BackendDocumentStore) {
  const callCtx = findSharedCallContext(request.source, { line: request.line, column: request.column })
  if (!callCtx) return { activeParameter: 0, signatures: [] as const }

  const ref = allReference[callCtx.functionName]
  if (ref && isFunctionReference(ref)) {
    return {
      activeParameter: callCtx.activeParam,
      signatures: ref.variants.map<BackendSignatureHelpSignature>(variant => {
        const parameters = variant.argumentNames.map(name => {
          const argInfo = ref.args[name]
          const typeStr = argInfo ? (Array.isArray(argInfo.type) ? argInfo.type.join(' | ') : argInfo.type) : ''
          return typeStr ? `${name}: ${typeStr}` : name
        })
        return {
          label: `${callCtx.functionName}(${parameters.join(', ')})`,
          parameters,
        }
      }),
    }
  }

  const index = new WorkspaceIndex()
  indexBackendDocuments(request.path, documents, index)
  const defs = index.getDefinitions(request.path)
  const funcDef = defs.find(def => def.name === callCtx.functionName && def.params)
  if (!funcDef?.params) return { activeParameter: callCtx.activeParam, signatures: [] as const }

  return {
    activeParameter: callCtx.activeParam,
    signatures: [
      {
        label: `${callCtx.functionName}(${funcDef.params.join(', ')})`,
        parameters: funcDef.params,
      },
    ] as const,
  }
}

export function createBackend(options: CreateBackendOptions = {}): DvalaBackend {
  const documents = options.documents ?? createInMemoryDocumentStore()
  const runtime = options.runtime ?? createBackendRuntimeAdapter(documents)
  const cancelledRequests = new Map<BackendRequestId, boolean>()

  function runtimeCancelledFailure(requestId: BackendRequestId, message: string, path?: string): BackendRequestFailure {
    clearCancelledRequest(cancelledRequests, requestId)
    return requestFailure(
      requestId,
      {
        kind: 'cancelled',
        message,
        ...(path ? { path } : {}),
      },
      path,
    )
  }

  function runtimeErrorFailure(requestId: BackendRequestId, error: unknown, path?: string): BackendRequestFailure {
    clearCancelledRequest(cancelledRequests, requestId)
    return requestFailure(
      requestId,
      {
        kind: 'runtime-failed',
        message: error instanceof Error ? error.message : `${error}`,
        ...(path ? { path } : {}),
      },
      path,
    )
  }

  async function runRuntimeRequest<T, TResult>(requestOptions: {
    requestId: BackendRequestId
    cancelMessage: string
    path?: string
    run: () => Promise<T>
    onCancelled?: (value: T) => Promise<void>
    success: (value: T) => TResult
  }): Promise<TResult | BackendRequestFailure> {
    try {
      if (isCancelled(cancelledRequests, requestOptions.requestId)) {
        return runtimeCancelledFailure(requestOptions.requestId, requestOptions.cancelMessage, requestOptions.path)
      }

      const value = await requestOptions.run()

      if (isCancelled(cancelledRequests, requestOptions.requestId)) {
        await requestOptions.onCancelled?.(value)
        return runtimeCancelledFailure(requestOptions.requestId, requestOptions.cancelMessage, requestOptions.path)
      }

      clearCancelledRequest(cancelledRequests, requestOptions.requestId)
      return requestOptions.success(value)
    } catch (error) {
      return runtimeErrorFailure(requestOptions.requestId, error, requestOptions.path)
    }
  }

  return {
    async openDocument(document: BackendTextDocument): Promise<void> {
      documents.open(document)
    },

    async updateDocument(document: BackendTextDocument, previousVersion: BackendDocumentVersion) {
      return documents.update(document, previousVersion)
    },

    async closeDocument(path: string): Promise<void> {
      documents.close(path)
    },

    async persistFile(request): Promise<void> {
      documents.persistFile(request)
    },

    async removeFile(request): Promise<void> {
      documents.removeFile(request)
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
        )
      }

      try {
        const index = new WorkspaceIndex()
        indexBackendDocuments(openDocument.path, documents, index)
        const { parseErrors, unresolvedRefs } = index.getDiagnostics(openDocument.path)
        const parseDiagnostics = buildParseDiagnostics(parseErrors)
        const symbolDiagnostics = buildSymbolDiagnostics(unresolvedRefs)
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend diagnostics request cancelled', path: request.path },
            request.path,
          )
        }

        const typecheckResult = computeTypecheckResult(
          openDocument.source,
          openDocument.path,
          documents,
          options.createDvala,
        )
        const typeDiagnostics = buildTypeDiagnostics(typecheckResult)
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend diagnostics request cancelled', path: request.path },
            request.path,
          )
        }

        clearCancelledRequest(cancelledRequests, request.requestId)
        return {
          ok: true,
          requestId: request.requestId,
          path: request.path,
          version: request.version,
          diagnostics: [...parseDiagnostics, ...symbolDiagnostics, ...typeDiagnostics],
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
          )
        }

        const openDocument = documents.getOpenDocument(request.path)
        if (request.source === undefined && (!openDocument || openDocument.version !== request.version)) {
          return requestFailure(
            request.requestId,
            {
              kind: 'resync-required',
              message: `Backend document mirror missing or stale for ${request.path}`,
              path: request.path,
            },
            request.path,
          )
        }

        const formatted = formatSource(request.source ?? openDocument?.source ?? '')
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend formatting request cancelled', path: request.path },
            request.path,
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
          )
        }

        const openDocument = documents.getOpenDocument(request.path)
        if (request.source === undefined && (!openDocument || openDocument.version !== request.version)) {
          return requestFailure(
            request.requestId,
            {
              kind: 'resync-required',
              message: `Backend document mirror missing or stale for ${request.path}`,
              path: request.path,
            },
            request.path,
          )
        }

        const inferredType = computeHoverResult(
          {
            ...request,
            source: request.source ?? openDocument?.source,
          },
          documents,
          options.createDvala,
        )
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend hover request cancelled', path: request.path },
            request.path,
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
        )
      }
    },

    async requestSignatureHelp(request: BackendSignatureHelpRequest): Promise<BackendSignatureHelpResult> {
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
        )
      }

      try {
        const result = computeSignatureHelpResult(request, documents)
        return {
          ok: true,
          requestId: request.requestId,
          path: request.path,
          version: request.version,
          activeParameter: result.activeParameter,
          signatures: result.signatures,
        }
      } catch (error) {
        return requestFailure(
          request.requestId,
          {
            kind: 'analysis-failed',
            message: error instanceof Error ? error.message : `${error}`,
            path: request.path,
          },
          request.path,
        )
      }
    },

    async requestDocumentSymbols(request: BackendDocumentSymbolsRequest): Promise<BackendDocumentSymbolsResult> {
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
        )
      }

      try {
        const index = new WorkspaceIndex()
        indexBackendDocuments(request.path, documents, index)
        return {
          ok: true,
          requestId: request.requestId,
          path: request.path,
          version: request.version,
          symbols: index.getDocumentSymbols(request.path).map(toBackendDocumentSymbol),
        }
      } catch (error) {
        return requestFailure(
          request.requestId,
          {
            kind: 'analysis-failed',
            message: error instanceof Error ? error.message : `${error}`,
            path: request.path,
          },
          request.path,
        )
      }
    },

    async requestWorkspaceSymbols(request: BackendWorkspaceSymbolsRequest): Promise<BackendWorkspaceSymbolsResult> {
      try {
        const workspaceIndex = new WorkspaceIndex()
        indexAllBackendDocuments(documents, workspaceIndex)
        const lowerQuery = request.query.toLowerCase()
        const symbols: BackendWorkspaceSymbol[] = documents
          .getOpenDocuments()
          .map(doc => doc.path)
          .concat(documents.getWorkspaceSnapshot().map(file => file.path))
          .filter((path, pathIndex, paths) => paths.indexOf(path) === pathIndex)
          .flatMap(path => workspaceIndex.getDocumentSymbols(path))
          .filter(def => (lowerQuery ? def.name.toLowerCase().includes(lowerQuery) : true))
          .map(def => ({
            file: def.location.file,
            ...toBackendDocumentSymbol(def),
          }))

        return {
          ok: true,
          requestId: request.requestId,
          symbols,
        }
      } catch (error) {
        return requestFailure(request.requestId, {
          kind: 'analysis-failed',
          message: error instanceof Error ? error.message : `${error}`,
        })
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
          )
        }

        const openDocument = documents.getOpenDocument(request.path)
        if (request.source === undefined && (!openDocument || openDocument.version !== request.version)) {
          return requestFailure(
            request.requestId,
            {
              kind: 'resync-required',
              message: `Backend document mirror missing or stale for ${request.path}`,
              path: request.path,
            },
            request.path,
          )
        }

        const items = computeCompletionResult(
          {
            ...request,
            source: request.source ?? openDocument?.source,
          },
          getEffectiveWorkspaceSnapshot(documents),
        )
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend completion request cancelled', path: request.path },
            request.path,
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
          )
        }

        const openDocument = documents.getOpenDocument(request.path)
        if (request.source === undefined && (!openDocument || openDocument.version !== request.version)) {
          return requestFailure(
            request.requestId,
            {
              kind: 'resync-required',
              message: `Backend document mirror missing or stale for ${request.path}`,
              path: request.path,
            },
            request.path,
          )
        }

        const result = computeNavigationResult(
          {
            ...request,
            source: request.source ?? openDocument?.source,
          },
          getEffectiveWorkspaceSnapshot(documents),
        )
        if (isCancelled(cancelledRequests, request.requestId)) {
          clearCancelledRequest(cancelledRequests, request.requestId)
          return requestFailure(
            request.requestId,
            { kind: 'cancelled', message: 'Backend navigation request cancelled', path: request.path },
            request.path,
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
        )
      }
    },

    async startSession(request: BackendSessionStartRequest): Promise<BackendSessionStartResult> {
      return runRuntimeRequest({
        requestId: request.requestId,
        cancelMessage: 'Backend session start request cancelled',
        path: request.path,
        run: () => runtime.start(request),
        onCancelled: started => runtime.stop(started.sessionId),
        success: started => ({
          ok: true,
          requestId: request.requestId,
          sessionId: started.sessionId,
          runResult: started.runResult,
        }),
      })
    },

    async resumeSnapshot(request: BackendSessionResumeRequest): Promise<BackendSessionResumeResult> {
      return runRuntimeRequest({
        requestId: request.requestId,
        cancelMessage: 'Backend session resume request cancelled',
        run: () => runtime.resume(request),
        onCancelled: resumed => runtime.stop(resumed.sessionId),
        success: resumed => ({
          ok: true,
          requestId: request.requestId,
          sessionId: resumed.sessionId,
          runResult: resumed.runResult,
        }),
      })
    },

    async inspectSnapshot(request: BackendSnapshotInspectionRequest): Promise<BackendSnapshotInspectionResult> {
      return runRuntimeRequest({
        requestId: request.requestId,
        cancelMessage: 'Backend snapshot inspection request cancelled',
        run: () => runtime.inspectSnapshot(request),
        success: checkpointSnapshots => ({
          ok: true,
          requestId: request.requestId,
          checkpointSnapshots,
        }),
      })
    },

    async inspectSnapshotBindings(
      request: BackendSnapshotBindingsInspectionRequest,
    ): Promise<BackendSnapshotBindingsInspectionResult> {
      return runRuntimeRequest({
        requestId: request.requestId,
        cancelMessage: 'Backend snapshot bindings inspection request cancelled',
        run: () => runtime.inspectSnapshotBindings(request),
        success: bindings => ({
          ok: true,
          requestId: request.requestId,
          bindings,
        }),
      })
    },

    async validateSnapshot(request: BackendSnapshotValidationRequest): Promise<BackendSnapshotValidationResult> {
      try {
        const snapshot = await runtime.validateSnapshot(request)
        if (!snapshot) {
          return requestFailure(request.requestId, {
            kind: 'invalid-request',
            message: 'Not a valid snapshot object.',
          })
        }

        return {
          ok: true,
          requestId: request.requestId,
          snapshot,
        }
      } catch (error) {
        return runtimeErrorFailure(request.requestId, error)
      }
    },

    async inspectSession(sessionId: string): Promise<BackendSessionInspectionResult> {
      return runtime.inspect(sessionId)
    },

    async stopSession(sessionId: string): Promise<void> {
      await runtime.stop(sessionId)
    },

    async cancelRequest(requestId: BackendRequestId): Promise<BackendCancelResult> {
      cancelledRequests.set(requestId, true)
      return { ok: true, requestId }
    },
  }
}
