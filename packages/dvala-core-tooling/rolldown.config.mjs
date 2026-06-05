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
  // `bundle()` is the node-only file walker (imports node:fs/path), exposed via
  // the `@mojir/dvala-core-tooling/bundler` subpath. Like `/node`, browser-target
  // consumers never touch it; node-side consumers (CLI, the VS Code debug
  // adapter) opt in explicitly.
  {
    input: './src/bundler/index.ts',
    external: externalDeps,
    output: { file: './dist/bundler/index.js', format: 'esm', sourcemap: true },
  },
  // The canonical API reference registry, exposed via the
  // `@mojir/dvala-core-tooling/reference[/*]` subpath exports. It lives here
  // (rather than its own package) because it and the tooling are mutually
  // dependent: reference uses the formatter + tokenizer, while the language
  // service uses the reference registry for completions. `book` reads markdown
  // via node:fs and is only imported from node contexts.
  //
  // A single multi-entry build (not one per subpath) so the formatter/tokenizer
  // the entries share is emitted once into a chunk rather than duplicated into
  // each of dist/reference/{datatype,examples,format}.js.
  {
    input: {
      'reference/index': './src/reference/index.ts',
      'reference/api': './src/reference/api.ts',
      'reference/book': './src/reference/book.ts',
      'reference/datatype': './src/reference/datatype.ts',
      'reference/examples': './src/reference/examples.ts',
      'reference/format': './src/reference/format.ts',
    },
    external: externalDeps,
    output: {
      dir: './dist',
      entryFileNames: '[name].js',
      chunkFileNames: 'reference/_chunks/[name].js',
      format: 'esm',
      sourcemap: true,
    },
  },
])
