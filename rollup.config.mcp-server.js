const jsonPlugin = require('@rollup/plugin-json')
const resolve = require('@rollup/plugin-node-resolve')
const typescript = require('@rollup/plugin-typescript')
const { dvalaSourcePlugin } = require('./rollup.plugins')

const plugins = [
  dvalaSourcePlugin(),
  typescript({
    tsconfig: 'tsconfig.mcp-server.json',
    declaration: false,
    declarationDir: undefined,
  }),
  jsonPlugin(),
  resolve({
    extensions: ['.js', '.ts'],
  }),
]

module.exports = [
  {
    input: 'mcp-server/src/server.ts',
    external: [
      'node:fs',
      'node:path',
      'node:os',
      'node:events',
      'node:stream',
      'node:readline',
      'node:process',
      'events',
      'stream',
      'node:http',
      'node:https',
      'node:crypto',
      'node:url',
      'node:net',
      'node:tls',
      'node:util',
      'node:zlib',
      'node:buffer',
      '@modelcontextprotocol/sdk/server/mcp.js',
      '@modelcontextprotocol/sdk/server/stdio.js',
      'zod',
    ],
    output: [
      {
        file: 'dist/mcp-server/server.js',
        format: 'cjs',
        banner: '#!/usr/bin/env node',
      },
    ],
    plugins,
  },
]
