import { defineConfig } from 'rolldown'
import { dvalaSourcePlugin } from '../../rolldown.plugins.mjs'

export default defineConfig([
  {
    input: './src/bin.ts',
    external: ['node:fs', 'node:path', 'node:os', 'node:readline'],
    output: [
      {
        file: './dist/cli.cjs',
        format: 'cjs',
      },
    ],
    plugins: [dvalaSourcePlugin()],
  },
])
