import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { allReference, isFunctionReference, isCustomReference } from '../../reference/index'
import type { Reference } from '../../reference/index'
import { stringifyValue } from '../../common/utils'
import type { Handlers } from '@mojir/dvala-engine'
import {
  buildBuiltinCompletions,
  isDvalaIdentifierName,
  symbolDefToCompletion as toSharedCompletion,
} from '@mojir/dvala-core-tooling'
import type { CompletionItem as SharedCompletionItem } from '@mojir/dvala-core-tooling'
import type { Diagnostic as SharedDiagnostic } from '@mojir/dvala-core-tooling'
import type { BackendSymbolKind } from '../../packages/dvala-workspace-backend/src/index'

import { BackendDiagnosticsClient } from './backendDiagnosticsClient'
import { linkSelectionRangeChains, type LinkedSelectionRange } from './selectionRangeAdapter'

// Dvala identifier pattern: JS-style names, module-qualified (grid.foo)
const DVALA_WORD_PATTERN = /[a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*/

// Index allReference by title as well (needed for effects whose key !== title)
const referenceByTitle: Record<string, Reference> = {}
for (const ref of Object.values(allReference)) {
  referenceByTitle[ref.title] = ref
}

function buildHoverMarkdown(name: string, ref: Reference): vscode.MarkdownString {
  const md = new vscode.MarkdownString()

  md.appendMarkdown(`**${name}**\n\n`)
  md.appendMarkdown(`${ref.description}\n\n`)

  if (isFunctionReference(ref)) {
    for (const variant of ref.variants) {
      md.appendCodeblock(`${name}(${variant.argumentNames.join(', ')})`, 'dvala')
    }
    const argEntries = Object.entries(ref.args)
    if (argEntries.length > 0) {
      md.appendMarkdown('\n')
      for (const [argName, arg] of argEntries) {
        const typeStr = Array.isArray(arg.type) ? arg.type.join(' | ') : arg.type
        md.appendMarkdown(`- \`${argName}\`: *${typeStr}*`)
        if (arg.description) {
          md.appendMarkdown(` — ${arg.description}`)
        }
        md.appendMarkdown('\n')
      }
    }
  } else if (isCustomReference(ref)) {
    for (const variant of ref.customVariants) {
      md.appendCodeblock(variant, 'dvala')
    }
  }

  if (ref.examples.length > 0) {
    md.appendMarkdown('\n**Example:**\n')
    const ex0 = ref.examples[0]
    md.appendCodeblock(typeof ex0 === 'string' ? ex0 : ex0.code, 'dvala')
  }

  return md
}

/** Map portable kind names to VS Code's CompletionItemKind enum. */
function sharedKindToVsKind(kind: SharedCompletionItem['kind']): vscode.CompletionItemKind {
  switch (kind) {
    case 'function':
      return vscode.CompletionItemKind.Function
    case 'method':
      return vscode.CompletionItemKind.Method
    case 'variable':
      return vscode.CompletionItemKind.Variable
    case 'event':
      return vscode.CompletionItemKind.Event
    case 'module':
      return vscode.CompletionItemKind.Module
    case 'class':
      return vscode.CompletionItemKind.Class
    case 'keyword':
      return vscode.CompletionItemKind.Keyword
    case 'operator':
      return vscode.CompletionItemKind.Operator
  }
}

/** Convert a shared CompletionItem into VS Code's host-specific shape. */
function toVsCompletion(shared: SharedCompletionItem, documentation?: vscode.MarkdownString): vscode.CompletionItem {
  const item = new vscode.CompletionItem(shared.label, sharedKindToVsKind(shared.kind))
  if (shared.detail) item.detail = shared.detail
  if (shared.sortText) item.sortText = shared.sortText
  if (shared.insertText) item.insertText = new vscode.SnippetString(shared.insertText)
  if (documentation) item.documentation = documentation
  return item
}

/**
 * Build the precomputed list of builtin completion items, attaching
 * VS Code-specific markdown documentation (which the shared builder
 * intentionally leaves to the host).
 */
function buildVsBuiltinCompletions(): vscode.CompletionItem[] {
  const sharedItems = buildBuiltinCompletions()
  const refByTitle = new Map<string, Reference>()
  for (const ref of Object.values(allReference)) refByTitle.set(ref.title, ref)
  return sharedItems.map(item => {
    const ref = refByTitle.get(item.label)
    return toVsCompletion(item, ref ? buildHoverMarkdown(item.label, ref) : undefined)
  })
}

let outputChannel: vscode.OutputChannel | undefined
let statusBarItem: vscode.StatusBarItem | undefined
let diagnosticCollection: vscode.DiagnosticCollection | undefined
let debounceTimer: ReturnType<typeof setTimeout> | undefined

/** Convert a shared (1-based) diagnostic into VS Code's 0-based shape. */
function toVsDiagnostic(diag: SharedDiagnostic): vscode.Diagnostic {
  const range = new vscode.Range(
    Math.max(0, diag.range.start.line - 1),
    Math.max(0, diag.range.start.column - 1),
    Math.max(0, diag.range.end.line - 1),
    Math.max(0, diag.range.end.column - 1),
  )
  const severity =
    diag.severity === 'error'
      ? vscode.DiagnosticSeverity.Error
      : diag.severity === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information
  const vdiag = new vscode.Diagnostic(range, diag.message, severity)
  vdiag.source = diag.source
  return vdiag
}

function completionDocumentation(label: string): vscode.MarkdownString | undefined {
  const ref = allReference[label] ?? referenceByTitle[label]
  return ref ? buildHoverMarkdown(label, ref) : undefined
}

function extractImportPrefix(lineText: string, column0: number): string | null {
  const beforeCursor = lineText.slice(0, column0)
  const importMatch = /import\(\s*"([^"]*)$/.exec(beforeCursor)
  return importMatch ? (importMatch[1] ?? '') : null
}

function extractCompletionPrefix(document: vscode.TextDocument, position: vscode.Position): string {
  const range = document.getWordRangeAtPosition(position, DVALA_WORD_PATTERN)
  if (!range) return ''
  return document.getText(new vscode.Range(range.start, position))
}

function toVsLocation(file: string, line: number, column: number): vscode.Location {
  return new vscode.Location(vscode.Uri.file(file), new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1)))
}

function backendSymbolKindToVs(kind: BackendSymbolKind): vscode.SymbolKind {
  switch (kind) {
    case 'function':
      return vscode.SymbolKind.Function
    case 'macro':
      return vscode.SymbolKind.Method
    case 'handler':
      return vscode.SymbolKind.Event
    case 'import':
      return vscode.SymbolKind.Module
    case 'parameter':
      return vscode.SymbolKind.Variable
    case 'variable':
      return vscode.SymbolKind.Variable
  }
}

function getDiagnosticCollection(): vscode.DiagnosticCollection {
  if (!diagnosticCollection) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('dvala')
  }
  return diagnosticCollection
}

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Dvala')
  }
  return outputChannel
}

function getStatusBarItem(): vscode.StatusBarItem {
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  }
  return statusBarItem
}

async function runCode(
  code: string,
  label: string,
  backendDiagnostics: BackendDiagnosticsClient,
  uri?: vscode.Uri,
): Promise<void> {
  const channel = getOutputChannel()
  channel.clear()
  channel.show(true)
  channel.appendLine(`Running ${label}`)
  channel.appendLine('─'.repeat(50))

  const handlers: Handlers = [
    {
      pattern: 'dvala.io.print',
      handler: async ctx => {
        const str = stringifyValue(ctx.arg, false)
        channel.append(str)
        ctx.resume(ctx.arg)
      },
    },
    {
      pattern: 'dvala.io.error',
      handler: async ctx => {
        const str = stringifyValue(ctx.arg, false)
        channel.appendLine(`[stderr] ${str}`)
        ctx.resume(ctx.arg)
      },
    },
    {
      pattern: 'dvala.io.read',
      handler: async ctx => {
        const prompt = typeof ctx.arg === 'string' ? ctx.arg : undefined
        const result = await vscode.window.showInputBox({ prompt, ignoreFocusOut: true })
        ctx.resume(result ?? null)
      },
    },
    {
      pattern: 'dvala.io.pick',
      handler: async ctx => {
        const arg = ctx.arg as { message?: string; options: string[] }
        const options = Array.isArray(arg) ? arg : arg.options
        const message = Array.isArray(arg) ? undefined : arg.message
        const result = await vscode.window.showQuickPick(options, { placeHolder: message, ignoreFocusOut: true })
        ctx.resume(result ?? null)
      },
    },
    {
      pattern: 'dvala.io.confirm',
      handler: async ctx => {
        const message = typeof ctx.arg === 'string' ? ctx.arg : 'Confirm?'
        const result = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: message, ignoreFocusOut: true })
        ctx.resume(result === 'Yes')
      },
    },
    {
      pattern: '*',
      handler: async ctx => {
        // Pass through to standard handlers for standard effects
        if (
          ctx.effectName.startsWith('dvala.error') ||
          ctx.effectName === 'dvala.io.readStdin' ||
          ctx.effectName.startsWith('dvala.random') ||
          ctx.effectName.startsWith('dvala.time') ||
          ctx.effectName === 'dvala.sleep' ||
          ctx.effectName === 'dvala.checkpoint' ||
          ctx.effectName === 'dvala.macro.expand'
        ) {
          ctx.next()
          return
        }
        const argStr = stringifyValue(ctx.arg, false)
        const input = await vscode.window.showInputBox({
          title: `Unhandled effect: ${ctx.effectName}`,
          prompt: `Arg: ${argStr || '(none)'}. Enter JSON return value:`,
          placeHolder: 'null',
          ignoreFocusOut: true,
        })
        if (input === undefined) {
          ctx.fail(`Unhandled effect "${ctx.effectName}" cancelled by user`)
          return
        }
        try {
          ctx.resume(JSON.parse(input || 'null'))
        } catch {
          ctx.fail(`Invalid JSON for effect "${ctx.effectName}": ${input}`)
        }
      },
    },
  ]

  const status = getStatusBarItem()
  status.text = '$(sync~spin) Dvala: Running...'
  status.show()

  const collection = getDiagnosticCollection()
  try {
    const started = await backendDiagnostics.startSession({
      source: code,
      effectHandlers: handlers,
      debug: true,
    })
    if (!started.ok) throw new Error(started.error.message)
    const runResult = started.runResult
    if (runResult.type === 'error') throw runResult.error
    const value = runResult.type === 'completed' ? runResult.value : runResult.snapshot
    channel.appendLine(`=> ${stringifyValue(value, false)}`)
    if (uri) collection.set(uri, [])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    channel.appendLine(`Error: ${message}`)
    if (uri) {
      const locationMatch = message.match(/Location (\d+):(\d+)/)
      if (locationMatch) {
        const line = Math.max(0, parseInt(locationMatch[1]) - 1)
        const col = Math.max(0, parseInt(locationMatch[2]) - 1)
        const codeLine = code.split('\n')[line] ?? ''
        const range = new vscode.Range(line, col, line, Math.max(codeLine.length, col + 1))
        const errorText = message.split('\n')[0].replace(/^Error:\s*/, '')
        const diagnostic = new vscode.Diagnostic(range, errorText, vscode.DiagnosticSeverity.Error)
        diagnostic.source = 'dvala'
        collection.set(uri, [diagnostic])
      } else {
        collection.set(uri, [])
      }
    }
  } finally {
    status.hide()
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const runFile = vscode.commands.registerCommand('dvala.runFile', () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showErrorMessage('No active editor')
      return
    }

    editor.document.save().then(() => {
      const code = editor.document.getText()
      const label = path.basename(editor.document.uri.fsPath)
      void runCode(code, label, backendDiagnostics, editor.document.uri)
    })
  })

  const runBlock = vscode.commands.registerCommand('dvala.runBlock', () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showErrorMessage('No active editor')
      return
    }

    const doc = editor.document
    const cursorLine = editor.selection.active.line
    const lineCount = doc.lineCount

    // Find the opening fence line at or above the cursor
    let fenceStart = -1
    let fenceMarker = ''
    for (let i = cursorLine; i >= 0; i--) {
      const text = doc.lineAt(i).text
      const match = text.match(/^(\s*)(```+|~~~+)\s*dvala(\s.*)?$/)
      if (match) {
        fenceStart = i
        fenceMarker = match[2]
        break
      }
    }

    if (fenceStart === -1) {
      vscode.window.showWarningMessage('No dvala code block found at cursor')
      return
    }

    // Find the closing fence line below
    let fenceEnd = -1
    for (let i = fenceStart + 1; i < lineCount; i++) {
      const text = doc.lineAt(i).text.trim()
      if (text === fenceMarker || text.startsWith(fenceMarker)) {
        fenceEnd = i
        break
      }
    }

    if (fenceEnd === -1) {
      vscode.window.showWarningMessage('Dvala code block is not closed')
      return
    }

    const lines: string[] = []
    for (let i = fenceStart + 1; i < fenceEnd; i++) {
      lines.push(doc.lineAt(i).text)
    }
    const code = lines.join('\n')

    if (!code.trim()) {
      vscode.window.showWarningMessage('Dvala code block is empty')
      return
    }

    void runCode(code, `block at line ${fenceStart + 1}`, backendDiagnostics)
  })

  const runSelection = vscode.commands.registerCommand('dvala.runSelection', () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showErrorMessage('No active editor')
      return
    }

    const selection = editor.selection
    const code = editor.document.getText(selection.isEmpty ? undefined : selection)

    if (!code.trim()) {
      vscode.window.showWarningMessage('No text to run')
      return
    }

    const label = selection.isEmpty
      ? path.basename(editor.document.uri.fsPath)
      : `selection (${selection.start.line + 1}:${selection.start.character + 1}–${selection.end.line + 1}:${selection.end.character + 1})`

    void runCode(code, label, backendDiagnostics)
  })

  const completionProvider = vscode.languages.registerCompletionItemProvider('dvala', {
    async provideCompletionItems(document, position) {
      indexDocument(document)
      await ensureBackendWorkspaceSnapshot()
      await backendDiagnostics.syncDocument({
        path: document.uri.fsPath,
        source: document.getText(),
        version: document.version,
      })

      const lineText = document.lineAt(position.line).text
      const importPrefix = extractImportPrefix(lineText, position.character)
      const prefix = importPrefix === null ? extractCompletionPrefix(document, position) : ''
      const result = await backendDiagnostics.requestCompletion({
        path: document.uri.fsPath,
        source: document.getText(),
        version: document.version,
        line: position.line + 1,
        column: position.character + 1,
        prefix,
        importPrefix,
      })

      if (!result.ok) return []

      return result.items.map(item => toVsCompletion(item, completionDocumentation(item.label)))
    },
  })

  // Signature Help — parameter hints when typing inside function calls
  const signatureHelpProvider = vscode.languages.registerSignatureHelpProvider(
    'dvala',
    {
      async provideSignatureHelp(document, position) {
        indexDocument(document)
        await syncBackendAnalysisDocument(document)

        const result = await backendDiagnostics.requestSignatureHelp({
          path: document.uri.fsPath,
          source: document.getText(),
          version: document.version,
          line: position.line + 1,
          column: position.character + 1,
        })
        if (!result.ok || result.signatures.length === 0) return undefined

        const help = new vscode.SignatureHelp()
        help.activeParameter = result.activeParameter
        help.signatures = result.signatures.map(signature => {
          const sig = new vscode.SignatureInformation(signature.label)
          sig.parameters = signature.parameters.map(label => new vscode.ParameterInformation(label))
          return sig
        })
        return help
      },
    },
    '(',
    ',',
  )

  const hoverProvider = vscode.languages.registerHoverProvider('dvala', {
    async provideHover(document, position) {
      indexDocument(document)
      await syncBackendAnalysisDocument(document)

      const diagnostics = getDiagnosticCollection()
        .get(document.uri)
        ?.filter(d => d.range.contains(position))

      const range = document.getWordRangeAtPosition(position, DVALA_WORD_PATTERN)
      const word = range ? document.getText(range) : undefined
      const symbolResult = await backendDiagnostics.requestSymbolAtPosition({
        path: document.uri.fsPath,
        source: document.getText(),
        version: document.version,
        line: position.line + 1,
        column: position.character + 1,
      })
      const symbol = symbolResult.ok ? symbolResult.symbol : undefined
      const ref = word && !symbol ? (allReference[word] ?? referenceByTitle[word]) : undefined

      const hoverResult = await backendDiagnostics.requestHover({
        path: document.uri.fsPath,
        source: document.getText(),
        version: document.version,
        line: position.line + 1,
        column: position.character + 1,
        ...(range
          ? {
              startColumn: range.start.character + 1,
              endColumn: range.end.character + 1,
            }
          : {}),
      })
      const inferredTypeStr = hoverResult.ok ? hoverResult.inferredType : undefined

      if (!diagnostics?.length && !ref && !inferredTypeStr) return undefined

      const md = new vscode.MarkdownString()

      if (diagnostics?.length) {
        md.appendMarkdown(`$(error) **Dvala Error**\n\n`)
        if (ref || inferredTypeStr) md.appendMarkdown('---\n\n')
      }

      if (inferredTypeStr) {
        md.appendCodeblock(inferredTypeStr, 'dvala')
        if (ref) md.appendMarkdown('\n---\n\n')
      }

      if (ref) md.appendMarkdown(buildHoverMarkdown(word!, ref).value)

      md.supportThemeIcons = true
      return new vscode.Hover(md, range)
    },
  })

  // Go to Definition — handles both import paths and user-defined symbols
  const definitionProvider = vscode.languages.registerDefinitionProvider('dvala', {
    async provideDefinition(document, position) {
      indexDocument(document)
      await syncBackendAnalysisDocument(document)

      const result = await backendDiagnostics.requestNavigation({
        path: document.uri.fsPath,
        source: document.getText(),
        version: document.version,
        kind: 'definition',
        line: position.line + 1,
        column: position.character + 1,
      })

      if (!result.ok || !result.locations?.length) return undefined
      return result.locations.map(loc => toVsLocation(loc.file, loc.line, loc.column))
    },
  })

  // "Go to Definition" in the debug Variables pane — sends a custom DAP request
  // to resolve the source location, then opens the file at that position
  const goToSource = vscode.commands.registerCommand(
    'dvala.debug.goToSource',
    async (variable: { variable: { variablesReference: number; name: string } }) => {
      const session = vscode.debug.activeDebugSession
      if (!session || session.type !== 'dvala') return

      const varRef = variable?.variable?.variablesReference
      const varName = variable?.variable?.name
      if (!varRef && !varName) return

      try {
        const loc = await session.customRequest('dvalaGetSourceLocation', { variablesReference: varRef, name: varName })
        if (loc?.file) {
          const uri = vscode.Uri.file(loc.file)
          const line = Math.max(0, (loc.line ?? 1) - 1)
          const col = Math.max(0, (loc.column ?? 1) - 1)
          const pos = new vscode.Position(line, col)
          const doc = await vscode.workspace.openTextDocument(uri)
          await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos) })
        }
      } catch {
        // No source location for this variable — silently ignore
      }
    },
  )

  // ---------------------------------------------------------------------------
  // Language Service: workspace index, document symbols, diagnostics
  // ---------------------------------------------------------------------------

  const backendDiagnostics = new BackendDiagnosticsClient()
  const lsDiagnostics = vscode.languages.createDiagnosticCollection('dvala-ls')
  const typeDiagnostics = vscode.languages.createDiagnosticCollection('dvala-types')
  let backendWorkspaceSnapshotStale = true

  async function refreshBackendWorkspaceSnapshot(): Promise<void> {
    const uris = await vscode.workspace.findFiles('**/*.dvala', '**/node_modules/**')
    const files = uris.map(uri => {
      const openDocument = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === uri.fsPath)
      const code = openDocument ? openDocument.getText() : fs.readFileSync(uri.fsPath, 'utf-8')
      return {
        path: uri.fsPath,
        code,
      }
    })

    await backendDiagnostics.syncWorkspaceSnapshot(files)
    backendWorkspaceSnapshotStale = false
  }

  async function ensureBackendWorkspaceSnapshot(): Promise<void> {
    if (!backendWorkspaceSnapshotStale) return
    await refreshBackendWorkspaceSnapshot()
  }

  async function syncBackendAnalysisDocument(document: vscode.TextDocument): Promise<void> {
    await ensureBackendWorkspaceSnapshot()
    await backendDiagnostics.syncDocument({
      path: document.uri.fsPath,
      source: document.getText(),
      version: document.version,
    })
  }

  /** Clear stale run diagnostics for a document and refresh backend diagnostics. */
  function indexDocument(document: vscode.TextDocument): void {
    if (document.languageId !== 'dvala') return
    // Clear stale run diagnostics whenever the document changes or is re-opened.
    // Runtime diagnostics are snapshot-specific and quickly become misleading
    // once the source has changed.
    getDiagnosticCollection().delete(document.uri)
    void refreshBackendDiagnostics(document)
  }

  /** Push backend-owned language and type diagnostics to VS Code. */
  async function refreshBackendDiagnostics(document: vscode.TextDocument): Promise<void> {
    await ensureBackendWorkspaceSnapshot()

    const mirroredDocument = {
      path: document.uri.fsPath,
      source: document.getText(),
      version: document.version,
    }

    await backendDiagnostics.syncDocument(mirroredDocument)
    const result = await backendDiagnostics.requestDiagnostics(mirroredDocument.path, mirroredDocument.version)

    const currentDocument = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === document.uri.toString())
    if (!currentDocument || currentDocument.version !== mirroredDocument.version) return

    if (!result.ok) {
      lsDiagnostics.set(document.uri, [])
      typeDiagnostics.set(document.uri, [])
      return
    }

    const diagnostics = result.diagnostics.map(toVsDiagnostic)
    lsDiagnostics.set(
      document.uri,
      diagnostics.filter(diag => diag.source === 'dvala'),
    )
    typeDiagnostics.set(
      document.uri,
      diagnostics.filter(diag => diag.source === 'dvala-types'),
    )
  }

  // Index all open dvala documents on activation
  for (const doc of vscode.workspace.textDocuments) {
    indexDocument(doc)
  }
  void ensureBackendWorkspaceSnapshot()

  // Re-index on document change (debounced)
  const onDidChange = vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.languageId !== 'dvala') return
    backendWorkspaceSnapshotStale = true
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => indexDocument(event.document), 300)
  })

  // Index newly opened documents
  const onDidOpen = vscode.workspace.onDidOpenTextDocument(doc => {
    backendWorkspaceSnapshotStale = true
    indexDocument(doc)
  })

  // Clear diagnostics when a document is closed
  const onDidClose = vscode.workspace.onDidCloseTextDocument(doc => {
    lsDiagnostics.delete(doc.uri)
    typeDiagnostics.delete(doc.uri)
    backendWorkspaceSnapshotStale = true
    void backendDiagnostics.closeDocument(doc.uri.fsPath)
  })

  // Mark the backend snapshot stale on any .dvala file system change. The
  // next analysis request triggers refreshBackendWorkspaceSnapshot(), which
  // re-reads all matching files and syncs them to the backend's persisted-
  // file store. Open documents carry their authoritative content through
  // onDidChangeTextDocument; this watcher catches changes to files that
  // aren't currently open in an editor.
  const dvalaWatcher = vscode.workspace.createFileSystemWatcher('**/*.dvala')
  const onFsCreate = dvalaWatcher.onDidCreate(() => {
    backendWorkspaceSnapshotStale = true
  })
  const onFsChange = dvalaWatcher.onDidChange(() => {
    backendWorkspaceSnapshotStale = true
  })
  const onFsDelete = dvalaWatcher.onDidDelete(() => {
    backendWorkspaceSnapshotStale = true
  })

  // Reference provider — Find All References (Shift+F12)
  const referenceProvider = vscode.languages.registerReferenceProvider('dvala', {
    async provideReferences(document, position) {
      indexDocument(document)
      await syncBackendAnalysisDocument(document)

      const result = await backendDiagnostics.requestNavigation({
        path: document.uri.fsPath,
        source: document.getText(),
        version: document.version,
        kind: 'references',
        line: position.line + 1,
        column: position.character + 1,
      })

      if (!result.ok || !result.locations) return []
      return result.locations.map(loc => toVsLocation(loc.file, loc.line, loc.column))
    },
  })

  // Rename provider — F2 to rename a symbol across the workspace
  const renameProvider = vscode.languages.registerRenameProvider('dvala', {
    async prepareRename(document, position) {
      indexDocument(document)
      const symbolResult = await backendDiagnostics.requestSymbolAtPosition({
        path: document.uri.fsPath,
        source: document.getText(),
        version: document.version,
        line: position.line + 1,
        column: position.character + 1,
      })
      const symbol = symbolResult.ok ? symbolResult.symbol : undefined
      if (!symbol) throw new Error('Cannot rename this element')

      // Find the word range at the cursor position
      const range = document.getWordRangeAtPosition(position, DVALA_WORD_PATTERN)
      if (!range) throw new Error('Cannot rename this element')

      return { range, placeholder: symbol.name }
    },

    async provideRenameEdits(document, position, newName) {
      // Validate that newName is a valid Dvala identifier
      if (!isDvalaIdentifierName(newName)) {
        throw new Error(`'${newName}' is not a valid identifier`)
      }

      indexDocument(document)
      await syncBackendAnalysisDocument(document)

      const result = await backendDiagnostics.requestNavigation({
        path: document.uri.fsPath,
        source: document.getText(),
        version: document.version,
        kind: 'rename',
        line: position.line + 1,
        column: position.character + 1,
        newName,
      })

      if (!result.ok || !result.edits) return undefined
      const edit = new vscode.WorkspaceEdit()

      for (const backendEdit of result.edits) {
        const uri = vscode.Uri.file(backendEdit.file)
        const start = new vscode.Position(
          Math.max(0, backendEdit.range.startLine - 1),
          Math.max(0, backendEdit.range.startColumn - 1),
        )
        const end = new vscode.Position(
          Math.max(0, backendEdit.range.endLine - 1),
          Math.max(0, backendEdit.range.endColumn - 1),
        )
        edit.replace(uri, new vscode.Range(start, end), backendEdit.text)
      }

      return edit
    },
  })

  // Document Symbol provider — powers the outline view (Cmd+Shift+O) and breadcrumbs
  const documentSymbolProvider = vscode.languages.registerDocumentSymbolProvider('dvala', {
    async provideDocumentSymbols(document) {
      indexDocument(document)
      await syncBackendAnalysisDocument(document)

      const result = await backendDiagnostics.requestDocumentSymbols({
        path: document.uri.fsPath,
        source: document.getText(),
        version: document.version,
      })
      if (!result.ok) return []

      return result.symbols.map(def => {
        const line = Math.max(0, def.line - 1)
        const col = Math.max(0, def.column - 1)
        const pos = new vscode.Position(line, col)
        const range = new vscode.Range(pos, pos)
        return new vscode.DocumentSymbol(def.name, def.kind, backendSymbolKindToVs(def.kind), range, range)
      })
    },
  })

  // Workspace Symbol provider — Cmd+T to search all symbols across files
  const workspaceSymbolProvider = vscode.languages.registerWorkspaceSymbolProvider({
    async provideWorkspaceSymbols(query) {
      await ensureBackendWorkspaceSnapshot()
      const result = await backendDiagnostics.requestWorkspaceSymbols({ query })
      if (!result.ok) return []

      return result.symbols.map(symbol => {
        const pos = new vscode.Position(Math.max(0, symbol.line - 1), Math.max(0, symbol.column - 1))
        return new vscode.SymbolInformation(
          symbol.name,
          backendSymbolKindToVs(symbol.kind),
          '',
          new vscode.Location(vscode.Uri.file(symbol.file), pos),
        )
      })
    },
  })

  // Semantic Tokens — fine-grained syntax coloring driven by the symbol table.
  // The TextMate grammar can't distinguish a `function` from a `parameter`
  // from a destructured import; the backend's symbol table + type info can.
  // VS Code wants LSP-style delta-encoded integer tuples: every token is
  // (Δline, Δcol-from-previous-token-on-same-line, length, typeIdx, modBits).
  // The portable backend result lists tokens as plain objects sorted by
  // (line, startColumn); we delta-encode here at the boundary.
  const semanticTokenTypes = ['variable', 'function', 'macro', 'parameter', 'namespace'] as const
  const semanticTokenModifiers = ['declaration'] as const
  const semanticTokensLegend = new vscode.SemanticTokensLegend([...semanticTokenTypes], [...semanticTokenModifiers])
  const semanticTokensProvider = vscode.languages.registerDocumentSemanticTokensProvider(
    'dvala',
    {
      async provideDocumentSemanticTokens(document) {
        indexDocument(document)
        await syncBackendAnalysisDocument(document)

        const result = await backendDiagnostics.requestSemanticTokens({
          path: document.uri.fsPath,
          source: document.getText(),
          version: document.version,
        })
        if (!result.ok) return new vscode.SemanticTokens(new Uint32Array(0))

        const builder = new vscode.SemanticTokensBuilder(semanticTokensLegend)
        for (const token of result.tokens) {
          const typeIdx = semanticTokenTypes.indexOf(token.tokenType)
          if (typeIdx < 0) continue
          // Backend emits 1-based line/column; VS Code expects 0-based.
          const line = Math.max(0, token.line - 1)
          const startCol = Math.max(0, token.startColumn - 1)
          let modBits = 0
          for (const modifier of token.modifiers) {
            const modIdx = semanticTokenModifiers.indexOf(modifier as (typeof semanticTokenModifiers)[number])
            if (modIdx >= 0) modBits |= 1 << modIdx
          }
          builder.push(line, startCol, token.length, typeIdx, modBits)
        }
        return builder.build()
      },
    },
    semanticTokensLegend,
  )

  // Inlay Hints — parameter-name labels at call sites, e.g.
  // `add(/*a:*/ 1, /*b:*/ 2)`. Backend filters out self-documenting args
  // (where the arg's identifier already matches the param name) and skips
  // operator builtins so `a + b` doesn't grow inline punctuation.
  const inlayHintsProvider = vscode.languages.registerInlayHintsProvider('dvala', {
    async provideInlayHints(document) {
      indexDocument(document)
      await syncBackendAnalysisDocument(document)

      const result = await backendDiagnostics.requestInlayHints({
        path: document.uri.fsPath,
        source: document.getText(),
        version: document.version,
      })
      if (!result.ok) return []

      return result.hints.map(hint => {
        const position = new vscode.Position(Math.max(0, hint.line - 1), Math.max(0, hint.column - 1))
        const inlay = new vscode.InlayHint(position, hint.label, vscode.InlayHintKind.Parameter)
        inlay.paddingRight = true
        return inlay
      })
    },
  })

  // Convert a linked-range tree (plain data, from the testable adapter
  // helper) into VS Code's `SelectionRange`. Walks the parent chain so the
  // outer-most node's wrapper is built first, then inner nodes wrap with
  // that as their parent — matching VS Code's "parent points outward"
  // convention.
  const toVsSelectionRange = (linked: LinkedSelectionRange): vscode.SelectionRange => {
    const range = new vscode.Range(
      Math.max(0, linked.startLine - 1),
      Math.max(0, linked.startColumn - 1),
      Math.max(0, linked.endLine - 1),
      Math.max(0, linked.endColumn - 1),
    )
    return new vscode.SelectionRange(range, linked.parent ? toVsSelectionRange(linked.parent) : undefined)
  }

  // Selection Range — Alt+Shift+→ expands selection to the enclosing AST
  // node; Alt+Shift+← shrinks. Backend returns the containment chain
  // (innermost → outermost) as a flat list; we link them into VS Code's
  // nested SelectionRange shape here.
  const selectionRangeProvider = vscode.languages.registerSelectionRangeProvider('dvala', {
    async provideSelectionRanges(document, positions) {
      indexDocument(document)
      await syncBackendAnalysisDocument(document)

      const result = await backendDiagnostics.requestSelectionRange({
        path: document.uri.fsPath,
        source: document.getText(),
        version: document.version,
        positions: positions.map(p => ({ line: p.line + 1, column: p.character + 1 })),
      })
      if (!result.ok) return []

      const cursors = positions.map(p => ({ line: p.line + 1, column: p.character + 1 }))
      const linked = linkSelectionRangeChains(result.ranges, cursors)
      return linked.map(toVsSelectionRange)
    },
  })

  // Map portable code-action kinds to VS Code's kind enum. `quickfix`
  // attaches to diagnostics; `refactor.extract` / `refactor.inline` show
  // up under the "Refactor…" submenu.
  const codeActionKindToVs = (kind: 'quickfix' | 'refactor.extract' | 'refactor.inline'): vscode.CodeActionKind => {
    switch (kind) {
      case 'quickfix':
        return vscode.CodeActionKind.QuickFix
      case 'refactor.extract':
        return vscode.CodeActionKind.RefactorExtract
      case 'refactor.inline':
        return vscode.CodeActionKind.RefactorInline
    }
  }

  // Code Actions — quick fixes and refactorings via Cmd+. / Ctrl+. The
  // VS Code API gives us a range + the diagnostics intersecting it; we
  // forward both to the backend. Today's only action is the catchall
  // quick-fix for non-exhaustive match diagnostics; extract / inline /
  // extract-function will join when the refactor.* track lands.
  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    'dvala',
    {
      async provideCodeActions(document, range, context) {
        if (context.diagnostics.length === 0) return []
        indexDocument(document)
        await syncBackendAnalysisDocument(document)

        const result = await backendDiagnostics.requestCodeActions({
          path: document.uri.fsPath,
          source: document.getText(),
          version: document.version,
          startLine: range.start.line + 1,
          startColumn: range.start.character + 1,
          endLine: range.end.line + 1,
          endColumn: range.end.character + 1,
          diagnostics: context.diagnostics.map(d => ({
            message: d.message,
            startLine: d.range.start.line + 1,
            startColumn: d.range.start.character + 1,
          })),
        })
        if (!result.ok) return []

        return result.actions.map(action => {
          const vsAction = new vscode.CodeAction(action.title, codeActionKindToVs(action.kind))
          const workspaceEdit = new vscode.WorkspaceEdit()
          for (const edit of action.edits) {
            const editRange = new vscode.Range(
              Math.max(0, edit.startLine - 1),
              Math.max(0, edit.startColumn - 1),
              Math.max(0, edit.endLine - 1),
              Math.max(0, edit.endColumn - 1),
            )
            if (edit.startLine === edit.endLine && edit.startColumn === edit.endColumn) {
              workspaceEdit.insert(document.uri, editRange.start, edit.newText)
            } else {
              workspaceEdit.replace(document.uri, editRange, edit.newText)
            }
          }
          vsAction.edit = workspaceEdit
          if (action.fixesDiagnostics) {
            // Attach to the originating diagnostics so Cmd+. on the squiggle
            // picks up this action.
            vsAction.diagnostics = context.diagnostics.filter(d =>
              action.fixesDiagnostics?.some(
                ref =>
                  ref.message === d.message &&
                  ref.startLine === d.range.start.line + 1 &&
                  ref.startColumn === d.range.start.character + 1,
              ),
            )
          }
          return vsAction
        })
      },
    },
    {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    },
  )

  // Document formatting provider — powers Format Document (Shift+Alt+F / Shift+Option+F)
  const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider('dvala', {
    async provideDocumentFormattingEdits(document) {
      const source = document.getText()
      const result = await backendDiagnostics.requestFormatting({
        path: document.uri.fsPath,
        source,
        version: document.version,
      })
      if (!result.ok) return []
      if (result.formatted === source) return []
      const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(source.length))
      return [vscode.TextEdit.replace(fullRange, result.formatted)]
    },
  })

  context.subscriptions.push(
    runFile,
    runBlock,
    runSelection,
    completionProvider,
    signatureHelpProvider,
    hoverProvider,
    definitionProvider,
    goToSource,
    referenceProvider,
    renameProvider,
    documentSymbolProvider,
    codeActionProvider,
    selectionRangeProvider,
    semanticTokensProvider,
    workspaceSymbolProvider,
    lsDiagnostics,
    typeDiagnostics,
    onDidChange,
    onDidOpen,
    onDidClose,
    dvalaWatcher,
    onFsCreate,
    onFsChange,
    onFsDelete,
    formattingProvider,
  )
}

export function deactivate(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  outputChannel?.dispose()
  statusBarItem?.dispose()
  diagnosticCollection?.dispose()
}
