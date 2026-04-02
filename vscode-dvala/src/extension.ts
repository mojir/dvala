import * as path from 'node:path'
import * as vscode from 'vscode'
import { allReference, isFunctionReference, isCustomReference } from '../../reference/index'
import type { Reference } from '../../reference/index'
import { createDvala } from '../../src/createDvala'
import { allBuiltinModules } from '../../src/allModules'
import { stringifyValue } from '../../common/utils'
import type { Handlers } from '../../src/evaluator/effectTypes'

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
  }
  else if (isCustomReference(ref)) {
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

function categoryToCompletionKind(category: string): vscode.CompletionItemKind {
  switch (category) {
    case 'special-expression': return vscode.CompletionItemKind.Keyword
    case 'effect': return vscode.CompletionItemKind.Event
    case 'shorthand': return vscode.CompletionItemKind.Operator
    case 'datatype': return vscode.CompletionItemKind.Class
    default: return vscode.CompletionItemKind.Function
  }
}

function buildCompletionItems(): vscode.CompletionItem[] {
  const seen = new Set<string>()
  const items: vscode.CompletionItem[] = []

  for (const ref of Object.values(allReference)) {
    const label = ref.title
    if (seen.has(label)) continue
    seen.add(label)

    const item = new vscode.CompletionItem(label, categoryToCompletionKind(ref.category))
    item.detail = ref.category
    item.documentation = buildHoverMarkdown(label, ref)

    if (isFunctionReference(ref) && ref.variants.length > 0) {
      const argNames = ref.variants[0].argumentNames
      if (argNames.length > 0) {
        const snippetArgs = argNames.map((name, i) => `\${${i + 1}:${name}}`).join(', ')
        item.insertText = new vscode.SnippetString(`${label}(${snippetArgs})`)
      }
      else {
        item.insertText = new vscode.SnippetString(`${label}($0)`)
      }
    }

    items.push(item)
  }

  return items
}

const completionItems = buildCompletionItems()

let outputChannel: vscode.OutputChannel | undefined
let statusBarItem: vscode.StatusBarItem | undefined
let diagnosticCollection: vscode.DiagnosticCollection | undefined

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
    { pattern: 'dvala.io.print', handler: async (ctx) => {
      const str = stringifyValue(ctx.arg, false)
      channel.append(str)
      ctx.resume(ctx.arg)
    } },
    { pattern: 'dvala.io.error', handler: async (ctx) => {
      const str = stringifyValue(ctx.arg, false)
      channel.appendLine(`[stderr] ${str}`)
      ctx.resume(ctx.arg)
    } },
    { pattern: 'dvala.io.read', handler: async (ctx) => {
      const prompt = typeof ctx.arg === 'string' ? ctx.arg : undefined
      const result = await vscode.window.showInputBox({ prompt, ignoreFocusOut: true })
      ctx.resume(result ?? null)
    } },
    { pattern: 'dvala.io.pick', handler: async (ctx) => {
      const arg = ctx.arg as { message?: string; options: string[] }
      const options = Array.isArray(arg) ? arg : arg.options
      const message = Array.isArray(arg) ? undefined : arg.message
      const result = await vscode.window.showQuickPick(options, { placeHolder: message, ignoreFocusOut: true })
      ctx.resume(result ?? null)
    } },
    { pattern: 'dvala.io.confirm', handler: async (ctx) => {
      const message = typeof ctx.arg === 'string' ? ctx.arg : 'Confirm?'
      const result = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: message, ignoreFocusOut: true })
      ctx.resume(result === 'Yes')
    } },
    { pattern: '*', handler: async (ctx) => {
      // Pass through to standard handlers for standard effects
      if (ctx.effectName.startsWith('dvala.error') ||
          ctx.effectName === 'dvala.io.readStdin' ||
          ctx.effectName.startsWith('dvala.random') ||
          ctx.effectName.startsWith('dvala.time') ||
          ctx.effectName === 'dvala.sleep' ||
          ctx.effectName === 'dvala.checkpoint' ||
          ctx.effectName === 'dvala.macro.expand') {
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
      }
      catch {
        ctx.fail(`Invalid JSON for effect "${ctx.effectName}": ${input}`)
      }
    } },
  ]

  const status = getStatusBarItem()
  status.text = '$(sync~spin) Dvala: Running...'
  status.show()

  const collection = getDiagnosticCollection()
  try {
    const runResult = await dvala.runAsync(code, { effectHandlers: handlers })
    if (runResult.type === 'error')
      throw runResult.error
    const value = runResult.type === 'completed' ? runResult.value : runResult.snapshot
    channel.appendLine(`=> ${stringifyValue(value, false)}`)
    if (uri) collection.set(uri, [])
  }
  catch (error) {
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
      }
      else {
        collection.set(uri, [])
      }
    }
  }
  finally {
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
    provideCompletionItems() {
      return completionItems
    },
  })

  const hoverProvider = vscode.languages.registerHoverProvider('dvala', {
    provideHover(document, position) {
      const diagnostics = getDiagnosticCollection()
        .get(document.uri)
        ?.filter(d => d.range.contains(position))

      const range = document.getWordRangeAtPosition(position, DVALA_WORD_PATTERN)
      const word = range ? document.getText(range) : undefined
      const ref = word ? (allReference[word] ?? referenceByTitle[word]) : undefined

      if (!diagnostics?.length && !ref) return undefined

      const md = new vscode.MarkdownString()

      if (diagnostics?.length) {
        md.appendMarkdown(`$(error) **Dvala Error**\n\n`)
        if (ref) md.appendMarkdown('---\n\n')
      }

      if (ref) md.appendMarkdown(buildHoverMarkdown(word!, ref).value)

      md.supportThemeIcons = true
      return new vscode.Hover(md, range)
    },
  })

  // Go to Definition for import("./path") — Cmd+click or F12 on the import path
  // navigates to the imported file
  const definitionProvider = vscode.languages.registerDefinitionProvider('dvala', {
    provideDefinition(document, position) {
      const line = document.lineAt(position.line).text
      // Match import("...") and check if cursor is inside the string
      const importRegex = /import\(\s*"([^"]+)"\s*\)/g
      let match
      while ((match = importRegex.exec(line)) !== null) {
        const stringStart = match.index + match[0].indexOf('"') + 1
        const stringEnd = stringStart + match[1].length
        if (position.character >= stringStart && position.character <= stringEnd) {
          const importPath = match[1]
          // Only handle relative imports
          if (!importPath.startsWith('.')) return undefined
          const dir = path.dirname(document.uri.fsPath)
          const resolved = path.resolve(dir, importPath)
          // Try exact path first, then with .dvala extension
          for (const candidate of [resolved, `${resolved}.dvala`]) {
            const uri = vscode.Uri.file(candidate)
            try {
              // Check if file exists by trying to stat it synchronously
              require('fs').accessSync(candidate)
              return new vscode.Location(uri, new vscode.Position(0, 0))
            }
            catch {
              // File doesn't exist, try next candidate
            }
          }
        }
      }
      return undefined
    },
  })

  // "Go to Definition" in the debug Variables pane — sends a custom DAP request
  // to resolve the source location, then opens the file at that position
  const goToSource = vscode.commands.registerCommand('dvala.debug.goToSource', async (variable: { variable: { variablesReference: number; name: string } }) => {
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
    }
    catch {
      // No source location for this variable — silently ignore
    }
  })

  context.subscriptions.push(runFile, runBlock, runSelection, completionProvider, hoverProvider, definitionProvider, goToSource)
}

export function deactivate(): void {
  outputChannel?.dispose()
  statusBarItem?.dispose()
  diagnosticCollection?.dispose()
}
