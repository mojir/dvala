import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    {
      name: 'dvala-source',
      transform(_code, id) {
        if (!id.endsWith('.dvala'))
          return undefined
        const content = readFileSync(id, 'utf-8')
        return `export default ${JSON.stringify(content)}`
      },
    },
  ],
  test: {
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      exclude: [
        '*.js',
        '__tests__/**',
        'types/**',
        '**/*.test.ts',
        'playground-builder/**',
        'playground-www/**',
        'reference/**',
        'dist/**',
        'node_modules/**',
        'build/**',
        'cli/**',
        'docs/**',
        'common/**',
        'scripts/**',
        '**/interface.ts',
        '**/types.ts',
        'src/index.ts',
        'src/full.ts',
      ],
    },
  },
})
