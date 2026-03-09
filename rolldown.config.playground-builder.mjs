import { defineConfig } from 'rolldown'
import { dvalaSourcePlugin } from './rolldown.plugins.mjs'

export default defineConfig([
  {
    input: 'playground-builder/src/buildPlaygroundSite.ts',
    external: ['node:fs', 'node:path', 'node:process', 'node:child_process', 'node:os'],
    output: [
      {
        file: 'playground-builder/build/buildPlaygroundSite.js',
        format: 'cjs',
      },
    ],
    plugins: [dvalaSourcePlugin()],
  },
])
