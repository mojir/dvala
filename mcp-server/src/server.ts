import process from 'node:process'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { version } from '../../package.json'
import { stringifyValue } from '../../common/utils'
import { formatDoc, formatExamples, getModuleNames, listCoreExpressions, listDatatypes, listModuleExpressions, listModules, lookupDoc } from '../../reference/format'
import { allBuiltinModules } from '../../src/allModules'
import { createDvala } from '../../src/createDvala'
import '../../src/initReferenceData'
import { parseTokenStream, tokenizeSource } from '../../src/tooling'

// ---------------------------------------------------------------------------
// Dvala instances for code execution
// ---------------------------------------------------------------------------

const dvala = createDvala({ modules: allBuiltinModules, debug: false })
const dvalaDebug = createDvala({ modules: allBuiltinModules, debug: true })

// ---------------------------------------------------------------------------
// MCP Server — thin wrapper around shared reference/format helpers
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'dvala',
  version,
})

// --- Tool: listCoreExpressions ---
server.tool(
  'listCoreExpressions',
  'List all core Dvala functions and special expressions with short descriptions',
  {},
  async () => ({ content: [{ type: 'text', text: listCoreExpressions() }] }),
)

// --- Tool: listModules ---
server.tool(
  'listModules',
  'List all available Dvala modules',
  {},
  async () => ({ content: [{ type: 'text', text: listModules() }] }),
)

// --- Tool: listModuleExpressions ---
server.tool(
  'listModuleExpressions',
  'List all functions in a specific Dvala module',
  { moduleName: z.string().describe('The module name, e.g. "grid", "vector", "matrix"') },
  async ({ moduleName }) => {
    const result = listModuleExpressions(moduleName)
    if (result === null) {
      return {
        content: [{ type: 'text', text: `Unknown module "${moduleName}". Available: ${getModuleNames().join(', ')}` }],
        isError: true,
      }
    }
    return { content: [{ type: 'text', text: result }] }
  },
)

// --- Tool: getDoc ---
server.tool(
  'getDoc',
  'Get full documentation for a Dvala function, special expression, effect, shorthand, or datatype.',
  { name: z.string().describe('The name of the function or expression, e.g. "map", "if", "grid.transpose", "dvala.io.print"') },
  async ({ name }) => {
    const result = lookupDoc(name)
    if ('error' in result) {
      return { content: [{ type: 'text', text: result.error }], isError: true }
    }
    if ('ambiguous' in result) {
      return { content: [{ type: 'text', text: `Multiple matches for "${name}":\n${result.ambiguous.map(m => `  ${m}`).join('\n')}\n\nPlease be more specific.` }] }
    }
    return { content: [{ type: 'text', text: formatDoc(result.ref) }] }
  },
)

// --- Tool: runCode ---
server.tool(
  'runCode',
  'Execute Dvala code and return the result. The code runs in a sandboxed environment with all modules loaded.',
  {
    code: z.string().describe('Dvala source code to execute'),
    bindings: z.record(z.string(), z.unknown()).optional().describe('Optional variable bindings available in the code, e.g. {"x": 42}'),
  },
  async ({ code, bindings }) => {
    try {
      const result = dvala.run(code, bindings ? { bindings } : undefined)
      return { content: [{ type: 'text', text: stringifyValue(result, false) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  },
)

// --- Tool: runCodeDebug ---
server.tool(
  'runCodeDebug',
  'Execute Dvala code with debug mode enabled (captures source positions for better error messages).',
  {
    code: z.string().describe('Dvala source code to execute'),
    bindings: z.record(z.string(), z.unknown()).optional().describe('Optional variable bindings available in the code, e.g. {"x": 42}'),
  },
  async ({ code, bindings }) => {
    try {
      const result = dvalaDebug.run(code, bindings ? { bindings } : undefined)
      return { content: [{ type: 'text', text: stringifyValue(result, false) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  },
)

// --- Tool: tokenizeCode ---
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

// --- Tool: tokenizeCodeDebug ---
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

// --- Tool: parseCode ---
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

// --- Tool: parseCodeDebug ---
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

// --- Tool: parseTokenStream ---
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

// --- Tool: parseTokenStreamDebug ---
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

// --- Tool: getExamples ---
server.tool(
  'getExamples',
  'Get built-in example Dvala programs that demonstrate language features',
  {},
  async () => ({ content: [{ type: 'text', text: formatExamples() }] }),
)

// --- Tool: listDatatypes ---
server.tool(
  'listDatatypes',
  'List all Dvala datatypes with descriptions',
  {},
  async () => ({ content: [{ type: 'text', text: listDatatypes() }] }),
)

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(error => {
  // eslint-disable-next-line no-console
  console.error('MCP server error:', error)
  process.exit(1)
})
