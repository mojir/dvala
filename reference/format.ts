/**
 * Plain-text formatting for Dvala reference documentation.
 *
 * Shared by the CLI subcommands and the MCP server so both produce
 * identical output from the same Reference objects.
 */

import type {
  CustomReference,
  DatatypeReference,
  EffectReference,
  FunctionReference,
  PreludeReference,
  Reference,
  ShorthandReference,
} from '.'
import type { ExampleEntry } from '../src/builtin/interface'
import {
  allReference,
  isCustomReference,
  isDatatypeReference,
  isEffectReference,
  isFunctionReference,
  isPreludeReference,
  isShorthandReference,
  moduleReference,
  normalExpressionReference,
} from '.'
import { specialExpressionTypes } from '../src/builtin/specialExpressionTypes'
import { examples } from './examples'

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

// ---------------------------------------------------------------------------
// Per-type formatters
// ---------------------------------------------------------------------------

function formatFunctionDoc(ref: FunctionReference): string {
  const lines: string[] = []

  lines.push(`# ${ref.title}`)
  lines.push(`Category: ${ref.category}`)
  lines.push('')

  lines.push(stripMarkdown(ref.description))
  lines.push('')

  // Signatures
  lines.push('## Signatures')
  for (const variant of ref.variants) {
    const argList = variant.argumentNames
      .map(name => {
        const arg = ref.args[name]
        return arg?.rest ? `...${name}` : name
      })
      .join(', ')
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
  appendExamples(lines, ref)

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

  appendExamples(lines, ref)

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
    const argList =
      variant.argumentNames.length > 0
        ? `, ${variant.argumentNames
            .map(name => {
              const arg = ref.args[name]
              return arg?.rest ? `...${name}` : name
            })
            .join(', ')}`
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

  appendExamples(lines, ref)

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
  appendExamples(lines, ref)
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
  appendExamples(lines, ref)
  return lines.join('\n')
}

function formatPreludeDoc(ref: PreludeReference): string {
  const lines: string[] = []
  lines.push(`# ${ref.title}`)
  lines.push('Category: prelude (refined type)')
  lines.push('')
  lines.push(`type ${ref.title} = ${ref.definition}`)
  lines.push('')
  lines.push(stripMarkdown(ref.description))
  lines.push('')
  appendExamples(lines, ref)
  if (ref.seeAlso && ref.seeAlso.length > 0) {
    lines.push('## See also')
    // The seeAlso entries use the internal `-prelude-*` keys (required
    // by the symmetry check in reference.test.ts). Render their titles
    // so users see "NonNegative, NonZero" rather than the raw keys.
    const titles = ref.seeAlso.map(sa => allReference[sa]?.title ?? sa)
    lines.push(titles.join(', '))
  }
  return lines.join('\n')
}

function appendExamples(lines: string[], ref: { examples: ExampleEntry[] }): void {
  if (ref.examples.length > 0) {
    lines.push('## Examples')
    for (const example of ref.examples) {
      lines.push('```dvala')
      lines.push((typeof example === 'string' ? example : (example as { code: string }).code).trim())
      lines.push('```')
      lines.push('')
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Format a Reference into plain-text documentation. */
export function formatDoc(ref: Reference): string {
  if (isFunctionReference(ref)) return formatFunctionDoc(ref)
  if (isCustomReference(ref)) return formatCustomDoc(ref)
  if (isEffectReference(ref)) return formatEffectDoc(ref)
  if (isShorthandReference(ref)) return formatShorthandDoc(ref)
  if (isDatatypeReference(ref)) return formatDatatypeDoc(ref)
  if (isPreludeReference(ref)) return formatPreludeDoc(ref)
  return `# ${(ref as Reference).title}\n\n${(ref as Reference).description}`
}

/**
 * Look up a reference by name.
 * Tries direct lookup, effect prefix, then fuzzy suffix matching.
 * Returns `{ ref }` on unique match, `{ ambiguous: [...] }` on multiple, or `{ error }` on none.
 */
export function lookupDoc(name: string): { ref: Reference } | { ambiguous: string[] } | { error: string } {
  // Direct lookup
  let ref = allReference[name]

  // Effect lookup (effects stored with "-effect-" prefix)
  if (!ref) {
    ref = allReference[`-effect-${name}`]
  }

  // Fuzzy: search for matching keys
  if (!ref) {
    const matches = Object.keys(allReference).filter(
      k => k === name || k.endsWith(`.${name}`) || allReference[k]!.title === name,
    )
    if (matches.length === 1) {
      ref = allReference[matches[0]!]
    } else if (matches.length > 1) {
      return { ambiguous: matches.map(m => `${allReference[m]!.title} (${allReference[m]!.category})`) }
    }
  }

  if (!ref) {
    return { error: `No documentation found for "${name}".` }
  }

  return { ref }
}

/** List all core functions and special expressions with short descriptions. */
export function listCoreExpressions(): string {
  const lines: string[] = []

  lines.push('## Special Expressions')
  for (const name of Object.keys(specialExpressionTypes).sort()) {
    const ref = allReference[name]
    const desc = ref
      ? ` - ${ref.description
          .split('\n')[0]
          ?.replace(/`(.+?)`/g, '$1')
          .slice(0, 80)}`
      : ''
    lines.push(`  ${name}${desc}`)
  }

  lines.push('')
  lines.push('## Core Functions')
  for (const [name, ref] of Object.entries(normalExpressionReference)) {
    const desc =
      ref.description
        .split('\n')[0]
        ?.replace(/`(.+?)`/g, '$1')
        .slice(0, 80) ?? ''
    lines.push(`  ${name} - ${desc}`)
  }

  return lines.join('\n')
}

/** Get the list of module names with function counts. */
export function listModules(): string {
  const moduleNames = Array.from(new Set(Object.keys(moduleReference).map(k => k.split('.')[0]!)))
  const lines = moduleNames.map(name => {
    const count = Object.keys(moduleReference).filter(k => k.startsWith(`${name}.`)).length
    return `  ${name} (${count} functions)`
  })
  return lines.join('\n')
}

/** List all functions in a specific module. Returns null if the module is unknown. */
export function listModuleExpressions(moduleName: string): string | null {
  const fns = Object.keys(moduleReference).filter(k => k.startsWith(`${moduleName}.`))
  if (fns.length === 0) return null

  const lines = fns.map(name => {
    const ref = moduleReference[name as keyof typeof moduleReference]
    const desc =
      ref?.description
        .split('\n')[0]
        ?.replace(/`(.+?)`/g, '$1')
        .slice(0, 80) ?? ''
    return `  ${name} - ${desc}`
  })
  return lines.join('\n')
}

/**
 * List all datatypes and prelude refined-type aliases with descriptions.
 * Prelude aliases follow under their own heading so users can tell raw
 * datatypes from refinement-bearing aliases at a glance.
 */
export function listDatatypes(): string {
  const lines: string[] = []
  const preludeRefs: PreludeReference[] = []
  for (const [, ref] of Object.entries(allReference)) {
    if (isDatatypeReference(ref)) {
      const desc = ref.description.replace(/`(.+?)`/g, '$1')
      lines.push(`  ${ref.title} - ${desc}`)
    } else if (isPreludeReference(ref)) {
      preludeRefs.push(ref)
    }
  }
  if (preludeRefs.length > 0) {
    lines.push('')
    lines.push('## Prelude refined types')
    for (const ref of preludeRefs) {
      const desc = ref.description.replace(/`(.+?)`/g, '$1')
      lines.push(`  ${ref.title} = ${ref.definition} - ${desc}`)
    }
  }
  return lines.join('\n')
}

/** Format all example programs. */
export function formatExamples(): string {
  const lines = examples.map(ex => `## ${ex.name}\n${ex.description}\n\`\`\`dvala\n${ex.code}\n\`\`\`\n`)
  return lines.join('\n')
}

/** Get the list of known module names. */
export function getModuleNames(): string[] {
  return Array.from(new Set(Object.keys(moduleReference).map(k => k.split('.')[0]!)))
}
