import { defineConfig } from 'rolldown'
import pkg from './package.json' with { type: 'json' }
import { dvalaSourcePlugin, stripDocsPlugin } from './rolldown.plugins.mjs'

const basePlugins = [
  dvalaSourcePlugin(),
]

const pluginsMinimal = [
  ...basePlugins,
  stripDocsPlugin(),
]

const plugins = [
  ...basePlugins,
]

const modules = ['assertion', 'grid', 'vector', 'linear-algebra', 'matrix', 'number-theory', 'math', 'functional', 'string', 'collection', 'sequence', 'bitwise', 'convert']

export default defineConfig([
  // Minimal bundle (core only, no modules, docs stripped)
  {
    input: 'src/index.ts',
    output: [
      {
        file: pkg.module,
        format: 'esm',
        sourcemap: true,
        minify: true,
      },
      {
        file: pkg.main,
        format: 'cjs',
        sourcemap: true,
        minify: true,
      },
      {
        file: pkg.iife,
        format: 'iife',
        sourcemap: true,
        name: 'Dvala',
        minify: true,
      },
    ],
    plugins: pluginsMinimal,
  },
  // Full bundle (core + all modules + docs + reference data)
  {
    input: 'src/full.ts',
    output: [
      {
        file: 'dist/full.esm.js',
        format: 'esm',
        sourcemap: true,
        minify: true,
      },
      {
        file: 'dist/full.js',
        format: 'cjs',
        sourcemap: true,
        minify: true,
      },
    ],
    plugins,
  },
  // Individual module bundles
  ...modules.map(ns => ({
    input: `src/modules/${ns}.ts`,
    output: [
      {
        file: `dist/modules/${ns}.esm.js`,
        format: 'esm',
        sourcemap: true,
        minify: true,
      },
      {
        file: `dist/modules/${ns}.js`,
        format: 'cjs',
        sourcemap: true,
        minify: true,
      },
    ],
    plugins,
  })),
  // Test framework bundle
  {
    input: 'src/testFramework/index.ts',
    external: ['node:fs', 'node:path'],
    output: [
      {
        file: 'dist/testFramework.esm.js',
        format: 'esm',
        sourcemap: true,
        minify: true,
      },
      {
        file: 'dist/testFramework.js',
        format: 'cjs',
        sourcemap: true,
        minify: true,
      },
    ],
    plugins,
  },
  // Bundler (file module bundler, requires Node.js fs)
  {
    input: 'src/bundler.ts',
    external: ['node:fs', 'node:path'],
    output: [
      {
        file: 'dist/bundler.esm.js',
        format: 'esm',
        sourcemap: true,
        minify: true,
      },
      {
        file: 'dist/bundler.js',
        format: 'cjs',
        sourcemap: true,
        minify: true,
      },
    ],
    plugins,
  },
  // Debug bundle (time-travel debugger)
  {
    input: 'src/debug.ts',
    output: [
      {
        file: 'dist/debug.esm.js',
        format: 'esm',
        sourcemap: true,
        minify: true,
      },
      {
        file: 'dist/debug.js',
        format: 'cjs',
        sourcemap: true,
        minify: true,
      },
    ],
    plugins,
  },
])
