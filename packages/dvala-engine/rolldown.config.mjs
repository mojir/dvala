import { defineConfig } from 'rolldown'
import { dvalaSourcePlugin } from '../../rolldown.plugins.mjs'

// Bundles @mojir/dvala-engine into a self-contained dist/index.js.
// `.dvala` source files (the core stdlib written in Dvala) are inlined as
// default-exported strings via dvalaSourcePlugin.
//
// Workspace deps stay external — consumers resolve them via their own
// node_modules (via tsconfig paths during transition; via package.json
// exports in the end-state).
export default defineConfig({
  input: './src/index.ts',
  external: [
    '@mojir/dvala-runtime',
    '@mojir/dvala-types',
    /^node:/,
  ],
  output: {
    file: './dist/index.js',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [dvalaSourcePlugin()],
})
