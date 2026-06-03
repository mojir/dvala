import { defineConfig } from 'rolldown'
import { dvalaSourcePlugin } from '../../rolldown.plugins.mjs'

export default defineConfig([
  {
    input: './src/buildPlaygroundSite.ts',
    external: ['node:fs', 'node:path', 'node:process', 'node:child_process', 'node:os'],
    output: [
      {
        file: './dist/buildPlaygroundSite.cjs',
        format: 'cjs',
      },
    ],
    plugins: [dvalaSourcePlugin()],
  },
])
