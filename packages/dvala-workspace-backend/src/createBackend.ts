import {
  allBuiltinModules,
  isDvalaIdentifierName,
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
import { NodeTypes, type AstNode, type SourceMapPosition } from '@mojir/dvala-types'
import { allReference, isFunctionReference } from '../../../reference/index'
import { computeCatchallEdit } from './catchallQuickFix'
import { computeExtractVariableEdit } from './extractVariableEdit'
import { computeExtractFunctionEdit } from './extractFunctionEdit'
import { computeInlineVariableEdits, type InlineReferenceLocation } from './inlineVariableEdit'

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
  BackendSymbolAtPositionRequest,
  BackendSymbolAtPositionResult,
  BackendFormattingRequest,
  BackendFormattingResult,
  BackendHoverRequest,
  BackendHoverResult,
  BackendCodeAction,
  BackendCodeActionsRequest,
  BackendCodeActionsResult,
  BackendInlayHint,
  BackendInlayHintsRequest,
  BackendInlayHintsResult,
  BackendSelectionRange,
  BackendSelectionRangeRequest,
  BackendSelectionRangeResult,
  BackendSemanticToken,
  BackendSemanticTokenType,
  BackendSemanticTokensRequest,
  BackendSemanticTokensResult,
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
  typecheckResult: ReturnType<typeof computeTypecheckResult>,
): string | undefined {
  if (request.source === undefined) return undefined
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

// Is the inferred type one a user would call like a function? Used by the
// semantic-tokens layer to refine destructured-import bindings — `let { sin
// } = import("math")` should color `sin` as a function because `math.sin`
// is `(Number) -> Number & (Number[]) -> Number[] & ...`, an intersection
// of function types. Three shapes show up in practice:
//   - `Function` / `AnyFunction` — the simple case.
//   - `Inter` of callable members — overload-set shape (math.sin's "function
//     for Number, function for Number[], …").
//   - `Var` with callable lower bounds — what `findTypeAtPosition` returns
//     at a reference site (the variable that *holds* the type, not the
//     resolved shape).
// Deeper unions of callables are out of scope until we hit them in practice.
type MaybeCallable = {
  tag: string
  members?: readonly MaybeCallable[]
  lowerBounds?: readonly MaybeCallable[]
}
function isCallableType(type: MaybeCallable): boolean {
  if (type.tag === 'Function' || type.tag === 'AnyFunction') return true
  if (type.tag === 'Inter' && type.members && type.members.length > 0) {
    return type.members.every(isCallableType)
  }
  if (type.tag === 'Var' && type.lowerBounds && type.lowerBounds.length > 0) {
    return type.lowerBounds.every(isCallableType)
  }
  return false
}

// Walk the AST to find the smallest (innermost) Match node whose range
// contains the given (1-based) position. Returns just the range info the
// catchall-quick-fix helper needs — endLine / endColumn. Used by the code-
// actions handler to locate the match an exhaustiveness-diagnostic refers
// to. Returns `null` when no Match wraps the position; the caller skips
// this action for that diagnostic.
// Find the Let AST node whose simple-symbol binding matches `def`'s
// location, and return the source ranges needed by the inline-variable
// refactor (the let's full range + the value expression's range).
// Returns `null` if no such Let exists, the binding isn't a simple-symbol
// shape, or any of the ranges are missing from the source map.
function findEnclosingLetRanges(
  ast: readonly AstNode[],
  sourceMap: Map<number, SourceMapPosition> | undefined,
  def: SymbolDef,
): {
  letStartLine: number
  letStartColumn: number
  letEndLine: number
  letEndColumn: number
  valueStartLine: number
  valueStartColumn: number
  valueEndLine: number
  valueEndColumn: number
} | null {
  if (!sourceMap) return null
  let result: ReturnType<typeof findEnclosingLetRanges> | null = null
  walkAst(ast, node => {
    if (result) return
    if (node[0] !== NodeTypes.Let || !Array.isArray(node[1])) return
    const [bindingTarget, valueExpr] = node[1] as [AstNode, AstNode]
    // Simple-symbol binding only: `bindingTargetTypes.symbol` shape =
    // ['symbol', [SymNode, default?], nodeId]. We don't handle
    // destructuring (array / object), rest, or literal patterns — the
    // refactor's semantics there are different ("inline one element" /
    // "inline one field" each need their own design).
    // BindingTarget is typed as `AstNode` here but `bindingTarget[0]` is a
    // BindingTargetType (`'symbol' | 'array' | 'object' | …`), not a
    // NodeType. The cast bypasses the type-incompat check; the value
    // is a string at runtime regardless.
    if ((bindingTarget[0] as string) !== 'symbol' || !Array.isArray(bindingTarget[1])) return
    const symNode = (bindingTarget[1] as [AstNode, AstNode | undefined])[0]
    if (symNode[0] !== NodeTypes.Sym || symNode[1] !== def.name) return
    // Match by source position rather than nodeId — the symbol-table
    // builder registers the def with the SymNode's nodeId, but the
    // bindingTarget itself has a different nodeId, and various consumers
    // pick differently. Position is the stable identifier.
    const symPos = sourceMap.get(symNode[symNode.length - 1] as number)
    if (!symPos) return
    if (symPos.start[0] + 1 !== def.location.line || symPos.start[1] + 1 !== def.location.column) return
    const letPos = sourceMap.get(node[node.length - 1] as number)
    const valuePos = sourceMap.get(valueExpr[valueExpr.length - 1] as number)
    if (!letPos || !valuePos) return
    result = {
      letStartLine: letPos.start[0] + 1,
      letStartColumn: letPos.start[1] + 1,
      letEndLine: letPos.end[0] + 1,
      letEndColumn: letPos.end[1] + 1,
      valueStartLine: valuePos.start[0] + 1,
      valueStartColumn: valuePos.start[1] + 1,
      valueEndLine: valuePos.end[0] + 1,
      valueEndColumn: valuePos.end[1] + 1,
    }
  })
  return result
}

function findEnclosingMatchRange(
  ast: readonly AstNode[],
  sourceMap: Map<number, SourceMapPosition> | undefined,
  line: number,
  column: number,
): { endLine: number; endColumn: number } | null {
  if (!sourceMap) return null
  // Position is 1-based; sourceMap stores 0-based. Compare in 0-based space.
  const targetLine = line - 1
  const targetCol = column - 1
  let best: { pos: SourceMapPosition; size: number } | undefined
  walkAst(ast, node => {
    if (node[0] !== NodeTypes.Match) return
    const nodeId = node[node.length - 1] as number
    const pos = sourceMap.get(nodeId)
    if (!pos || !positionContains(pos, targetLine, targetCol)) return
    const size = rangeSize(pos)
    if (!best || size < best.size) best = { pos, size }
  })
  if (!best) return null
  return { endLine: best.pos.end[0] + 1, endColumn: best.pos.end[1] + 1 }
}

// Walk the AST and collect every node whose source range contains the
// given position. Returns the containment chain innermost → outermost,
// converted to portable `BackendSelectionRange` shape. VS Code's
// `SelectionRangeProvider` rebuilds these into a linked list so Alt+Shift+→
// steps through them.
function collectSelectionRanges(
  ast: readonly AstNode[],
  sourceMap: Map<number, SourceMapPosition> | undefined,
  position: { line: number; column: number },
): BackendSelectionRange[] {
  if (!sourceMap) return []
  // Position is 1-based; sourceMap stores 0-based. Compare in 0-based space.
  const targetLine = position.line - 1
  const targetCol = position.column - 1
  const containing: SourceMapPosition[] = []
  walkAst(ast, node => {
    const nodeId = node[node.length - 1] as number
    const pos = sourceMap.get(nodeId)
    if (pos && positionContains(pos, targetLine, targetCol)) {
      containing.push(pos)
    }
  })
  // Sort by range size — innermost (smallest) first. Stable sort preserves
  // sibling order when ranges happen to be equal (rare but possible after
  // collapsed-source edge cases).
  containing.sort((a, b) => rangeSize(a) - rangeSize(b))
  // Deduplicate consecutive identical ranges (degenerate AST nodes that
  // share their parent's exact span — e.g. single-statement Block).
  const result: BackendSelectionRange[] = []
  let prev: BackendSelectionRange | undefined
  for (const pos of containing) {
    const range: BackendSelectionRange = {
      startLine: pos.start[0] + 1,
      startColumn: pos.start[1] + 1,
      endLine: pos.end[0] + 1,
      endColumn: pos.end[1] + 1,
    }
    if (
      !prev ||
      prev.startLine !== range.startLine ||
      prev.startColumn !== range.startColumn ||
      prev.endLine !== range.endLine ||
      prev.endColumn !== range.endColumn
    ) {
      result.push(range)
      prev = range
    }
  }
  return result
}

function positionContains(pos: SourceMapPosition, line: number, column: number): boolean {
  const afterStart = line > pos.start[0] || (line === pos.start[0] && column >= pos.start[1])
  const beforeEnd = line < pos.end[0] || (line === pos.end[0] && column <= pos.end[1])
  return afterStart && beforeEnd
}

function rangeSize(pos: SourceMapPosition): number {
  // Approximate "size" by the line span × a large constant + column delta,
  // so multi-line nodes always rank larger than single-line ones. Exact
  // char count would need the source text; this is enough to order
  // containment chains correctly.
  const lineSpan = pos.end[0] - pos.start[0]
  if (lineSpan === 0) return pos.end[1] - pos.start[1]
  return lineSpan * 1_000_000 + pos.end[1] - pos.start[1]
}

// Walk the AST, find every Call node, and emit a parameter-name inlay hint
// at each argument position. Two callee shapes resolve to parameter names:
//
//   - Sym callee resolving to a user-defined function/macro: name list lives
//     on the SymbolDef's `params`.
//   - Builtin callee: name list lives on `allReference[name].args` (we use
//     the first variant — overload-disambiguated hints are out of scope
//     until we can pick the matching variant from argument types).
//
// Skip arguments that are bare symbol references matching their param name
// (`add(a, b)` doesn't need labels — they're self-documenting). The label
// reads `name:` to match VS Code's parameter-hint convention.
function collectCallInlayHints(
  ast: readonly AstNode[],
  sourceMap: Map<number, SourceMapPosition> | undefined,
  refByNodeId: Map<number, FileSymbols['references'][number]>,
  out: BackendInlayHint[],
): void {
  walkAst(ast, node => {
    if (node[0] !== NodeTypes.Call || !Array.isArray(node[1])) return
    const [callee, args] = node[1] as [AstNode, AstNode[]]
    const params = paramNamesForCallee(callee, refByNodeId)
    if (params) emitArgHints(args, params, sourceMap, out)
  })
}

function isAstNode(value: unknown): value is AstNode {
  return Array.isArray(value) && typeof value[0] === 'string' && typeof value[value.length - 1] === 'number'
}

// Walk every AST node reachable from the given top-level list, invoking
// `visit` on each one. Handles arbitrary payload nesting — Match cases
// (a depth-3 structure where each case is `[BindingTarget, body, guard]`),
// destructuring-binding defaults (AstNodes buried inside BindingTarget
// payloads), and any future shape that nests AstNodes more than two levels
// deep. The previous per-site loops only descended two levels and missed
// Match case bodies, so nested-match scenarios went unvisited — see the
// regression tests for nested catchall quick-fixes, selection-range chains,
// and inlay hints for the user-facing consequences.
function walkAst(nodes: readonly AstNode[], visit: (node: AstNode) => void): void {
  for (const node of nodes) walkAstNode(node, visit)
}

function walkAstNode(node: AstNode, visit: (node: AstNode) => void): void {
  visit(node)
  descendAstChildren(node[1], visit)
}

function descendAstChildren(value: unknown, visit: (node: AstNode) => void): void {
  if (isAstNode(value)) {
    walkAstNode(value, visit)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) descendAstChildren(item, visit)
  }
}

function paramNamesForCallee(
  callee: AstNode,
  refByNodeId: Map<number, FileSymbols['references'][number]>,
): readonly string[] | null {
  if (callee[0] === NodeTypes.Sym) {
    const ref = refByNodeId.get(callee[2])
    const params = ref?.resolvedDef?.params
    return params && params.length > 0 ? params : null
  }
  if (callee[0] === NodeTypes.Builtin) {
    const name = callee[1] as string
    // Skip operator builtins (`+`, `==`, `&&`, …). They lower to Call nodes
    // but emit as infix syntax; param-name hints on operator arguments are
    // noise (`a + b` → `xs: a + b` reads as garbled punctuation). The
    // identifier-name predicate excludes any builtin whose name isn't a
    // valid Dvala identifier — which is exactly the operator set.
    if (!isDvalaIdentifierName(name)) return null
    const ref = allReference[name]
    if (ref && isFunctionReference(ref)) {
      const variant = ref.variants[0]
      return variant && variant.argumentNames.length > 0 ? variant.argumentNames : null
    }
  }
  return null
}

function emitArgHints(
  args: readonly AstNode[],
  params: readonly string[],
  sourceMap: Map<number, SourceMapPosition> | undefined,
  out: BackendInlayHint[],
): void {
  if (!sourceMap) return
  for (let i = 0; i < args.length && i < params.length; i++) {
    const arg = args[i]!
    const paramName = params[i]!
    // Skip self-documenting arg: `add(a, b)` — the variable name already
    // matches the param, the hint would be visual noise.
    if (arg[0] === NodeTypes.Sym && arg[1] === paramName) continue
    const pos = sourceMap.get(arg[arg.length - 1] as number)
    if (!pos) continue
    out.push({ line: pos.start[0] + 1, column: pos.start[1] + 1, label: `${paramName}:` })
  }
}

// SymbolDef.kind values map to LSP-standard semantic-token types. `handler`
// is a regular `variable` to the editor (its handler-ness shows up via the
// symbol's documentation, not coloring); `import` becomes `namespace` so
// imported aliases get the same theme treatment as module references.
function symbolKindToTokenType(kind: SymbolDef['kind']): BackendSemanticTokenType {
  switch (kind) {
    case 'function':
      return 'function'
    case 'macro':
      return 'macro'
    case 'parameter':
      return 'parameter'
    case 'import':
      return 'namespace'
    case 'handler':
    case 'variable':
      return 'variable'
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

  // Per-document typecheck cache, keyed by path. Stores the last-computed
  // typecheck result for the given (path, version). A cache hit at the
  // current version is shared across requests at that version (diagnostics,
  // hover, semantic tokens, inlay hints) — so a single keystroke pays for at
  // most one full typecheck regardless of how many features ask for type info.
  //
  // Invalidation policy: any document mutation (open / update / close /
  // persistFile / removeFile) clears the whole cache. Cross-file imports
  // mean a sibling file's edit can invalidate this file's typecheck, and
  // tracking that dependency precisely is more machinery than the simple
  // "wipe on any mutation" policy buys us. The same-version multi-feature
  // amortisation — the headline win — survives that.
  type CachedTypecheck = ReturnType<typeof computeTypecheckResult>
  const typecheckCache = new Map<string, { version: BackendDocumentVersion; result: CachedTypecheck }>()

  function getOrComputeTypecheck(path: string, source: string, version: BackendDocumentVersion): CachedTypecheck {
    const cached = typecheckCache.get(path)
    if (cached && cached.version === version) return cached.result
    const result = computeTypecheckResult(source, path, documents, options.createDvala)
    typecheckCache.set(path, { version, result })
    return result
  }

  function invalidateTypecheckCache(): void {
    typecheckCache.clear()
  }

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
      invalidateTypecheckCache()
    },

    async updateDocument(document: BackendTextDocument, previousVersion: BackendDocumentVersion) {
      const result = documents.update(document, previousVersion)
      invalidateTypecheckCache()
      return result
    },

    async closeDocument(path: string): Promise<void> {
      documents.close(path)
      invalidateTypecheckCache()
    },

    async persistFile(request): Promise<void> {
      documents.persistFile(request)
      invalidateTypecheckCache()
    },

    async removeFile(request): Promise<void> {
      documents.removeFile(request)
      invalidateTypecheckCache()
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

        const typecheckResult = getOrComputeTypecheck(openDocument.path, openDocument.source, openDocument.version)
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

        const effectiveSource = request.source ?? openDocument?.source
        const effectiveVersion = openDocument?.version ?? request.version
        const inferredType = effectiveSource
          ? computeHoverResult(
              { ...request, source: effectiveSource },
              getOrComputeTypecheck(request.path, effectiveSource, effectiveVersion),
            )
          : undefined
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

    async requestSemanticTokens(request: BackendSemanticTokensRequest): Promise<BackendSemanticTokensResult> {
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

      try {
        const index = new WorkspaceIndex()
        indexBackendDocuments(request.path, documents, index)
        const fileSymbols = index.getFileSymbols(request.path)
        if (!fileSymbols) {
          return {
            ok: true,
            requestId: request.requestId,
            path: request.path,
            version: request.version,
            tokens: [],
          }
        }

        // Position E (type-info-aware): a destructured-import binding
        // (`let { foo } = import("math")`) holds whatever `math.foo` is,
        // not the module itself. The symbol table tags it kind="import",
        // but coloring it as "namespace" would be wrong — `foo` is a
        // function or variable.
        //
        // We refine via the typechecker's typeMap. The destructure-key
        // node itself doesn't have a typeMap entry (the typechecker
        // records types at reference Sym nodes, not destructure keys), so
        // we precompute one reference nodeId per def and look the type up
        // via that. Using nodeId directly (rather than position) avoids
        // the position-based ambiguity where `sin(0)` shares its start
        // with the callee `sin` and `findTypeAtPosition` would return the
        // call expression's result type instead of the callee's.
        const effectiveSource = request.source ?? openDocument?.source ?? ''
        const effectiveVersion = openDocument?.version ?? request.version
        const typecheckResult = getOrComputeTypecheck(request.path, effectiveSource, effectiveVersion)
        const firstRefNodeByDef = new Map<SymbolDef, number>()
        for (const ref of fileSymbols.references) {
          if (!ref.resolvedDef || firstRefNodeByDef.has(ref.resolvedDef)) continue
          firstRefNodeByDef.set(ref.resolvedDef, ref.nodeId)
        }
        const resolveTokenType = (def: SymbolDef): BackendSemanticTokenType => {
          if (def.kind !== 'import' || def.importedName === undefined) return symbolKindToTokenType(def.kind)
          const refNode = firstRefNodeByDef.get(def)
          if (refNode === undefined) return 'variable'
          const inferred = typecheckResult.typeMap.get(refNode)
          if (inferred && isCallableType(inferred)) return 'function'
          return 'variable'
        }

        // Walk every definition + reference in the file and emit a portable
        // token tagged with the symbol's kind. Sorting by (line, startColumn)
        // lets the VS Code adapter delta-encode without an extra sort pass.
        const tokens: BackendSemanticToken[] = []
        for (const def of fileSymbols.definitions) {
          tokens.push({
            line: def.location.line,
            startColumn: def.location.column,
            length: def.name.length,
            tokenType: resolveTokenType(def),
            modifiers: ['declaration'],
          })
        }
        for (const ref of fileSymbols.references) {
          if (!ref.resolvedDef) continue // unresolved — leave to the TextMate fallback
          tokens.push({
            line: ref.location.line,
            startColumn: ref.location.column,
            length: ref.name.length,
            tokenType: resolveTokenType(ref.resolvedDef),
            modifiers: [],
          })
        }
        tokens.sort((a, b) => a.line - b.line || a.startColumn - b.startColumn)

        return {
          ok: true,
          requestId: request.requestId,
          path: request.path,
          version: request.version,
          tokens,
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

    async requestInlayHints(request: BackendInlayHintsRequest): Promise<BackendInlayHintsResult> {
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

      try {
        const effectiveSource = request.source ?? openDocument?.source ?? ''
        const effectiveVersion = openDocument?.version ?? request.version
        const index = new WorkspaceIndex()
        indexBackendDocuments(request.path, documents, index)
        const fileSymbols = index.getFileSymbols(request.path)
        if (!fileSymbols) {
          return { ok: true, requestId: request.requestId, path: request.path, version: request.version, hints: [] }
        }
        // The typecheck-cached sourceMap maps nodeId → position. We parse
        // afresh here because the typecheck result doesn't hand back the AST.
        const ast = parseToAst(
          minifyTokenStream(tokenizeSource(effectiveSource, true, request.path), { removeWhiteSpace: true }),
        )
        const typecheckResult = getOrComputeTypecheck(request.path, effectiveSource, effectiveVersion)
        const refByNodeId = new Map(fileSymbols.references.map(ref => [ref.nodeId, ref]))
        const hints: BackendInlayHint[] = []
        collectCallInlayHints(ast.body, typecheckResult.sourceMap, refByNodeId, hints)
        return { ok: true, requestId: request.requestId, path: request.path, version: request.version, hints }
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

    async requestCodeActions(request: BackendCodeActionsRequest): Promise<BackendCodeActionsResult> {
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

      try {
        const effectiveSource = request.source ?? openDocument?.source ?? ''
        const ast = parseToAst(
          minifyTokenStream(tokenizeSource(effectiveSource, true, request.path), { removeWhiteSpace: true }),
        )
        const effectiveVersion = openDocument?.version ?? request.version
        const typecheckResult = getOrComputeTypecheck(request.path, effectiveSource, effectiveVersion)
        const actions: BackendCodeAction[] = []

        // Quick-fix: "Insert catchall" for `Non-exhaustive match` diagnostics.
        // The diagnostic carries enough position info; we find the Match AST
        // node containing the diagnostic's start, then ask the helper for an
        // edit that adds `case _ then perform(@dvala.error, ...)` before
        // the closing `end`. One diagnostic → one action (no fan-out yet).
        for (const diagnostic of request.diagnostics) {
          if (!diagnostic.message.startsWith('Non-exhaustive match')) continue
          const matchRange = findEnclosingMatchRange(
            ast.body,
            typecheckResult.sourceMap,
            diagnostic.startLine,
            diagnostic.startColumn,
          )
          if (!matchRange) continue
          const edit = computeCatchallEdit(effectiveSource, matchRange)
          if (!edit) continue
          actions.push({
            title: "Add 'case _ then perform(@dvala.error, ...)' catchall",
            kind: 'quickfix',
            edits: [edit],
            fixesDiagnostics: [
              {
                message: diagnostic.message,
                startLine: diagnostic.startLine,
                startColumn: diagnostic.startColumn,
                endLine: diagnostic.endLine,
                endColumn: diagnostic.endColumn,
              },
            ],
          })
        }

        // Refactor: inline variable. Triggered when the cursor sits on
        // the def site of a `let x = expr;` binding. We bail if the
        // binding isn't a simple-symbol `let` (destructuring, function
        // values, handlers — anything more complex than a single Sym on
        // the LHS), or if the `let` doesn't occupy its own source line
        // (mid-statement positioning would require either inserting the
        // value text inline or computing a partial-line removal range,
        // both of which are v2 polish).
        const inlineIndex = new WorkspaceIndex()
        indexBackendDocuments(request.path, documents, inlineIndex)
        // `findDefinition` only matches REFERENCE positions — it follows a
        // reference back to its def. For inline-variable we also want to
        // trigger when the cursor sits ON the def site. Fall back to
        // scanning `fileSymbols.definitions` for a def whose location spans
        // the cursor (start ≤ cursor < start + name.length).
        const inlineFileSymbols = inlineIndex.getFileSymbols(request.path)
        let cursorDef = inlineIndex.findDefinition(request.path, request.startLine, request.startColumn)
        if (!cursorDef && inlineFileSymbols) {
          cursorDef =
            inlineFileSymbols.definitions.find(
              d =>
                d.location.line === request.startLine &&
                request.startColumn >= d.location.column &&
                request.startColumn < d.location.column + d.name.length,
            ) ?? null
        }
        if (cursorDef && cursorDef.kind === 'variable') {
          const letInfo = findEnclosingLetRanges(ast.body, typecheckResult.sourceMap, cursorDef)
          if (letInfo) {
            const sourceLines = effectiveSource.split('\n')
            const letLineText = sourceLines[letInfo.letStartLine - 1]
            // v1 restriction: let must occupy its own line. The `letStartLine`
            // and `letEndLine` are equal, and the line's trimmed contents
            // start at the let.
            const letOccupiesLine =
              letLineText !== undefined &&
              letInfo.letStartLine === letInfo.letEndLine &&
              letLineText.slice(0, letInfo.letStartColumn - 1).trim() === ''
            if (letOccupiesLine) {
              const valueLine = sourceLines[letInfo.valueStartLine - 1]
              if (valueLine !== undefined && letInfo.valueStartLine === letInfo.valueEndLine) {
                const valueText = valueLine.slice(letInfo.valueStartColumn - 1, letInfo.valueEndColumn - 1)
                const fileSymbolsForInline = inlineIndex.getFileSymbols(request.path)
                const references: InlineReferenceLocation[] = (fileSymbolsForInline?.references ?? [])
                  .filter(ref => ref.resolvedDef === cursorDef)
                  .map(ref => ({ line: ref.location.line, column: ref.location.column, length: ref.name.length }))
                const inlineEdits = computeInlineVariableEdits({
                  source: effectiveSource,
                  // Remove the whole line including its trailing newline by
                  // ranging from start-of-line through start-of-next-line.
                  letRemoveStartLine: letInfo.letStartLine,
                  letRemoveStartColumn: 1,
                  letRemoveEndLine: letInfo.letStartLine + 1,
                  letRemoveEndColumn: 1,
                  valueText,
                  references,
                })
                if (inlineEdits) {
                  actions.push({
                    title: `Inline variable '${cursorDef.name}'`,
                    kind: 'refactor.inline',
                    edits: inlineEdits,
                  })
                }
              }
            }
          }
        }

        // Refactor: extract variable. Triggered when the user has a
        // non-zero-width selection. We trust the selection as-is rather
        // than aligning to an AST node — Dvala source maps for binary
        // operators don't cover the full expression text (e.g. `1 + 2`'s
        // Call node has a range starting at the operator, not the first
        // operand), so AST-based alignment would silently expand
        // selections in surprising ways. The user is responsible for
        // selecting a syntactically sensible region; the action runs even
        // if the selection isn't an expression, on the theory that
        // refactor.* actions only fire from Cmd+. and that's a deliberate
        // invocation.
        const hasNonEmptySelection =
          request.startLine < request.endLine ||
          (request.startLine === request.endLine && request.endColumn > request.startColumn)
        if (hasNonEmptySelection) {
          const refactorEdits = computeExtractVariableEdit({
            source: effectiveSource,
            expressionStartLine: request.startLine,
            expressionStartColumn: request.startColumn,
            expressionEndLine: request.endLine,
            expressionEndColumn: request.endColumn,
            // v1: insert above the selection's start line. Multi-line
            // statements with the selection mid-block aren't handled
            // specially — the user can move the inserted line after if
            // it lands in an awkward spot.
            statementStartLine: request.startLine,
            statementStartColumn: request.startColumn,
          })
          if (refactorEdits) {
            // Title carries a preview of the extracted text so the menu
            // entry tells the user which span they're acting on.
            const exprText = effectiveSource
              .split('\n')
              [request.startLine - 1]!.slice(request.startColumn - 1, request.endColumn - 1)
            const previewText = exprText.length > 40 ? `${exprText.slice(0, 37)}...` : exprText
            actions.push({
              title: `Extract '${previewText}' to variable`,
              kind: 'refactor.extract',
              edits: [refactorEdits.letInsertion, refactorEdits.expressionReplacement],
            })
          }

          // Refactor: extract function. Same selection-trust strategy as
          // extract-variable. Free-variable analysis: any reference whose
          // resolved def lives OUTSIDE the selection becomes a parameter.
          // We dedupe by name and preserve appearance order (the order
          // refs show up while walking the selection range).
          const fnIndex = new WorkspaceIndex()
          indexBackendDocuments(request.path, documents, fnIndex)
          const fnFileSymbols = fnIndex.getFileSymbols(request.path)
          const positionInsideSelection = (line: number, column: number): boolean =>
            (line > request.startLine || (line === request.startLine && column >= request.startColumn)) &&
            (line < request.endLine || (line === request.endLine && column < request.endColumn))
          const freeVars: string[] = []
          const seenFreeVars = new Set<string>()
          for (const ref of fnFileSymbols?.references ?? []) {
            if (!ref.resolvedDef) continue
            if (!positionInsideSelection(ref.location.line, ref.location.column)) continue
            // Def inside the selection means the binding is local to the
            // extracted body — not a free variable.
            if (positionInsideSelection(ref.resolvedDef.location.line, ref.resolvedDef.location.column)) continue
            if (seenFreeVars.has(ref.name)) continue
            seenFreeVars.add(ref.name)
            freeVars.push(ref.name)
          }
          const fnEdits = computeExtractFunctionEdit({
            source: effectiveSource,
            selectionStartLine: request.startLine,
            selectionStartColumn: request.startColumn,
            selectionEndLine: request.endLine,
            selectionEndColumn: request.endColumn,
            freeVars,
          })
          if (fnEdits) {
            const fnSelectionText = effectiveSource
              .split('\n')
              [request.startLine - 1]!.slice(request.startColumn - 1, request.endColumn - 1)
              .trim()
            const fnPreview = fnSelectionText.length > 40 ? `${fnSelectionText.slice(0, 37)}...` : fnSelectionText
            actions.push({
              title: fnPreview ? `Extract '${fnPreview}' to function` : 'Extract selection to function',
              kind: 'refactor.extract',
              edits: [fnEdits.letInsertion, fnEdits.selectionReplacement],
            })
          }
        }

        return { ok: true, requestId: request.requestId, path: request.path, version: request.version, actions }
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

    async requestSelectionRange(request: BackendSelectionRangeRequest): Promise<BackendSelectionRangeResult> {
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

      try {
        const effectiveSource = request.source ?? openDocument?.source ?? ''
        const effectiveVersion = openDocument?.version ?? request.version
        // The cache already has the sourceMap we need from any prior request
        // at this version (diagnostics, hover, etc.). First call here pays
        // for the typecheck; subsequent semantic-tokens / inlay-hints calls
        // at the same version hit free.
        const typecheckResult = getOrComputeTypecheck(request.path, effectiveSource, effectiveVersion)
        const ast = parseToAst(
          minifyTokenStream(tokenizeSource(effectiveSource, true, request.path), { removeWhiteSpace: true }),
        )
        const ranges = request.positions.map(position =>
          collectSelectionRanges(ast.body, typecheckResult.sourceMap, position),
        )
        return { ok: true, requestId: request.requestId, path: request.path, version: request.version, ranges }
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

    async requestSymbolAtPosition(request: BackendSymbolAtPositionRequest): Promise<BackendSymbolAtPositionResult> {
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

      try {
        const index = new WorkspaceIndex()
        indexBackendDocuments(request.path, documents, index)
        const symbolAtPos = index.getSymbolAtPosition(request.path, request.line, request.column)
        return {
          ok: true,
          requestId: request.requestId,
          path: request.path,
          version: request.version,
          ...(symbolAtPos
            ? {
                symbol: {
                  name: symbolAtPos.name,
                  ...(symbolAtPos.onKey ? { onKey: true } : {}),
                },
              }
            : {}),
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
