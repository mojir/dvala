import process from 'node:process'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { version } from '../../package.json'
import { createDvala } from '../../src/createDvala'
import { allBuiltinModules } from '../../src/allModules'
import '../../src/initReferenceData'
import { stringifyValue } from '../../common/utils'
import { parseTokenStream, tokenizeSource } from '../../src/tooling'
import {
  type CustomReference,
  type DatatypeReference,
  type EffectReference,
  type FunctionReference,
  type Reference,
  type ShorthandReference,
  allReference,
  isCustomReference,
  isDatatypeReference,
  isEffectReference,
  isFunctionReference,
  isShorthandReference,
  moduleReference,
  normalExpressionReference,
} from '../../reference'
import { specialExpressionTypes } from '../../src/builtin/specialExpressionTypes'
import { examples } from '../../reference/examples'

const dvala = createDvala({ modules: allBuiltinModules, debug: false })
const dvalaDebug = createDvala({ modules: allBuiltinModules, debug: true })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeToString(typed: { type: string | string[]; rest?: boolean; array?: boolean }): string {
  const types = Array.isArray(typed.type) ? typed.type : [typed.type]
  const typeStr = types.join(' | ')
  return typed.array || typed.rest ? `${typeStr}[]` : typeStr
}

function stripMarkdown(text: string): string {
  return text
    .replace(/`(.+?)`/g, '$1')
    .replace(/\$(\w+)/g, '$1')
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
}

function formatFunctionDoc(ref: FunctionReference): string {
  const lines: string[] = []

  lines.push(`# ${ref.title}`)
  lines.push(`Category: ${ref.category}`)
  lines.push('')

  // Description (strip markdown-ish formatting for plain text)
  lines.push(stripMarkdown(ref.description))
  lines.push('')

  // Signatures
  lines.push('## Signatures')
  for (const variant of ref.variants) {
    const argList = variant.argumentNames.map(name => {
      const arg = ref.args[name]
      return arg?.rest ? `...${name}` : name
    }).join(', ')
    lines.push(`  ${ref.title}(${argList}) -> ${typeToString(ref.returns)}`)
  }
  if (ref._isOperator) {
    lines.push('')
    lines.push('Operator form:')
    lines.push(`  a ${ref.title} b -> ${typeToString(ref.returns)}`)
  }
  lines.push('')

  // Arguments
  if (Object.keys(ref.args).length > 0) {
    lines.push('## Arguments')
    for (const [name, arg] of Object.entries(ref.args)) {
      const desc = arg.description ? ` - ${arg.description}` : ''
      lines.push(`  ${name}: ${typeToString(arg)}${desc}`)
    }
    lines.push('')
  }

  // Examples
  if (ref.examples.length > 0) {
    lines.push('## Examples')
    for (const example of ref.examples) {
      lines.push('```dvala')
      lines.push((typeof example === 'string' ? example : example.code).trim())
      lines.push('```')
      lines.push('')
    }
  }

  // See also
  if (ref.seeAlso && ref.seeAlso.length > 0) {
    lines.push('## See also')
    lines.push(ref.seeAlso.join(', '))
  }

  return lines.join('\n')
}

function formatCustomDoc(ref: CustomReference): string {
  const lines: string[] = []

  lines.push(`# ${ref.title}`)
  lines.push(`Category: ${ref.category}`)
  lines.push('')

  lines.push(stripMarkdown(ref.description))
  lines.push('')

  // Custom variants (syntax forms)
  lines.push('## Syntax')
  for (const variant of ref.customVariants) {
    lines.push(`  ${variant}`)
  }
  lines.push('')

  // Details
  if ('details' in ref && ref.details) {
    lines.push('## Details')
    for (const [label, detail, extra] of ref.details) {
      lines.push(`  ${label}: ${detail}${extra ? ` (${extra})` : ''}`)
    }
    lines.push('')
  }

  // Examples
  if (ref.examples.length > 0) {
    lines.push('## Examples')
    for (const example of ref.examples) {
      lines.push('```dvala')
      lines.push((typeof example === 'string' ? example : example.code).trim())
      lines.push('```')
      lines.push('')
    }
  }

  if (ref.seeAlso && ref.seeAlso.length > 0) {
    lines.push('## See also')
    lines.push(ref.seeAlso.join(', '))
  }

  return lines.join('\n')
}

function formatEffectDoc(ref: EffectReference): string {
  const lines: string[] = []

  lines.push(`# ${ref.title}`)
  lines.push('Category: effect')
  lines.push('')

  lines.push(stripMarkdown(ref.description))
  lines.push('')

  lines.push('## Signatures')
  for (const variant of ref.variants) {
    const argList = variant.argumentNames.length > 0
      ? `, ${variant.argumentNames.map(name => {
        const arg = ref.args[name]
        return arg?.rest ? `...${name}` : name
      }).join(', ')}`
      : ''
    lines.push(`  perform(@${ref.title}${argList}) -> ${typeToString(ref.returns)}`)
  }
  lines.push('')

  if (Object.keys(ref.args).length > 0) {
    lines.push('## Arguments')
    for (const [name, arg] of Object.entries(ref.args)) {
      const argDesc = arg.description ? ` - ${arg.description}` : ''
      lines.push(`  ${name}: ${typeToString(arg)}${argDesc}`)
    }
    lines.push('')
  }

  if (ref.examples.length > 0) {
    lines.push('## Examples')
    for (const example of ref.examples) {
      lines.push('```dvala')
      lines.push((typeof example === 'string' ? example : example.code).trim())
      lines.push('```')
      lines.push('')
    }
  }

  if (ref.seeAlso && ref.seeAlso.length > 0) {
    lines.push('## See also')
    lines.push(ref.seeAlso.join(', '))
  }

  return lines.join('\n')
}

function formatShorthandDoc(ref: ShorthandReference): string {
  const lines: string[] = []
  lines.push(`# ${ref.title}`)
  lines.push('Category: shorthand')
  lines.push('')
  lines.push(ref.description.replace(/`(.+?)`/g, '$1'))
  lines.push('')
  if (ref.examples.length > 0) {
    lines.push('## Examples')
    for (const example of ref.examples) {
      lines.push('```dvala')
      lines.push((typeof example === 'string' ? example : example.code).trim())
      lines.push('```')
      lines.push('')
    }
  }
  if (ref.seeAlso && ref.seeAlso.length > 0) {
    lines.push('## See also')
    lines.push(ref.seeAlso.join(', '))
  }
  return lines.join('\n')
}

function formatDatatypeDoc(ref: DatatypeReference): string {
  const lines: string[] = []
  lines.push(`# ${ref.title}`)
  lines.push('Category: datatype')
  lines.push('')
  lines.push(ref.description.replace(/`(.+?)`/g, '$1'))
  lines.push('')
  if (ref.examples.length > 0) {
    lines.push('## Examples')
    for (const example of ref.examples) {
      lines.push('```dvala')
      lines.push((typeof example === 'string' ? example : example.code).trim())
      lines.push('```')
      lines.push('')
    }
  }
  return lines.join('\n')
}

function formatDoc(ref: Reference): string {
  if (isFunctionReference(ref))
    return formatFunctionDoc(ref)
  if (isCustomReference(ref))
    return formatCustomDoc(ref)
  if (isEffectReference(ref))
    return formatEffectDoc(ref)
  if (isShorthandReference(ref))
    return formatShorthandDoc(ref)
  if (isDatatypeReference(ref))
    return formatDatatypeDoc(ref)
  return `# ${(ref as Reference).title}\n\n${(ref as Reference).description}`
}

// ---------------------------------------------------------------------------
// Module list helper
// ---------------------------------------------------------------------------

const moduleNames = Array.from(new Set(allBuiltinModules.map(m => m.name)))

function getModuleFunctions(moduleName: string): string[] {
  return Object.keys(moduleReference).filter(k => k.startsWith(`${moduleName}.`))
}

// ---------------------------------------------------------------------------
// MCP Server
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
  async () => {
    const lines: string[] = []

    lines.push('## Special Expressions')
    for (const name of Object.keys(specialExpressionTypes).sort()) {
      const ref = allReference[name]
      const desc = ref ? ` - ${ref.description.split('\n')[0]?.replace(/`(.+?)`/g, '$1').slice(0, 80)}` : ''
      lines.push(`  ${name}${desc}`)
    }

    lines.push('')
    lines.push('## Core Functions')
    for (const [name, ref] of Object.entries(normalExpressionReference)) {
      const desc = ref.description.split('\n')[0]?.replace(/`(.+?)`/g, '$1').slice(0, 80) ?? ''
      lines.push(`  ${name} - ${desc}`)
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  },
)

// --- Tool: listModules ---
server.tool(
  'listModules',
  'List all available Dvala modules',
  {},
  async () => {
    const lines = moduleNames.map(name => {
      const count = getModuleFunctions(name).length
      return `  ${name} (${count} functions)`
    })
    return { content: [{ type: 'text', text: lines.join('\n') }] }
  },
)

// --- Tool: listModuleExpressions ---
server.tool(
  'listModuleExpressions',
  'List all functions in a specific Dvala module',
  { moduleName: z.string().describe('The module name, e.g. "grid", "vector", "matrix"') },
  async ({ moduleName }) => {
    if (!moduleNames.includes(moduleName)) {
      return {
        content: [{ type: 'text', text: `Unknown module "${moduleName}". Available: ${moduleNames.join(', ')}` }],
        isError: true,
      }
    }

    const fns = getModuleFunctions(moduleName)
    const lines = fns.map(name => {
      const ref = moduleReference[name as keyof typeof moduleReference]
      const desc = ref?.description.split('\n')[0]?.replace(/`(.+?)`/g, '$1').slice(0, 80) ?? ''
      return `  ${name} - ${desc}`
    })

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  },
)

// --- Tool: getDoc ---
server.tool(
  'getDoc',
  'Get full documentation for a Dvala function, special expression, effect, shorthand, or datatype. Returns description, signatures, arguments, examples, and see-also references.',
  { name: z.string().describe('The name of the function or expression, e.g. "map", "if", "grid.transpose", "dvala.io.print"') },
  async ({ name }) => {
    // Try direct lookup
    let ref = allReference[name]

    // Try effect lookup (effects are stored with "-effect-" prefix)
    if (!ref) {
      ref = allReference[`-effect-${name}`]
    }

    // Try fuzzy: search for matching keys
    if (!ref) {
      const matches = Object.keys(allReference).filter(k =>
        k === name || k.endsWith(`.${name}`) || allReference[k]!.title === name,
      )
      if (matches.length === 1) {
        ref = allReference[matches[0]!]
      } else if (matches.length > 1) {
        return {
          content: [{
            type: 'text',
            text: `Multiple matches for "${name}":\n${matches.map(m => `  ${allReference[m]!.title} (${allReference[m]!.category})`).join('\n')}\n\nPlease be more specific.`,
          }],
        }
      }
    }

    if (!ref) {
      return {
        content: [{ type: 'text', text: `No documentation found for "${name}".` }],
        isError: true,
      }
    }

    return { content: [{ type: 'text', text: formatDoc(ref) }] }
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
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      }
    }
  },
)

// --- Tool: runCodeDebug ---
server.tool(
  'runCodeDebug',
  'Execute Dvala code with debug mode enabled (captures source positions for better error messages). Otherwise identical to runCode.',
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
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      }
    }
  },
)

// --- Tool: tokenizeCode ---
server.tool(
  'tokenizeCode',
  'Tokenize Dvala source code into a token stream (JSON). Returns the raw token array without debug source positions.',
  {
    code: z.string().describe('Dvala source code to tokenize'),
  },
  async ({ code }) => {
    try {
      const tokenStream = tokenizeSource(code, false)
      return { content: [{ type: 'text', text: JSON.stringify(tokenStream, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      }
    }
  },
)

// --- Tool: tokenizeCodeDebug ---
server.tool(
  'tokenizeCodeDebug',
  'Tokenize Dvala source code with debug mode enabled (captures source positions). Returns the token stream as JSON.',
  {
    code: z.string().describe('Dvala source code to tokenize'),
  },
  async ({ code }) => {
    try {
      const tokenStream = tokenizeSource(code, true)
      return { content: [{ type: 'text', text: JSON.stringify(tokenStream, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      }
    }
  },
)

// --- Tool: parseCode ---
server.tool(
  'parseCode',
  'Parse Dvala source code into an AST (tokenize + parse in one step). Returns the AST as JSON.',
  {
    code: z.string().describe('Dvala source code to parse'),
  },
  async ({ code }) => {
    try {
      const tokenStream = tokenizeSource(code, false)
      const ast = parseTokenStream(tokenStream)
      return { content: [{ type: 'text', text: JSON.stringify(ast, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      }
    }
  },
)

// --- Tool: parseCodeDebug ---
server.tool(
  'parseCodeDebug',
  'Parse Dvala source code into an AST with debug mode enabled (source positions in tokens). Returns the AST as JSON.',
  {
    code: z.string().describe('Dvala source code to parse'),
  },
  async ({ code }) => {
    try {
      const tokenStream = tokenizeSource(code, true)
      const ast = parseTokenStream(tokenStream)
      return { content: [{ type: 'text', text: JSON.stringify(ast, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      }
    }
  },
)

// --- Tool: parseTokenStream ---
server.tool(
  'parseTokenStream',
  'Parse a previously tokenized token stream (JSON) into an AST. Use with the output of tokenizeCode.',
  {
    tokenStream: z.string().describe('Token stream as JSON string (output of tokenizeCode or tokenizeCodeDebug)'),
  },
  async ({ tokenStream: tokenStreamJson }) => {
    try {
      const tokenStream = JSON.parse(tokenStreamJson)
      const ast = parseTokenStream(tokenStream)
      return { content: [{ type: 'text', text: JSON.stringify(ast, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      }
    }
  },
)

// --- Tool: parseTokenStreamDebug ---
server.tool(
  'parseTokenStreamDebug',
  'Parse a previously tokenized debug token stream (JSON) into an AST. Use with the output of tokenizeCodeDebug.',
  {
    tokenStream: z.string().describe('Debug token stream as JSON string (output of tokenizeCodeDebug)'),
  },
  async ({ tokenStream: tokenStreamJson }) => {
    try {
      const tokenStream = JSON.parse(tokenStreamJson)
      const ast = parseTokenStream(tokenStream)
      return { content: [{ type: 'text', text: JSON.stringify(ast, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      }
    }
  },
)

// --- Tool: getExamples ---
server.tool(
  'getExamples',
  'Get built-in example Dvala programs that demonstrate language features',
  {},
  async () => {
    const lines = examples.map(ex =>
      `## ${ex.name}\n${ex.description}\n\`\`\`dvala\n${ex.code}\n\`\`\`\n`,
    )
    return { content: [{ type: 'text', text: lines.join('\n') }] }
  },
)

// --- Tool: listDatatypes ---
server.tool(
  'listDatatypes',
  'List all Dvala datatypes with descriptions',
  {},
  async () => {
    const lines: string[] = []
    for (const [, ref] of Object.entries(allReference)) {
      if (isDatatypeReference(ref)) {
        const desc = ref.description.replace(/`(.+?)`/g, '$1')
        lines.push(`  ${ref.title} - ${desc}`)
      }
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] }
  },
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
