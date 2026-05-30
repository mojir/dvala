import { defineConfig } from 'rolldown'

// Bundles @mojir/dvala-mcp-server into a self-contained dist/index.js.
// Workspace deps stay external; node-built-ins stay external.
export default defineConfig({
  input: './src/index.ts',
  external: [
    '@mojir/dvala-core-tooling',
    // reference/ (consumed via repo-relative path) transitively imports from
    // engine/types/runtime — externalize those too so rolldown doesn't follow
    // into the engine's .dvala source files.
    '@mojir/dvala-engine',
    '@mojir/dvala-runtime',
    '@mojir/dvala-types',
    /^node:/,
    '@modelcontextprotocol/sdk',
    /^@modelcontextprotocol\//,
    'zod',
  ],
  output: {
    file: './dist/index.js',
    format: 'esm',
    sourcemap: true,
  },
})
