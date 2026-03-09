import { defineConfig } from 'rolldown'
import { dvalaSourcePlugin } from './rolldown.plugins.mjs'

export default defineConfig([
  {
    input: 'cli/src/cli.ts',
    external: ['node:fs', 'node:path', 'node:os', 'node:readline'],
    output: [
      {
        file: 'dist/cli/cli.js',
        format: 'cjs',
      },
    ],
    plugins: [dvalaSourcePlugin()],
  },
])
