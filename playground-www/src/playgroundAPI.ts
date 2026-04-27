import type { SavedFile } from './fileStorage'

export interface PlaygroundAPI {
  ui: {
    showToast(message: string, level?: 'info' | 'success' | 'warning' | 'error'): void
  }
  editor: {
    getContent(): string
    setContent(code: string): void
    insertText(text: string, position?: number): void
    typeText(text: string, delayMs?: number): Promise<void>
    getSelection(): string
    setSelection(start: number, end: number): void
    getCursor(): number
    setCursor(position: number): void
  }
  context: {
    getContent(): string
    setContent(json: string): void
  }
  files: {
    save(name: string, code?: string): void
    load(name: string): string
    list(): string[]
  }
  exec: {
    run(code: string): Promise<unknown>
  }
  router: {
    goto(route: string): void
    back(): void
  }
}

interface PlaygroundDeps {
  showToast(message: string, options?: { severity?: 'info' | 'error' }): void
  isEditorReadOnly(): boolean
  getEditorContent(): string
  setEditorContent(code: string): void
  insertEditorText(text: string, position?: number): void
  getEditorSelection(): string
  setEditorSelection(start: number, end: number): void
  getEditorCursor(): number
  setEditorCursor(position: number): void
  getContextContent(): string
  setContextContent(json: string): void
  getSavedFiles(): SavedFile[]
  saveFile(name: string, code: string): void
  runCode(code: string): Promise<unknown>
  navigateTo(route: string): void
  navigateBack(): void
}

const TOAST_MIN_INTERVAL_MS = 200
const EXEC_TIMEOUT_MS = 10_000

const toastSeverityMap: Record<string, 'info' | 'error'> = {
  info: 'info',
  success: 'info',
  warning: 'error',
  error: 'error',
}

export function createPlaygroundAPI(deps: PlaygroundDeps): PlaygroundAPI {
  let lastToastTime = 0
  const filesApi = {
    save(name: string, code?: string) {
      const content = code ?? deps.getEditorContent()
      deps.saveFile(name, content)
    },
    load(name: string): string {
      const file = deps.getSavedFiles().find(entry => entry.name === name)
      if (!file) {
        throw new Error(`File "${name}" not found`)
      }
      return file.code
    },
    list(): string[] {
      return deps.getSavedFiles().map(entry => entry.name)
    },
  }

  return {
    ui: {
      showToast(message: string, level = 'info') {
        const now = Date.now()
        if (now - lastToastTime < TOAST_MIN_INTERVAL_MS) return
        lastToastTime = now
        deps.showToast(message, { severity: toastSeverityMap[level] ?? 'info' })
      },
    },
    editor: {
      getContent() {
        return deps.getEditorContent()
      },
      setContent(code: string) {
        if (deps.isEditorReadOnly()) throw new Error('Editor is read-only')
        deps.setEditorContent(code)
      },
      insertText(text: string, position?: number) {
        if (deps.isEditorReadOnly()) throw new Error('Editor is read-only')
        deps.insertEditorText(text, position)
      },
      typeText(text: string, delayMs = 50) {
        if (deps.isEditorReadOnly()) throw new Error('Editor is read-only')
        const startPos = deps.getEditorCursor()
        return new Promise<void>(resolve => {
          let i = 0
          function typeNext() {
            if (i < text.length) {
              deps.insertEditorText(text[i]!, startPos + i)
              i++
              setTimeout(typeNext, delayMs)
            } else {
              resolve()
            }
          }
          typeNext()
        })
      },
      getSelection() {
        return deps.getEditorSelection()
      },
      setSelection(start: number, end: number) {
        deps.setEditorSelection(start, end)
      },
      getCursor() {
        return deps.getEditorCursor()
      },
      setCursor(position: number) {
        deps.setEditorCursor(position)
      },
    },
    context: {
      getContent() {
        return deps.getContextContent()
      },
      setContent(json: string) {
        deps.setContextContent(json)
      },
    },
    files: filesApi,
    exec: {
      run(code: string): Promise<unknown> {
        return Promise.race([
          deps.runCode(code),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('playground.exec.run timed out')), EXEC_TIMEOUT_MS),
          ),
        ])
      },
    },
    router: {
      goto(route: string) {
        deps.navigateTo(route)
      },
      back() {
        deps.navigateBack()
      },
    },
  }
}
