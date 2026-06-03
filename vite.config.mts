import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Vitest-only aliases that route cross-package imports to SOURCE so that the
// in-test identity of every shared class (DvalaError, WorkspaceIndex, etc.)
// matches the identity inside source files. Without these, a test using
// `expect(...).toThrow(DvalaError)` reaches dist's DvalaError while source
// throws source's DvalaError and the `instanceof` check fails.
//
// Production code is unaffected — tsconfig.json no longer carries these paths,
// so non-test consumers resolve through pnpm's node_modules → each package's
// dist/index.js entry.
const runtimePackageEntry = fileURLToPath(new URL('./packages/dvala-runtime/src/index.ts', import.meta.url))
const dvalaTypesEntry = fileURLToPath(new URL('./packages/dvala-types/src/index.ts', import.meta.url))
const dvalaEngineEntry = fileURLToPath(new URL('./packages/dvala-engine/src/index.ts', import.meta.url))
const runtimeArtifactsEntry = fileURLToPath(new URL('./packages/dvala-runtime/src/artifacts/index.ts', import.meta.url))
const coreToolingEntry = fileURLToPath(new URL('./packages/dvala-core-tooling/src/index.ts', import.meta.url))
const testFrameworkEntry = fileURLToPath(new URL('./packages/dvala-test-framework/src/index.ts', import.meta.url))
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
      '@mojir/dvala-runtime/artifacts': runtimeArtifactsEntry,
      '@mojir/dvala-runtime': runtimePackageEntry,
      '@mojir/dvala-types': dvalaTypesEntry,
      '@mojir/dvala-engine': dvalaEngineEntry,
      '@mojir/dvala-core-tooling/node': fileURLToPath(new URL('./packages/dvala-core-tooling/src/languageService/nodeWorkspaceIndexer.ts', import.meta.url)),
      '@mojir/dvala-core-tooling': coreToolingEntry,
      '@mojir/dvala-test-framework': testFrameworkEntry,
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
        // Build artifacts and third-party.
        'dist/**',
        'node_modules/**',

        // Test files and helpers — they shouldn't count toward their own coverage.
        '__tests__/**',
        '**/*.test.ts',

        // Non-TS source: .dvala stdlib and root-level loose .js scripts.
        '*.js',
        '**/*.dvala',

        // Type-only modules — no executable code to cover. Sweeping patterns
        // cover the canonical naming convention (interface.ts / types.ts).
        'types/**',
        '**/interface.ts',
        '**/types.ts',

        // Tooling / build scripts — not product code; exercised by build runs
        // rather than unit tests.
        'scripts/**',
        'playground-builder/**',

        // Bundle entry points (thin wrappers around package exports). Their
        // behavior is covered transitively by the underlying package tests.
        'cli/**',
        'mcp-server/**',
        'packages/dvala-core-tooling/src/index.ts',
        'packages/dvala-core-tooling/src/standaloneTooling.ts',
        'packages/dvala-core-tooling/src/tooling.ts',

        // Frontend / extension code — covered by Playwright e2e, not vitest.
        'apps/playground-www/**',
        'vscode-dvala/**',

        // Generated / data-only reference surface (book content, API mirror).
        'reference/**',

        // Shared utilities partially covered by utils.test.ts; rest is glue.
        // Keep excluded for now; revisit if coverage policy tightens.
        'common/**',

        // Playwright config — not exercised by vitest at all.
        'playwright.config.ts',

        // Specific carve-outs: evaluator entry/step driver are covered via the
        // trampoline-evaluator test surface rather than direct unit tests.
        'packages/dvala-engine/src/evaluator/frames.ts',
        'packages/dvala-engine/src/evaluator/step.ts',

        // Docs dir contains no TS; pattern is a safety net for future drift.
        'docs/**',
      ],
    },
  },
})
