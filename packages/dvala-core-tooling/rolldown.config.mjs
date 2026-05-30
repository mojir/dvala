import { defineConfig } from 'rolldown'
import { dvalaSourcePlugin } from '../../rolldown.plugins.mjs'

// Bundles @mojir/dvala-core-tooling into a self-contained dist/index.js.
// `prelude.dvala` (the refined-type prelude consumed by the typechecker) is
// inlined as a default-exported string via dvalaSourcePlugin.
//
// Workspace deps stay external — consumers resolve them via their own
// node_modules.
//
// A separate `dist/node.js` bundle exposes node-only helpers
// (loadFile, nodeResolveImport from nodeWorkspaceIndexer) via the subpath
// export `@mojir/dvala-core-tooling/node`. Browser-target consumers never
// touch it; node-side consumers (vscode-dvala) opt in explicitly.
const externalDeps = [
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
    plugins: [dvalaSourcePlugin()],
  },
  {
    input: './src/languageService/nodeWorkspaceIndexer.ts',
    external: [...externalDeps, '@mojir/dvala-core-tooling'],
    output: { file: './dist/node.js', format: 'esm', sourcemap: true },
  },
])
