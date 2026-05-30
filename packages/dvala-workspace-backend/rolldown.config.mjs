import { defineConfig } from 'rolldown'

// Bundles @mojir/dvala-workspace-backend's three public entry points
// (`.`, `./runtime`, `./adapters/playground-worker-protocol`) into self-contained
// dist files. Workspace deps stay external.
const externalDeps = [
  '@mojir/dvala-core-tooling',
  '@mojir/dvala-engine',
  '@mojir/dvala-runtime',
  '@mojir/dvala-types',
  /^node:/,
]

export default defineConfig([
  {
    input: './src/index.ts',
    external: externalDeps,
    output: { file: './dist/index.js', format: 'esm', sourcemap: true },
  },
  {
    input: './src/runtime/index.ts',
    external: externalDeps,
    output: { file: './dist/runtime/index.js', format: 'esm', sourcemap: true },
  },
  {
    input: './src/adapters/playgroundWorkerProtocol.ts',
    external: externalDeps,
    output: { file: './dist/adapters/playgroundWorkerProtocol.js', format: 'esm', sourcemap: true },
  },
])
