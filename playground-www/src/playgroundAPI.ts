import type { SavedProgram } from './programStorage'

export interface PlaygroundAPI {
  ui: {
    showToast(message: string, level?: 'info' | 'success' | 'warning' | 'error'): void
    setTheme(theme: 'light' | 'dark'): void
  }
  editor: {
    getContent(): string
    setContent(code: string): void
    insertText(text: string, position?: number): void
    typeText(text: string, delayMs?: number): Promise<void>
  }
  storage: {
    save(name: string, code?: string): void
    load(name: string): string
    list(): string[]
  }
  exec: {
    run(code: string): Promise<unknown>
  }
}

export interface PlaygroundDeps {
  showToast(message: string, options?: { severity?: 'info' | 'error' }): void
  getEditorContent(): string
  setEditorContent(code: string): void
  insertEditorText(text: string, position?: number): void
  getSavedPrograms(): SavedProgram[]
  saveProgram(name: string, code: string): void
  runCode(code: string): Promise<unknown>
  setTheme(theme: 'light' | 'dark'): void
}

const toastSeverityMap: Record<string, 'info' | 'error'> = {
  info: 'info',
  success: 'info',
  warning: 'error',
  error: 'error',
}

export function createPlaygroundAPI(deps: PlaygroundDeps): PlaygroundAPI {
  return {
    ui: {
      showToast(message: string, level = 'info') {
        deps.showToast(message, { severity: toastSeverityMap[level] ?? 'info' })
      },
      setTheme(theme: 'light' | 'dark') {
        deps.setTheme(theme)
      },
    },
    editor: {
      getContent() {
        return deps.getEditorContent()
      },
      setContent(code: string) {
        deps.setEditorContent(code)
      },
      insertText(text: string, position?: number) {
        deps.insertEditorText(text, position)
      },
      typeText(text: string, delayMs = 50) {
        return new Promise<void>(resolve => {
          let i = 0
          function typeNext() {
            if (i < text.length) {
              deps.insertEditorText(text[i]!)
              i++
              setTimeout(typeNext, delayMs)
            } else {
              resolve()
            }
          }
          typeNext()
        })
      },
    },
    storage: {
      save(name: string, code?: string) {
        const content = code ?? deps.getEditorContent()
        deps.saveProgram(name, content)
      },
      load(name: string): string {
        const program = deps.getSavedPrograms().find(p => p.name === name)
        if (!program) {
          throw new Error(`Program "${name}" not found`)
        }
        return program.code
      },
      list(): string[] {
        return deps.getSavedPrograms().map(p => p.name)
      },
    },
    exec: {
      run(code: string): Promise<unknown> {
        return deps.runCode(code)
      },
    },
  }
}
