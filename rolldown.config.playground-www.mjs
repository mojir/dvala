import { defineConfig } from 'rolldown'
import { dvalaSourcePlugin } from './rolldown.plugins.mjs'

export default defineConfig([
  {
    onwarn(warning, warn) {
      // suppress eval warnings
      if (warning.code === 'EVAL')
        return

      warn(warning)
    },
    input: 'playground-www/src/playground.ts',
    output: [
      {
        file: 'playground-www/build/playground.js',
        format: 'iife',
        name: 'Playground',
        minify: true,
      },
    ],
    plugins: [dvalaSourcePlugin()],
  },
])
