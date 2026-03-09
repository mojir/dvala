const jsonPlugin = require('@rollup/plugin-json')
const resolve = require('@rollup/plugin-node-resolve')
const terser = require('@rollup/plugin-terser')
const typescript = require('@rollup/plugin-typescript')
const { dvalaSourcePlugin } = require('./rollup.plugins')

const plugins = [
  dvalaSourcePlugin(),
  typescript({
    tsconfig: 'tsconfig.playground-www.json',
    declaration: false,
    declarationDir: undefined,
  }),
  jsonPlugin(),
  resolve({
    // options to customize how modules are resolved
    extensions: ['.js', '.ts'], // add file extensions you're using
  }),
  terser(),
]

module.exports = [
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
      },
    ],
    plugins,
  },
]
