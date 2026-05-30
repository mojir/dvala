import { defineConfig } from 'rolldown'

// Bundles @mojir/dvala-test-framework into a self-contained dist/index.js.
// Workspace deps stay external; consumers resolve them via their own node_modules.
export default defineConfig({
  input: './src/index.ts',
  external: [
    '@mojir/dvala-core-tooling',
    '@mojir/dvala-engine',
    '@mojir/dvala-types',
    /^node:/,
    'glob',
    'minimatch',
  ],
  output: {
    file: './dist/index.js',
    format: 'esm',
    sourcemap: true,
  },
})
