import { defineConfig } from 'rolldown'
import { dvalaSourcePlugin } from '../../rolldown.plugins.mjs'

// Bundles @mojir/dvala-core-tooling into a self-contained dist/index.js.
// `prelude.dvala` (the refined-type prelude consumed by the typechecker) is
// inlined as a default-exported string via dvalaSourcePlugin — without this,
// post-source→dist-flip consumers fail at runtime when typechecker/prelude.js
// tries to `import preludeSource from '../prelude.dvala'`.
//
// Workspace deps stay external — consumers resolve them via their own
// node_modules (via tsconfig paths during transition; via package.json
// exports in the end-state).
export default defineConfig({
  input: './src/index.ts',
  external: [
    '@mojir/dvala-engine',
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
