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
    input: 'apps/playground-www/src/playground.ts',
    output: [
      {
        file: 'apps/playground-www/build/playground.js',
        format: 'iife',
        name: 'Playground',
        minify: isCI,
        sourcemap: true,
      },
    ],
    plugins: [bookChaptersPlugin(), cssStubPlugin(), dvalaSourcePlugin(), markdownSourcePlugin()],
  },
  {
    input: 'apps/playground-www/src/lsWorker.ts',
    output: [
      {
        file: 'apps/playground-www/build/lsWorker.js',
        format: 'esm',
        minify: isCI,
        sourcemap: true,
      },
    ],
    plugins: [bookChaptersPlugin(), cssStubPlugin(), dvalaSourcePlugin(), markdownSourcePlugin()],
  },
])
