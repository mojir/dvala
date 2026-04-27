import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { allReference, isFunctionReference, isCustomReference } from '../../reference/index'
import type { Reference } from '../../reference/index'
import { createDvala } from '../../src/createDvala'
import { allBuiltinModules } from '../../src/allModules'
import { stringifyValue } from '../../common/utils'
import type { Handlers } from '../../src/evaluator/effectTypes'
import { WorkspaceIndex } from '../../src/languageService'
import type { SymbolDef } from '../../src/languageService'
import { loadFile as loadIndexedFile, nodeResolveImport } from '../../src/languageService/nodeWorkspaceIndexer'
import { findCallContext as sharedFindCallContext } from '../../src/shared/callContext'
import {
  buildBuiltinCompletions,
  symbolDefToCompletion as toSharedCompletion,
} from '../../src/shared/completionBuilder'
import type { CompletionItem as SharedCompletionItem } from '../../src/shared/completionBuilder'
import { buildParseDiagnostics, buildSymbolDiagnostics, buildTypeDiagnostics } from '../../src/shared/diagnosticBuilder'
import { findTypeAtDefinition, findTypeAtPosition, formatHoverType } from '../../src/shared/typeDisplay'
import type { Diagnostic as SharedDiagnostic, Range as SharedRange } from '../../src/shared/types'
import { formatSource } from '../../src/tooling'
import type { TypecheckResult } from '../../src/typechecker/typecheck'
import type { SourceMapPosition } from '../../src/parser/types'

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

const completionItems = buildVsBuiltinCompletions()

/** Map a user-defined SymbolDef to a VS Code completion item via the shared builder. */
function symbolDefToCompletionItem(def: SymbolDef): vscode.CompletionItem {
  return toVsCompletion(toSharedCompletion(def))
}

/**
 * Find the function call context at a cursor position. Trims the source
 * to a few lines above the cursor for performance, then delegates to the
 * shared parser.
 */
function findCallContext(
  document: vscode.TextDocument,
  position: vscode.Position,
): { functionName: string; activeParam: number } | null {
  const startLine = Math.max(0, position.line - 10)
  const text = document.getText(new vscode.Range(new vscode.Position(startLine, 0), position))
  // After trimming, the windowed text starts at line 1 col 1 — so map the
  // cursor's relative position into the windowed coordinate space.
  const relativeLine = position.line - startLine + 1
  const relativeCol = position.character + 1
  return sharedFindCallContext(text, { line: relativeLine, column: relativeCol })
}

let outputChannel: vscode.OutputChannel | undefined
let statusBarItem: vscode.StatusBarItem | undefined
let diagnosticCollection: vscode.DiagnosticCollection | undefined
let debounceTimer: ReturnType<typeof setTimeout> | undefined

// Type system: cached typecheck result per document URI
const typecheckCache = new Map<string, TypecheckResult & { sourceMap?: Map<number, SourceMapPosition> }>()

/** VS Code positions are 0-based; the shared modules use 1-based positions. */
function vscodeRangeToShared(range: vscode.Range): SharedRange {
  return {
    start: { line: range.start.line + 1, column: range.start.character + 1 },
    end: { line: range.end.line + 1, column: range.end.character + 1 },
  }
}

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

function getHoverTypeAtPosition(
  cached: TypecheckResult & { sourceMap?: Map<number, SourceMapPosition> },
  position: vscode.Position,
  preferredRange?: vscode.Range,
): string | undefined {
  const type = findTypeAtPosition(
    cached.typeMap,
    cached.sourceMap,
    { line: position.line + 1, column: position.character + 1 },
    preferredRange ? vscodeRangeToShared(preferredRange) : undefined,
  )
  return type ? formatHoverType(type) : undefined
}

function getHoverTypeAtDefinition(
  cached: TypecheckResult & { sourceMap?: Map<number, SourceMapPosition> },
  def: SymbolDef,
): string | undefined {
  const type = findTypeAtDefinition(cached.typeMap, cached.sourceMap, def)
  return type ? formatHoverType(type) : undefined
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

async function runCode(code: string, label: string, uri?: vscode.Uri): Promise<void> {
  const channel = getOutputChannel()
  channel.clear()
  channel.show(true)
  channel.appendLine(`Running ${label}`)
  channel.appendLine('─'.repeat(50))

  const dvala = createDvala({ modules: allBuiltinModules, debug: true })

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
    const runResult = await dvala.runAsync(code, { effectHandlers: handlers })
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
      void runCode(code, label, editor.document.uri)
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

    void runCode(code, `block at line ${fenceStart + 1}`)
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

    void runCode(code, label)
  })

  const completionProvider = vscode.languages.registerCompletionItemProvider('dvala', {
    provideCompletionItems(document, position) {
      indexDocument(document)
      const items: vscode.CompletionItem[] = [...completionItems]
      const seen = new Set(completionItems.map(i => (typeof i.label === 'string' ? i.label : i.label.label)))

      // Add user-defined symbols visible at the cursor position (scope-aware)
      const line1 = position.line + 1
      const col1 = position.character + 1
      const inScopeDefs = workspaceIndex.getSymbolsInScope(document.uri.fsPath, line1, col1)
      for (const def of inScopeDefs) {
        if (seen.has(def.name)) continue
        seen.add(def.name)
        items.push(symbolDefToCompletionItem(def))
      }

      // Add exported symbols from imported files (index them lazily if not yet cached)
      const fileSymbols = workspaceIndex.getFileSymbols(document.uri.fsPath)
      if (fileSymbols) {
        for (const importedPath of fileSymbols.imports.values()) {
          loadIndexedFile(workspaceIndex, importedPath)
          const importedSymbols = workspaceIndex.getFileSymbols(importedPath)
          if (importedSymbols) {
            for (const exp of importedSymbols.exports) {
              if (seen.has(exp.name)) continue
              seen.add(exp.name)
              items.push(symbolDefToCompletionItem(exp))
            }
          }
        }
      }

      return items
    },
  })

  // Signature Help — parameter hints when typing inside function calls
  const signatureHelpProvider = vscode.languages.registerSignatureHelpProvider(
    'dvala',
    {
      provideSignatureHelp(document, position) {
        const callCtx = findCallContext(document, position)
        if (!callCtx) return undefined

        const { functionName, activeParam } = callCtx
        const help = new vscode.SignatureHelp()
        help.activeParameter = activeParam

        // Check builtins first
        const ref = allReference[functionName] ?? referenceByTitle[functionName]
        if (ref && isFunctionReference(ref)) {
          for (const variant of ref.variants) {
            const paramLabels = variant.argumentNames.map(name => {
              const argInfo = ref.args[name]
              const typeStr = argInfo ? (Array.isArray(argInfo.type) ? argInfo.type.join(' | ') : argInfo.type) : ''
              return typeStr ? `${name}: ${typeStr}` : name
            })
            const sig = new vscode.SignatureInformation(`${functionName}(${paramLabels.join(', ')})`)
            sig.parameters = paramLabels.map(label => new vscode.ParameterInformation(label))
            help.signatures.push(sig)
          }
          return help
        }

        // Check user-defined functions/macros
        indexDocument(document)
        const defs = workspaceIndex.getDefinitions(document.uri.fsPath)
        const funcDef = defs.find(d => d.name === functionName && d.params)
        if (funcDef?.params) {
          const sig = new vscode.SignatureInformation(`${functionName}(${funcDef.params.join(', ')})`)
          sig.parameters = funcDef.params.map(name => new vscode.ParameterInformation(name))
          help.signatures.push(sig)
          return help
        }

        return undefined
      },
    },
    '(',
    ',',
  )

  const hoverProvider = vscode.languages.registerHoverProvider('dvala', {
    provideHover(document, position) {
      indexDocument(document)

      const diagnostics = getDiagnosticCollection()
        .get(document.uri)
        ?.filter(d => d.range.contains(position))

      const range = document.getWordRangeAtPosition(position, DVALA_WORD_PATTERN)
      const word = range ? document.getText(range) : undefined
      const symbol = workspaceIndex.getSymbolAtPosition(document.uri.fsPath, position.line + 1, position.character + 1)
      const ref = word && !symbol ? (allReference[word] ?? referenceByTitle[word]) : undefined

      // Look up inferred type from the type cache
      const cached = typecheckCache.get(document.uri.toString())
      let inferredTypeStr =
        cached && symbol?.def && symbol.def.location.file === document.uri.fsPath
          ? getHoverTypeAtDefinition(cached, symbol.def)
          : undefined

      if (!inferredTypeStr && cached) {
        inferredTypeStr = getHoverTypeAtPosition(cached, position, range)
      }

      if (!inferredTypeStr && word && cached) {
        const visibleDefs = workspaceIndex.getSymbolsInScope(
          document.uri.fsPath,
          position.line + 1,
          position.character + 1,
        )
        const matchingDef = visibleDefs.find(def => def.name === word && def.location.file === document.uri.fsPath)
        if (matchingDef) {
          inferredTypeStr = getHoverTypeAtDefinition(cached, matchingDef)
        }
      }

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
    provideDefinition(document, position) {
      const lineText = document.lineAt(position.line).text

      // 1. Check if cursor is inside an import("...") string
      const importRegex = /import\(\s*"([^"]+)"\s*\)/g
      let match
      while ((match = importRegex.exec(lineText)) !== null) {
        const stringStart = match.index + match[0].indexOf('"') + 1
        const stringEnd = stringStart + match[1].length
        if (position.character >= stringStart && position.character <= stringEnd) {
          const importPath = match[1]
          if (!importPath.startsWith('.')) return undefined
          const dir = path.dirname(document.uri.fsPath)
          const resolved = path.resolve(dir, importPath)
          for (const candidate of [resolved, `${resolved}.dvala`]) {
            try {
              fs.accessSync(candidate)
              return new vscode.Location(vscode.Uri.file(candidate), new vscode.Position(0, 0))
            } catch {
              /* try next */
            }
          }
        }
      }

      // 2. Check if cursor is on a user-defined symbol — use the workspace index
      indexDocument(document)
      const line1 = position.line + 1 // VS Code is 0-based, our index is 1-based
      const col1 = position.character + 1

      // First try: cursor is on a reference → navigate to its definition
      const def = workspaceIndex.findDefinition(document.uri.fsPath, line1, col1)
      if (def) {
        const defPos = new vscode.Position(Math.max(0, def.location.line - 1), Math.max(0, def.location.column - 1))
        return new vscode.Location(vscode.Uri.file(def.location.file), defPos)
      }

      // Second try: cursor is on a definition from a destructured import
      // (e.g. `let { average } = import("./lib/stats")`) — navigate to the symbol
      // definition inside the imported file, not just the file itself.
      // Uses the pre-built imports map instead of regex-parsing the line.
      const symbolAtPos = workspaceIndex.getSymbolAtPosition(document.uri.fsPath, line1, col1)
      if (symbolAtPos?.def?.kind === 'import') {
        const fileSymbols = workspaceIndex.getFileSymbols(document.uri.fsPath)
        if (fileSymbols) {
          for (const resolvedPath of fileSymbols.imports.values()) {
            loadIndexedFile(workspaceIndex, resolvedPath)
            const importedSymbols = workspaceIndex.getFileSymbols(resolvedPath)
            const targetDef =
              importedSymbols?.definitions.find(d => d.name === symbolAtPos.name && d.scope === 0) ??
              importedSymbols?.exports.find(d => d.name === symbolAtPos.name)
            if (targetDef) {
              const targetPos = new vscode.Position(
                Math.max(0, targetDef.location.line - 1),
                Math.max(0, targetDef.location.column - 1),
              )
              return new vscode.Location(vscode.Uri.file(resolvedPath), targetPos)
            }
            // Symbol not found in this imported file — try next import
          }
          // Symbol not found in any import — navigate to the first import file
          const firstImport = fileSymbols.imports.values().next().value
          if (firstImport) {
            return new vscode.Location(vscode.Uri.file(firstImport), new vscode.Position(0, 0))
          }
        }
      }

      return undefined
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

  const workspaceIndex = new WorkspaceIndex()
  const lsDiagnostics = vscode.languages.createDiagnosticCollection('dvala-ls')
  const typeDiagnostics = vscode.languages.createDiagnosticCollection('dvala-types')
  // Shared dvala instance for type checking (not evaluation — no effect handlers needed)
  // Includes a file resolver so import("./lib/math") can be typechecked
  const typecheckDvala = createDvala({
    modules: allBuiltinModules,
    debug: true,
    fileResolver: (importPath, fromDir) => {
      const resolved = path.resolve(fromDir, importPath)
      for (const candidate of [resolved, `${resolved}.dvala`]) {
        try {
          return fs.readFileSync(candidate, 'utf-8')
        } catch {
          /* try next */
        }
      }
      throw new Error(`File not found: ${importPath}`)
    },
  })
  /** Update the workspace index for a document and refresh diagnostics. */
  function indexDocument(document: vscode.TextDocument): void {
    if (document.languageId !== 'dvala') return
    const filePath = document.uri.fsPath
    workspaceIndex.updateFile(filePath, document.getText(), nodeResolveImport)
    // Clear stale run diagnostics whenever the document changes or is re-opened.
    // Runtime diagnostics are snapshot-specific and quickly become misleading
    // once the source has changed.
    getDiagnosticCollection().delete(document.uri)
    refreshDiagnostics(document)
  }

  /** Push diagnostics (parse errors + unresolved symbols) to VS Code. */
  function refreshDiagnostics(document: vscode.TextDocument): void {
    const { parseErrors, unresolvedRefs } = workspaceIndex.getDiagnostics(document.uri.fsPath)
    const sharedDiagnostics: SharedDiagnostic[] = [
      ...buildParseDiagnostics(parseErrors),
      ...buildSymbolDiagnostics(unresolvedRefs),
    ]
    lsDiagnostics.set(document.uri, sharedDiagnostics.map(toVsDiagnostic))

    // Run type checker (non-blocking — parse errors don't prevent type checking)
    if (parseErrors.length === 0) {
      try {
        const result = typecheckDvala.typecheck(document.getText(), {
          fileResolverBaseDir: path.dirname(document.uri.fsPath),
        })
        // Cache the result for hover (with source map for position lookups)
        typecheckCache.set(document.uri.toString(), result)
        typeDiagnostics.set(document.uri, buildTypeDiagnostics(result).map(toVsDiagnostic))
      } catch {
        // Type checking failed — clear diagnostics, don't crash the extension
        typeDiagnostics.set(document.uri, [])
        typecheckCache.delete(document.uri.toString())
      }
    } else {
      // Parse errors — clear type diagnostics
      typeDiagnostics.set(document.uri, [])
      typecheckCache.delete(document.uri.toString())
    }
  }

  // Index all open dvala documents on activation
  for (const doc of vscode.workspace.textDocuments) {
    indexDocument(doc)
  }

  // Lazy full-workspace scan — ensures every .dvala file on disk is in the
  // index, not just the ones the user has opened. Required for cross-file
  // rename / find-references to reach files that have never been opened.
  // Fires at most once per session; subsequent calls are no-ops behind the
  // `fullyIndexed` flag, and the filesystem watcher below keeps the index
  // current from then on. Reads from disk (source omitted); open documents
  // that already have dirty buffer content stay authoritative because
  // `WorkspaceIndex` caches by content hash and skips re-parsing unchanged
  // input.
  let fullyIndexed = false
  async function ensureWorkspaceIndexed(): Promise<void> {
    if (fullyIndexed) return
    const uris = await vscode.workspace.findFiles('**/*.dvala', '**/node_modules/**')
    for (const uri of uris) {
      loadIndexedFile(workspaceIndex, uri.fsPath)
    }
    fullyIndexed = true
  }

  // Re-index on document change (debounced)
  const onDidChange = vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.languageId !== 'dvala') return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => indexDocument(event.document), 300)
  })

  // Index newly opened documents
  const onDidOpen = vscode.workspace.onDidOpenTextDocument(doc => {
    indexDocument(doc)
  })

  // Clear diagnostics when a document is closed
  const onDidClose = vscode.workspace.onDidCloseTextDocument(doc => {
    lsDiagnostics.delete(doc.uri)
    typeDiagnostics.delete(doc.uri)
    typecheckCache.delete(doc.uri.toString())
  })

  // Keep the index live for files that are never opened in an editor. The
  // watcher complements `onDidOpen` / `onDidChangeTextDocument`, which only
  // fire for open documents — without it, renaming a saved-but-never-opened
  // file on disk would leave stale `reverseImports` entries pointing at an
  // outdated version.
  const dvalaWatcher = vscode.workspace.createFileSystemWatcher('**/*.dvala')
  const onFsCreate = dvalaWatcher.onDidCreate(uri => loadIndexedFile(workspaceIndex, uri.fsPath))
  const onFsChange = dvalaWatcher.onDidChange(uri => {
    // Open documents carry their authoritative content through
    // onDidChangeTextDocument — skip the disk read so we don't clobber a
    // dirty buffer with the saved-on-disk version.
    const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === uri.fsPath)
    if (openDoc) return
    loadIndexedFile(workspaceIndex, uri.fsPath)
  })
  const onFsDelete = dvalaWatcher.onDidDelete(uri => workspaceIndex.invalidateFile(uri.fsPath))

  // Reference provider — Find All References (Shift+F12)
  const referenceProvider = vscode.languages.registerReferenceProvider('dvala', {
    async provideReferences(document, position) {
      indexDocument(document)
      // Populate the index from disk so references reach files the user
      // hasn't opened yet. First invocation pays the scan; subsequent ones
      // are no-ops.
      await ensureWorkspaceIndexed()
      const target = workspaceIndex.resolveCanonicalFile(document.uri.fsPath, position.line + 1, position.character + 1)
      if (!target) return []

      const occurrences = workspaceIndex.findAllOccurrences(target.file, target.name)
      return occurrences.map(
        occ =>
          new vscode.Location(
            vscode.Uri.file(occ.file),
            new vscode.Position(Math.max(0, occ.line - 1), Math.max(0, occ.column - 1)),
          ),
      )
    },
  })

  // Rename provider — F2 to rename a symbol across the workspace
  const renameProvider = vscode.languages.registerRenameProvider('dvala', {
    prepareRename(document, position) {
      indexDocument(document)
      const symbol = workspaceIndex.getSymbolAtPosition(document.uri.fsPath, position.line + 1, position.character + 1)
      if (!symbol) throw new Error('Cannot rename this element')

      // Find the word range at the cursor position
      const range = document.getWordRangeAtPosition(position, DVALA_WORD_PATTERN)
      if (!range) throw new Error('Cannot rename this element')

      return { range, placeholder: symbol.name }
    },

    async provideRenameEdits(document, position, newName) {
      // Validate that newName is a valid Dvala identifier
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(newName)) {
        throw new Error(`'${newName}' is not a valid identifier`)
      }

      indexDocument(document)
      // Populate the index from disk so the rename reaches files the user
      // hasn't opened yet. First invocation pays the scan; subsequent ones
      // are no-ops.
      await ensureWorkspaceIndexed()
      const target = workspaceIndex.resolveCanonicalFile(document.uri.fsPath, position.line + 1, position.character + 1)
      if (!target) return undefined

      // The cursor is on an import-kind binding whose source module isn't in
      // the index — rename will only cover the current file instead of the
      // full workspace. Surface this so the user doesn't silently ship a
      // half-renamed symbol.
      if (target.unresolvedImport) {
        void vscode.window.showWarningMessage(
          `Rename scoped to this file only: import "${target.unresolvedImport}" isn't indexed. Open the target file or check the path, then retry for a cross-file rename.`,
        )
      }

      const occurrences = workspaceIndex.findAllOccurrences(target.file, target.name)
      const edit = new vscode.WorkspaceEdit()

      for (const occ of occurrences) {
        const uri = vscode.Uri.file(occ.file)
        const start = new vscode.Position(Math.max(0, occ.line - 1), Math.max(0, occ.column - 1))
        const end = new vscode.Position(start.line, start.character + occ.nameLength)
        edit.replace(uri, new vscode.Range(start, end), newName)
      }

      return edit
    },
  })

  // Document Symbol provider — powers the outline view (Cmd+Shift+O) and breadcrumbs
  const documentSymbolProvider = vscode.languages.registerDocumentSymbolProvider('dvala', {
    provideDocumentSymbols(document) {
      indexDocument(document)
      const symbols = workspaceIndex.getDocumentSymbols(document.uri.fsPath)
      return symbols.map(def => {
        const line = Math.max(0, def.location.line - 1)
        const col = Math.max(0, def.location.column - 1)
        const pos = new vscode.Position(line, col)
        const range = new vscode.Range(pos, pos)
        return new vscode.DocumentSymbol(def.name, def.kind, symbolKind(def), range, range)
      })
    },
  })

  // Workspace Symbol provider — Cmd+T to search all symbols across files
  const workspaceSymbolProvider = vscode.languages.registerWorkspaceSymbolProvider({
    provideWorkspaceSymbols(query) {
      const results: vscode.SymbolInformation[] = []
      const lowerQuery = query.toLowerCase()

      for (const doc of vscode.workspace.textDocuments) {
        if (doc.languageId !== 'dvala') continue
        const defs = workspaceIndex.getDocumentSymbols(doc.uri.fsPath)
        for (const def of defs) {
          if (lowerQuery && !def.name.toLowerCase().includes(lowerQuery)) continue
          const line = Math.max(0, def.location.line - 1)
          const col = Math.max(0, def.location.column - 1)
          const pos = new vscode.Position(line, col)
          results.push(
            new vscode.SymbolInformation(
              def.name,
              symbolKind(def),
              '',
              new vscode.Location(vscode.Uri.file(def.location.file), pos),
            ),
          )
        }
      }

      return results
    },
  })

  // Document formatting provider — powers Format Document (Shift+Alt+F / Shift+Option+F)
  const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider('dvala', {
    provideDocumentFormattingEdits(document) {
      const source = document.getText()
      const formatted = formatSource(source)
      if (formatted === source) return []
      const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(source.length))
      return [vscode.TextEdit.replace(fullRange, formatted)]
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

/** Map SymbolDef.kind to VS Code SymbolKind for the outline view. */
function symbolKind(def: SymbolDef): vscode.SymbolKind {
  switch (def.kind) {
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

export function deactivate(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  outputChannel?.dispose()
  statusBarItem?.dispose()
  diagnosticCollection?.dispose()
}
