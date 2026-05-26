import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const dvalaEntry = fileURLToPath(new URL('./src/index.ts', import.meta.url))
const dvalaBundlerEntry = fileURLToPath(new URL('./src/bundler.ts', import.meta.url))
const dvalaToolingEntry = fileURLToPath(new URL('./src/tooling.ts', import.meta.url))
const runtimePackageEntry = fileURLToPath(new URL('./packages/dvala-runtime/src/index.ts', import.meta.url))
const runtimeArtifactsEntry = fileURLToPath(new URL('./packages/dvala-runtime/src/artifacts/index.ts', import.meta.url))
const coreToolingEntry = fileURLToPath(new URL('./packages/dvala-core-tooling/src/index.ts', import.meta.url))
const workspaceBackendEntry = fileURLToPath(new URL('./packages/dvala-workspace-backend/src/index.ts', import.meta.url))
const workspaceBackendRuntimeEntry = fileURLToPath(
  new URL('./packages/dvala-workspace-backend/src/runtime/index.ts', import.meta.url),
)
const workspaceBackendPlaygroundProtocolEntry = fileURLToPath(
  new URL('./packages/dvala-workspace-backend/src/adapters/playgroundWorkerProtocol.ts', import.meta.url),
)

export default defineConfig({
  resolve: {
    alias: {
      '@mojir/dvala/bundler': dvalaBundlerEntry,
      '@mojir/dvala/tooling': dvalaToolingEntry,
      '@mojir/dvala': dvalaEntry,
      '@mojir/dvala-runtime/artifacts': runtimeArtifactsEntry,
      '@mojir/dvala-runtime': runtimePackageEntry,
      '@mojir/dvala-core-tooling': coreToolingEntry,
      '@mojir/dvala-workspace-backend/adapters/playground-worker-protocol': workspaceBackendPlaygroundProtocolEntry,
      '@mojir/dvala-workspace-backend/runtime': workspaceBackendRuntimeEntry,
      '@mojir/dvala-workspace-backend': workspaceBackendEntry,
    },
  },
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
    exclude: ['e2e/**', '.wireit/**', '**/node_modules/**'],
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
        'apps/playground-www/**',
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
        'src/standaloneTooling.ts',
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
