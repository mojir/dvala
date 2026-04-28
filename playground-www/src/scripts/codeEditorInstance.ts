// Singleton handle to the playground's Monaco-backed CodeEditor.
//
// `CodeEditor` is constructed once during boot (see scripts.ts boot sequence).
// All other modules read the live instance through `getCodeEditor()` instead of
// importing scripts.ts directly — same pattern as `elements.ts` for DOM nodes.
//
// Throws if accessed before boot has wired up the editor; that indicates a
// load-order bug rather than a recoverable state.

import type { CodeEditor } from '../codeEditor'

let instance: CodeEditor | null = null

export function setCodeEditor(editor: CodeEditor): void {
  instance = editor
}

export function getCodeEditor(): CodeEditor {
  if (!instance) throw new Error('CodeEditor not initialised yet')
  return instance
}
