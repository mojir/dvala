/**
 * Main-thread client for the Dvala Language Service Web Worker.
 *
 * Owns the worker lifecycle, streams edit deltas, and debounces diagnostics
 * requests. Consumers call `initLspWorker()` once during boot, then
 * `registerModel(path, model)` whenever a Monaco model is created or
 * `unregisterModel(path)` when one is disposed. Edit deltas are pushed via
 * `updateDocument(path, source, sourceVersion)`.
 */

import * as monaco from 'monaco-editor'
// eslint-disable-next-line import/default
import LsWorker from './lsWorker?worker'
import { allReference, isCustomReference, isFunctionReference } from '../../reference/index'
import type { Reference } from '../../reference/index'
import type { Diagnostic } from '../../src/shared/types'
import { formatSource, tokenizeSource } from '../../src/tooling'
import { typecheck, WorkspaceIndex } from '../../src/internal'
import type { TypecheckResult } from '../../src/internal'
import { findCallContext } from '../../src/shared/callContext'
import { buildTypeDiagnostics } from '../../src/shared/diagnosticBuilder'
import { findTypeAtDefinition, findTypeAtPosition, formatHoverType } from '../../src/shared/typeDisplay'
import { allBuiltinModules } from '../../src/allModules'
import { parseToAst } from '../../src/parser'
import { minifyTokenStream } from '../../src/tokenizer/minifyTokenStream'
import { getWorkspaceFiles } from './fileStorage'
import { folderFromPath, isInPlaygroundFolder } from './filePath'
import { HANDLERS_FILE_PATH } from './handlersBuffer'
import { resolvePlaygroundPath } from './playgroundFileResolver'
import { SCRATCH_FILE_PATH } from './scratchBuffer'
import {
  getImportCompletionItems,
  getImportCompletionPrefix,
  getImportedExportCompletionItems,
  getScopedCompletionItems,
} from './lsCompletions'

import type { CompletionItem } from '../../src/shared/completionBuilder'

const referenceByTitle = new Map(Object.values(allReference).map(ref => [ref.title, ref]))

function buildHoverMarkdown(name: string, ref: Reference): string {
  const parts: string[] = [`**${name}**`, '', ref.description]

  if (isFunctionReference(ref)) {
    parts.push('')
    for (const variant of ref.variants) {
      parts.push(`\`${name}(${variant.argumentNames.join(', ')})\``)
    }
    const argEntries = Object.entries(ref.args)
    if (argEntries.length > 0) {
      parts.push('')
      for (const [argName, arg] of argEntries) {
        const typeStr = Array.isArray(arg.type) ? arg.type.join(' | ') : arg.type
        parts.push(`- \`${argName}\`: *${typeStr}*${arg.description ? ` - ${arg.description}` : ''}`)
      }
    }
  } else if (isCustomReference(ref)) {
    parts.push('')
    for (const variant of ref.customVariants) {
      parts.push(`\`${variant}\``)
    }
  }

  if (ref.examples.length > 0) {
    const ex0 = ref.examples[0]
    if (!ex0) return parts.join('\n')
    parts.push('', '**Example:**', typeof ex0 === 'string' ? `\`${ex0}\`` : `\`${ex0.code}\``)
  }

  return parts.join('\n')
}

function formatHoverFileLabel(path: string): string {
  if (path === SCRATCH_FILE_PATH) return '<scratch>'
  if (path === HANDLERS_FILE_PATH) return '<handlers>'
  return path
}

function buildSourceLocationMarkdown(file: string, line: number, column: number): string {
  return `Defined at \`${formatHoverFileLabel(file)}:${line}:${column}\``
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map portable CompletionItem.kind to Monaco's CompletionItemKind enum. */
function kindToMonaco(kind: CompletionItem['kind']): monaco.languages.CompletionItemKind {
  switch (kind) {
    case 'function':
      return monaco.languages.CompletionItemKind.Function
    case 'method':
      return monaco.languages.CompletionItemKind.Method
    case 'event':
      return monaco.languages.CompletionItemKind.Event
    case 'module':
      return monaco.languages.CompletionItemKind.Module
    case 'class':
      return monaco.languages.CompletionItemKind.Class
    case 'keyword':
      return monaco.languages.CompletionItemKind.Keyword
    case 'operator':
      return monaco.languages.CompletionItemKind.Operator
    case 'variable':
      return monaco.languages.CompletionItemKind.Variable
  }
}

/**
 * Tokenize, parse, and typecheck source on the main thread. Typecheck lives
 * here (not in the worker) because its dependency chain hits .dvala files
 * through builtin, which Vite's worker bundler can't handle.
 */
function typecheckForDiagnostics(source: string, path: string): TypecheckResult {
  const tokens = tokenizeSource(source, true, path)
  try {
    // Use parseToAst (not parseRecoverable) — parseToAst includes
    // typeAnnotations which the typechecker needs to enforce
    // annotations like `let n: Number = ""`.
    const minified = minifyTokenStream(tokens, { removeWhiteSpace: true })
    const ast = parseToAst(minified)
    indexWorkspaceFile(path, source)
    return typecheck(ast, { modules: allBuiltinModules })
  } catch {
    // parseToAst threw on broken code — return empty diagnostics.
    // Parse errors are already reported by the worker's recover-parse.
    return { diagnostics: [], typeMap: new Map(), sourceMap: undefined }
  }
}

// ── Worker lifetime ───────────────────────────────────────────────────────────

let worker: Worker | null = null
let nextRequestId = 1

/** Debounce timers keyed by path. */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Pending request IDs keyed by path for cancellation. */
const pendingRequests = new Map<string, number>()

/** Latest typecheck result per path, for hover queries. */
const typecheckCache = new Map<string, TypecheckResult>()

/** Source version associated with the latest cached typecheck result. */
const typecheckVersions = new Map<string, number>()

/** Workspace symbol index for go-to-def / find-references. */
const workspaceIndex = new WorkspaceIndex()

/** Registered Monaco models keyed by path. */
const registeredModels = new Map<string, monaco.editor.ITextModel>()

function resolveWorkspaceImportPath(rawPath: string, fromFile: string): string | null {
  if (!(rawPath.startsWith('.') || rawPath.startsWith('/'))) return null
  let resolved: string
  try {
    resolved = resolvePlaygroundPath(folderFromPath(fromFile), rawPath)
  } catch {
    return null
  }
  if (isInPlaygroundFolder(resolved)) return null
  const files = getWorkspaceFiles()
  if (files.some(file => file.path === resolved)) return resolved
  if (files.some(file => file.path === `${resolved}.dvala`)) return `${resolved}.dvala`
  return null
}

function indexWorkspaceFile(path: string, source: string, seen = new Set<string>()): void {
  if (seen.has(path)) return
  seen.add(path)

  const fileSymbols = workspaceIndex.updateFile(path, source, resolveWorkspaceImportPath)
  const files = getWorkspaceFiles()
  for (const importedPath of fileSymbols.imports.values()) {
    if (seen.has(importedPath)) continue
    const importedFile = files.find(file => file.path === importedPath)
    if (!importedFile) continue
    indexWorkspaceFile(importedFile.path, importedFile.code, seen)
  }
}

function getWorker(): Worker {
  if (!worker) worker = new LsWorker()
  return worker
}

function dedupeCompletionItems(items: CompletionItem[]): CompletionItem[] {
  const seen = new Set<string>()
  const deduped: CompletionItem[] = []
  for (const item of items) {
    if (seen.has(item.label)) continue
    seen.add(item.label)
    deduped.push(item)
  }
  return deduped
}

function getDefinitionsAtPosition(path: string, position: monaco.Position): monaco.languages.Location[] | null {
  const def = workspaceIndex.findDefinition(path, position.lineNumber, position.column)
  if (!def) return null
  return [
    {
      uri: monaco.Uri.parse(`dvala:///${def.location.file}`),
      range: {
        startLineNumber: def.location.line,
        startColumn: def.location.column,
        endLineNumber: def.location.line,
        endColumn: def.location.column + def.name.length,
      },
    },
  ]
}

function getReferencesAtPosition(path: string, position: monaco.Position): monaco.languages.Location[] | null {
  const canonical = workspaceIndex.resolveCanonicalFile(path, position.lineNumber, position.column)
  if (!canonical) return null
  const occurrences = workspaceIndex.findAllOccurrences(canonical.file, canonical.name)
  if (occurrences.length === 0) return null
  return occurrences.map(loc => ({
    uri: monaco.Uri.parse(`dvala:///${loc.file}`),
    range: {
      startLineNumber: loc.line,
      startColumn: loc.column,
      endLineNumber: loc.line,
      endColumn: loc.column + loc.nameLength,
    },
  }))
}

function getRenameEditsAtPosition(
  path: string,
  position: monaco.Position,
  newName: string,
): monaco.languages.WorkspaceEdit | null {
  const canonical = workspaceIndex.resolveCanonicalFile(path, position.lineNumber, position.column)
  if (!canonical) return null
  const occurrences = workspaceIndex.findAllOccurrences(canonical.file, canonical.name)
  if (occurrences.length === 0) return null

  const edits: monaco.languages.IWorkspaceTextEdit[] = occurrences.map(loc => ({
    resource: monaco.Uri.parse(`dvala:///${loc.file}`),
    textEdit: {
      range: {
        startLineNumber: loc.line,
        startColumn: loc.column,
        endLineNumber: loc.line,
        endColumn: loc.column + loc.nameLength,
      },
      text: newName,
    },
    versionId: undefined,
  }))
  return { edits }
}

function formatModel(model: monaco.editor.ITextModel): monaco.languages.TextEdit[] {
  try {
    const formatted = formatSource(model.getValue())
    return [{ range: model.getFullModelRange(), text: formatted }]
  } catch {
    return []
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the LS worker. Call once during playground boot.
 */
export function initLspWorker(): void {
  const w = getWorker()

  w.onerror = () => {
    worker = null
  }

  w.onmessage = (event: MessageEvent) => {
    const msg = event.data

    switch (msg.type) {
      case 'diagnosticsResult': {
        const { path, sourceVersion, diagnostics } = msg as {
          type: 'diagnosticsResult'
          requestId: number
          path: string
          sourceVersion: number
          diagnostics: Diagnostic[]
        }

        const model = registeredModels.get(path)
        if (!model) return

        // Discard stale results — the model has moved on since the request.
        const currentVersion = model.getVersionId()
        if (sourceVersion < currentVersion) return

        // Run typecheck on the main thread (avoids .dvala import issues in
        // the worker bundle) and append type diagnostics.
        const allDiagnostics = [...diagnostics]
        try {
          const source = model.getValue()
          const tc = typecheckForDiagnostics(source, path)
          typecheckCache.set(path, tc)
          typecheckVersions.set(path, sourceVersion)
          allDiagnostics.push(...buildTypeDiagnostics(tc))
        } catch {}

        const markers: monaco.editor.IMarkerData[] = allDiagnostics.map(d => ({
          message: d.message,
          severity:
            d.severity === 'error'
              ? monaco.MarkerSeverity.Error
              : d.severity === 'warning'
                ? monaco.MarkerSeverity.Warning
                : monaco.MarkerSeverity.Info,
          startLineNumber: d.range.start.line,
          startColumn: d.range.start.column,
          endLineNumber: d.range.end.line,
          endColumn: d.range.end.column,
          source: d.source,
        }))

        monaco.editor.setModelMarkers(model, 'dvala', markers)
        pendingRequests.delete(path)
        return
      }

      case 'diagnosticsError': {
        const { path } = msg as { type: 'diagnosticsError'; path: string }
        const model = registeredModels.get(path)
        if (model) monaco.editor.setModelMarkers(model, 'dvala', [])
        pendingRequests.delete(path)
        return
      }
    }
  }

  // Register Monaco hover provider for Dvala — uses the typecheck cache
  // populated during diagnostics (typecheck runs on main thread).
  monaco.languages.registerHoverProvider('dvala', {
    provideHover: (model, position) => {
      // Find the workspace path for this model.
      let path: string | undefined
      for (const [p, m] of registeredModels) {
        if (m === model) {
          path = p
          break
        }
      }
      if (!path) return null

      const tc = typecheckCache.get(path)
      const word = model.getWordAtPosition(position)
      const wordRange =
        word && word.word.length > 0
          ? {
              startLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: word.endColumn,
            }
          : undefined
      const wordText = wordRange ? model.getValueInRange(wordRange) : undefined
      const symbol = workspaceIndex.getSymbolAtPosition(path, position.lineNumber, position.column)
      const ref = wordText && !symbol ? (allReference[wordText] ?? referenceByTitle.get(wordText)) : undefined

      let inferredType: string | undefined
      if (tc && symbol?.def && symbol.def.location.file === path) {
        const typeAtDef = findTypeAtDefinition(tc.typeMap, tc.sourceMap, symbol.def)
        if (typeAtDef) inferredType = formatHoverType(typeAtDef)
      }

      try {
        if (!inferredType && tc) {
          const type = findTypeAtPosition(
            tc.typeMap,
            tc.sourceMap,
            { line: position.lineNumber, column: position.column },
            wordRange
              ? {
                  start: { line: position.lineNumber, column: wordRange.startColumn },
                  end: { line: position.lineNumber, column: wordRange.endColumn },
                }
              : undefined,
          )
          if (type) inferredType = formatHoverType(type)
        }

        if (!inferredType && tc && wordText) {
          const visibleDefs = workspaceIndex.getSymbolsInScope(path, position.lineNumber, position.column)
          const matchingDef = visibleDefs.find(def => def.name === wordText && def.location.file === path)
          if (matchingDef) {
            const typeAtDef = findTypeAtDefinition(tc.typeMap, tc.sourceMap, matchingDef)
            if (typeAtDef) inferredType = formatHoverType(typeAtDef)
          }
        }

        const sourceLocation = symbol?.def
          ? buildSourceLocationMarkdown(symbol.def.location.file, symbol.def.location.line, symbol.def.location.column)
          : undefined

        if (!inferredType && !ref && !sourceLocation) return null

        const contents: monaco.IMarkdownString[] = []
        if (inferredType) {
          contents.push({ value: `\`\`\`dvala\n${inferredType}\n\`\`\`` })
        }
        if (sourceLocation) {
          if (contents.length > 0) contents.push({ value: '---' })
          contents.push({ value: sourceLocation })
        }
        if (ref) {
          if (contents.length > 0) contents.push({ value: '---' })
          contents.push({ value: buildHoverMarkdown(wordText!, ref) })
        }

        return {
          contents,
          ...(wordRange ? { range: wordRange } : {}),
        }
      } catch {
        return null
      }
    },
  })

  monaco.languages.registerCompletionItemProvider('dvala', {
    triggerCharacters: ['"', '.', '/'],
    provideCompletionItems: (model, position) => {
      let path: string | undefined
      for (const [p, m] of registeredModels) {
        if (m === model) {
          path = p
          break
        }
      }

      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      }
      const word = model.getWordUntilPosition(position)
      const prefix = String(word.word).toLowerCase()
      const importPrefix = getImportCompletionPrefix(model.getLineContent(position.lineNumber), position.column)
      const isInsideImportString = importPrefix !== null
      const currentFileSymbols = path ? workspaceIndex.getFileSymbols(path) : null
      const completionItems = isInsideImportString
        ? getImportCompletionItems(importPrefix, path, getWorkspaceFiles())
        : dedupeCompletionItems([
            ...getScopedCompletionItems(
              prefix,
              path ? workspaceIndex.getSymbolsInScope(path, position.lineNumber, position.column) : [],
            ),
            ...getImportedExportCompletionItems(prefix, currentFileSymbols, filePath =>
              workspaceIndex.getFileSymbols(filePath),
            ),
          ])

      const suggestions: monaco.languages.CompletionItem[] = []
      for (const item of completionItems) {
        const completion: monaco.languages.CompletionItem = {
          label: item.label,
          kind: kindToMonaco(item.kind),
          detail: item.detail,
          sortText: item.sortText,
          insertText: item.insertText ?? item.label,
          range: { ...range, startColumn: word.startColumn },
        }
        if (item.insertText) {
          completion.insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        }
        suggestions.push(completion)
      }

      return { suggestions }
    },
  })

  monaco.languages.registerSignatureHelpProvider('dvala', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp: (model, position) => {
      let path: string | undefined
      for (const [p, m] of registeredModels) {
        if (m === model) {
          path = p
          break
        }
      }

      const callCtx = findCallContext(model.getValue(), { line: position.lineNumber, column: position.column })
      if (!path || !callCtx) return null

      const signatures: monaco.languages.SignatureInformation[] = []
      const definitions = workspaceIndex.getDefinitions(path)
      const ref = allReference[callCtx.functionName] ?? referenceByTitle.get(callCtx.functionName)
      if (ref && isFunctionReference(ref)) {
        for (const variant of ref.variants) {
          const paramLabels = variant.argumentNames.map(name => {
            const argInfo = ref.args[name]
            const typeStr = argInfo ? (Array.isArray(argInfo.type) ? argInfo.type.join(' | ') : argInfo.type) : ''
            return typeStr ? `${name}: ${typeStr}` : name
          })
          signatures.push({
            label: `${callCtx.functionName}(${paramLabels.join(', ')})`,
            parameters: paramLabels.map(label => ({ label })),
          })
        }
      } else {
        const funcDef = definitions.find(def => def.name === callCtx.functionName && def.params)
        if (funcDef?.params) {
          signatures.push({
            label: `${callCtx.functionName}(${funcDef.params.join(', ')})`,
            parameters: funcDef.params.map(label => ({ label })),
          })
        }
      }

      if (signatures.length === 0) return null

      return {
        value: {
          signatures,
          activeSignature: 0,
          activeParameter: callCtx.activeParam,
        },
        dispose: () => {},
      }
    },
  })

  // ── Go-to-definition provider ────────────────────────────────────────────

  monaco.languages.registerDefinitionProvider('dvala', {
    provideDefinition: (model, position) => {
      let path: string | undefined
      for (const [p, m] of registeredModels) {
        if (m === model) {
          path = p
          break
        }
      }
      if (!path) return null

      return getDefinitionsAtPosition(path, position)
    },
  })

  // ── Find-references provider ─────────────────────────────────────────────

  monaco.languages.registerReferenceProvider('dvala', {
    provideReferences: (model, position) => {
      let path: string | undefined
      for (const [p, m] of registeredModels) {
        if (m === model) {
          path = p
          break
        }
      }
      if (!path) return null

      return getReferencesAtPosition(path, position)
    },
  })

  // ── Rename provider ──────────────────────────────────────────────────────

  monaco.languages.registerRenameProvider('dvala', {
    provideRenameEdits: (model, position, newName) => {
      let path: string | undefined
      for (const [p, m] of registeredModels) {
        if (m === model) {
          path = p
          break
        }
      }
      if (!path) return null

      return getRenameEditsAtPosition(path, position, newName)
    },
  })

  // ── Document formatter ───────────────────────────────────────────────────

  monaco.languages.registerDocumentFormattingEditProvider('dvala', {
    provideDocumentFormattingEdits: formatModel,
  })

  monaco.languages.registerDocumentRangeFormattingEditProvider('dvala', {
    provideDocumentRangeFormattingEdits: model => formatModel(model),
  })
}

/**
 * Register a Monaco model with the given workspace path so diagnostics
 * results can be routed to it.
 */
export function registerModel(path: string, model: monaco.editor.ITextModel): void {
  registeredModels.set(path, model)
}

/**
 * Unregister a model (called when a tab closes and the model is disposed).
 */
export function unregisterModel(path: string): void {
  // Grab the model before deleting from the registry.
  const model = registeredModels.get(path)
  registeredModels.delete(path)
  typecheckCache.delete(path)
  typecheckVersions.delete(path)
  if (model) monaco.editor.setModelMarkers(model, 'dvala', [])
  // Cancel any pending diagnostics for this path.
  const pendingId = pendingRequests.get(path)
  if (pendingId !== undefined) {
    getWorker().postMessage({ type: 'cancelRequest', requestId: pendingId })
    pendingRequests.delete(path)
  }
  const timer = debounceTimers.get(path)
  if (timer) {
    clearTimeout(timer)
    debounceTimers.delete(path)
  }
}

/**
 * Push an edit delta to the worker. Called on every Monaco model change.
 * Debounces diagnostics by ~150ms.
 */
export function updateDocument(path: string, source: string, sourceVersion: number): void {
  const w = getWorker()

  indexWorkspaceFile(path, source)

  w.postMessage({
    type: 'updateDocument',
    path,
    source,
    sourceVersion,
  })

  const existing = debounceTimers.get(path)
  if (existing) clearTimeout(existing)

  debounceTimers.set(
    path,
    setTimeout(() => {
      debounceTimers.delete(path)
      requestDiagnostics(path, sourceVersion)
    }, 150),
  )
}

export function primeTypecheckForTesting(path: string, source: string, sourceVersion: number): void {
  const tc = typecheckForDiagnostics(source, path)
  typecheckCache.set(path, tc)
  typecheckVersions.set(path, sourceVersion)
}

export function getDefinitionsForTesting(path: string, position: monaco.Position): monaco.languages.Location[] | null {
  return getDefinitionsAtPosition(path, position)
}

export function getReferencesForTesting(path: string, position: monaco.Position): monaco.languages.Location[] | null {
  return getReferencesAtPosition(path, position)
}

export function getRenameEditsForTesting(
  path: string,
  position: monaco.Position,
  newName: string,
): monaco.languages.WorkspaceEdit | null {
  return getRenameEditsAtPosition(path, position, newName)
}

export function getFormattingEditsForTesting(model: monaco.editor.ITextModel): monaco.languages.TextEdit[] {
  return formatModel(model)
}

/**
 * Request diagnostics from the worker for the given path.
 * Cancels any in-flight request for the same path.
 */
function requestDiagnostics(path: string, sourceVersion: number): void {
  const w = getWorker()

  const prevId = pendingRequests.get(path)
  if (prevId !== undefined) {
    w.postMessage({ type: 'cancelRequest', requestId: prevId })
  }

  const requestId = nextRequestId++
  pendingRequests.set(path, requestId)

  w.postMessage({
    type: 'requestDiagnostics',
    requestId,
    path,
    sourceVersion,
  })
}
