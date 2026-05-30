import { defineConfig } from 'rolldown'

// Bundles @mojir/dvala-types into a self-contained dist/index.js so consumers
// resolving the package through `node_modules` don't trip on tsgo's missing
// `.js` extensions in relative imports.
export default defineConfig({
  input: './src/index.ts',
  external: [/^node:/],
  output: {
    file: './dist/index.js',
    format: 'esm',
    sourcemap: true,
  },
})
