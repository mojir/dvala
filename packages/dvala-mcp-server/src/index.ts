import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { version } from '../../../package.json'
import { stringifyValue } from '../../../common/utils'
import {
  formatDoc,
  formatExamples,
  getModuleNames,
  listCoreExpressions,
  listDatatypes,
  listModuleExpressions,
  listModules,
  lookupDoc,
} from '../../../reference/format'
import { allBuiltinModules, parseTokenStream, tokenizeSource } from '../../dvala-core-tooling/src'
import { createDvala, initReferenceData } from '../../../src'
initReferenceData()

export function createMcpServer(): McpServer {
  const dvala = createDvala({ modules: allBuiltinModules, debug: false })
  const dvalaDebug = createDvala({ modules: allBuiltinModules, debug: true })

  const server = new McpServer({
    name: 'dvala',
    version,
  })

  server.tool(
    'listCoreExpressions',
    'List all core Dvala functions and special expressions with short descriptions',
    {},
    async () => ({ content: [{ type: 'text', text: listCoreExpressions() }] }),
  )

  server.tool('listModules', 'List all available Dvala modules', {}, async () => ({
    content: [{ type: 'text', text: listModules() }],
  }))

  server.tool(
    'listModuleExpressions',
    'List all functions in a specific Dvala module',
    { moduleName: z.string().describe('The module name, e.g. "grid", "vector", "matrix"') },
    async ({ moduleName }) => {
      const result = listModuleExpressions(moduleName)
      if (result === null) {
        return {
          content: [
            { type: 'text', text: `Unknown module "${moduleName}". Available: ${getModuleNames().join(', ')}` },
          ],
          isError: true,
        }
      }
      return { content: [{ type: 'text', text: result }] }
    },
  )

  server.tool(
    'getDoc',
    'Get full documentation for a Dvala function, special expression, effect, shorthand, or datatype.',
    {
      name: z
        .string()
        .describe('The name of the function or expression, e.g. "map", "if", "grid.transpose", "dvala.io.print"'),
    },
    async ({ name }) => {
      const result = lookupDoc(name)
      if ('error' in result) {
        return { content: [{ type: 'text', text: result.error }], isError: true }
      }
      if ('ambiguous' in result) {
        return {
          content: [
            {
              type: 'text',
              text: `Multiple matches for "${name}":\n${result.ambiguous.map(m => `  ${m}`).join('\n')}\n\nPlease be more specific.`,
            },
          ],
        }
      }
      return { content: [{ type: 'text', text: formatDoc(result.ref) }] }
    },
  )

  server.tool(
    'runCode',
    'Execute Dvala code and return the result. The code runs in a sandboxed environment with all modules loaded.',
    {
      code: z.string().describe('Dvala source code to execute'),
      scope: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Optional variable scope available in the code, e.g. {"x": 42}'),
    },
    async ({ code, scope }) => {
      try {
        const result = dvala.run(code, scope ? { scope } : undefined)
        return { content: [{ type: 'text', text: stringifyValue(result, false) }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
      }
    },
  )

  server.tool(
    'runCodeDebug',
    'Execute Dvala code with debug mode enabled (captures source positions for better error messages).',
    {
      code: z.string().describe('Dvala source code to execute'),
      scope: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Optional variable scope available in the code, e.g. {"x": 42}'),
    },
    async ({ code, scope }) => {
      try {
        const result = dvalaDebug.run(code, scope ? { scope } : undefined)
        return { content: [{ type: 'text', text: stringifyValue(result, false) }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
      }
    },
  )

  server.tool(
    'tokenizeCode',
    'Tokenize Dvala source code into a token stream (JSON).',
    { code: z.string().describe('Dvala source code to tokenize') },
    async ({ code }) => {
      try {
        return { content: [{ type: 'text', text: JSON.stringify(tokenizeSource(code, false), null, 2) }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
      }
    },
  )

  server.tool(
    'tokenizeCodeDebug',
    'Tokenize Dvala source code with debug source positions.',
    { code: z.string().describe('Dvala source code to tokenize') },
    async ({ code }) => {
      try {
        return { content: [{ type: 'text', text: JSON.stringify(tokenizeSource(code, true), null, 2) }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
      }
    },
  )

  server.tool(
    'parseCode',
    'Parse Dvala source code into an AST (tokenize + parse in one step).',
    { code: z.string().describe('Dvala source code to parse') },
    async ({ code }) => {
      try {
        const ast = parseTokenStream(tokenizeSource(code, false))
        return { content: [{ type: 'text', text: JSON.stringify(ast, null, 2) }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
      }
    },
  )

  server.tool(
    'parseCodeDebug',
    'Parse Dvala source code into an AST with debug source positions.',
    { code: z.string().describe('Dvala source code to parse') },
    async ({ code }) => {
      try {
        const ast = parseTokenStream(tokenizeSource(code, true))
        return { content: [{ type: 'text', text: JSON.stringify(ast, null, 2) }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
      }
    },
  )

  server.tool(
    'parseTokenStream',
    'Parse a previously tokenized token stream (JSON) into an AST.',
    { tokenStream: z.string().describe('Token stream as JSON string (output of tokenizeCode or tokenizeCodeDebug)') },
    async ({ tokenStream: tokenStreamJson }) => {
      try {
        const ast = parseTokenStream(JSON.parse(tokenStreamJson))
        return { content: [{ type: 'text', text: JSON.stringify(ast, null, 2) }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
      }
    },
  )

  server.tool(
    'parseTokenStreamDebug',
    'Parse a previously tokenized debug token stream (JSON) into an AST.',
    { tokenStream: z.string().describe('Debug token stream as JSON string (output of tokenizeCodeDebug)') },
    async ({ tokenStream: tokenStreamJson }) => {
      try {
        const ast = parseTokenStream(JSON.parse(tokenStreamJson))
        return { content: [{ type: 'text', text: JSON.stringify(ast, null, 2) }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
      }
    },
  )

  server.tool(
    'getExamples',
    'Get built-in example Dvala programs that demonstrate language features',
    {},
    async () => ({
      content: [{ type: 'text', text: formatExamples() }],
    }),
  )

  server.tool('listDatatypes', 'List all Dvala datatypes with descriptions', {}, async () => ({
    content: [{ type: 'text', text: listDatatypes() }],
  }))

  return server
}

export async function runMcpServer(): Promise<void> {
  const server = createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
