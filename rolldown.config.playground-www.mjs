import { defineConfig } from 'rolldown'
import { bookChaptersPlugin, cssStubPlugin, dvalaSourcePlugin, markdownSourcePlugin } from './rolldown.plugins.mjs'

const isCI = !!process.env.CI

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
        minify: isCI,
        sourcemap: true,
      },
    ],
    plugins: [bookChaptersPlugin(), cssStubPlugin(), dvalaSourcePlugin(), markdownSourcePlugin()],
  },
])
