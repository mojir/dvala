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
    // Share module cache across files within a worker. Drops cumulative import
    // time from ~48s to ~15s and trims wall-clock by ~17% on this suite. Safe
    // because `vitest.setup.ts` runs per-worker (so its console/stdout mocks
    // persist), and the few tests that mutate module-level state
    // (e.g. fold.test.ts via vi.resetModules + vi.stubEnv) clean up in
    // afterEach. Revert this if a test starts flaking due to inter-file leakage.
    isolate: false,
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
