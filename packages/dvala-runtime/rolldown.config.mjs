import { defineConfig } from 'rolldown'

// Bundles @mojir/dvala-runtime's three public entry points (`.`, `./artifacts`,
// `./evaluator`) into self-contained dist files. Workspace deps stay external;
// consumers resolve them via their own node_modules.
const externalDeps = ['@mojir/dvala-types', /^node:/]

export default defineConfig([
  {
    input: './src/index.ts',
    external: externalDeps,
    output: { file: './dist/index.js', format: 'esm', sourcemap: true },
  },
  {
    input: './src/artifacts/index.ts',
    external: externalDeps,
    output: { file: './dist/artifacts/index.js', format: 'esm', sourcemap: true },
  },
  {
    input: './src/evaluator/index.ts',
    external: externalDeps,
    output: { file: './dist/evaluator/index.js', format: 'esm', sourcemap: true },
  },
])
