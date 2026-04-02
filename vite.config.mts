import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    {
      name: 'dvala-source',
      transform(_code: string, id: string) {
        if (!id.endsWith('.dvala'))
          return undefined
        const content = readFileSync(id, 'utf-8')
        return `export default ${JSON.stringify(content)}`
      },
    },
  ],
  test: {
    exclude: ['e2e/**', '**/node_modules/**'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      exclude: [
        '*.js',
        '**/*.dvala',
        '__tests__/**',
        'types/**',
        '**/*.test.ts',
        'playground-builder/**',
        'playground-www/**',
        'reference/**',
        'dist/**',
        'node_modules/**',
        'build/**',
        'cli/**',
        'docs/**',
        'common/**',
        'scripts/**',
        'vscode-dvala/**',
        'mcp-server/**',
        '**/interface.ts',
        '**/types.ts',
        'src/index.ts',
        'src/full.ts',
        'src/modules/**',
        'src/bundler.ts',
        'src/evaluator/frames.ts',
        'src/evaluator/step.ts',
        'playwright.config.ts',
      ],
    },
  },
})
