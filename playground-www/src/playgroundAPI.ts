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
