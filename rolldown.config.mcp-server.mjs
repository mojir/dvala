import { defineConfig } from 'rolldown'
import { dvalaSourcePlugin } from './rolldown.plugins.mjs'

export default defineConfig([
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
    plugins: [dvalaSourcePlugin()],
  },
])
