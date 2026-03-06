import * as path from 'node:path'
import * as vscode from 'vscode'
import { Dvala } from '../../src/Dvala/Dvala'
import { allBuiltinModules } from '../../src/allModules'
import { stringifyValue } from '../../common/utils'

let outputChannel: vscode.OutputChannel | undefined

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Dvala')
  }
  return outputChannel
}

function runCode(code: string, label: string): void {
  const channel = getOutputChannel()
  channel.clear()
  channel.show(true)
  channel.appendLine(`Running ${label}`)
  channel.appendLine('─'.repeat(50))

  const dvala = new Dvala({ modules: allBuiltinModules })

  const captured: string[] = []
  const originalLog = console.log
  // eslint-disable-next-line no-console
  console.log = (...args: unknown[]) => captured.push(args.map(a => stringifyValue(a, false)).join(' '))

  try {
    const result = dvala.run(code)
    for (const line of captured) {
      channel.appendLine(line)
    }
    channel.appendLine(`=> ${stringifyValue(result, false)}`)
  }
  catch (error) {
    for (const line of captured) {
      channel.appendLine(line)
    }
    channel.appendLine(`Error: ${error}`)
  }
  finally {
    console.log = originalLog
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
      runCode(code, label)
    })
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

    runCode(code, label)
  })

  context.subscriptions.push(runFile, runSelection)
}

export function deactivate(): void {
  outputChannel?.dispose()
}
