/**
 * Renders a single reference doc page for /ref/<linkName>.
 * Looks up the reference in window.referenceData.api or window.referenceData.modules.
 * Runs code examples live via createDvala().
 */

import { marked } from 'marked'
import { createDvala } from '../../../src/createDvala'
import { allBuiltinModules } from '../../../src/allModules'
import type { ReferenceData } from '../../../common/referenceData'
import type { Reference } from '../../../reference'
import { isFunctionReference, isCustomReference } from '../../../reference'
import { href } from '../router'

declare global {
  interface Window {
    referenceData?: ReferenceData
  }
}

const dvala = createDvala({ modules: allBuiltinModules })

export function renderDocPage(linkName: string): string {
  const data = window.referenceData
  if (!data) return '<div class="doc-page"><p>Reference data not available.</p></div>'

  const decodedLinkName = decodeURIComponent(linkName)

  // Search in api first, then modules
  let ref: Reference | undefined
  let foundKey: string | undefined

  // api keys are the bare function names; linkName is category-title
  for (const [key, r] of Object.entries(data.api)) {
    const candidate = encodeURIComponent(`${r.category}-${key}`)
    if (candidate === linkName || `${r.category}-${key}` === decodedLinkName) {
      ref = r
      foundKey = key
      break
    }
  }

  if (!ref) {
    for (const [key, r] of Object.entries(data.modules)) {
      const candidate = encodeURIComponent(`${r.category}-${key}`)
      if (candidate === linkName || key === decodedLinkName || `${r.category}-${key}` === decodedLinkName) {
        ref = r
        foundKey = key
        break
      }
    }
  }

  if (!ref || !foundKey) {
    return `<div class="doc-page"><p class="doc-page__not-found">No documentation found for <code>${escapeHtml(decodedLinkName)}</code>.</p></div>`
  }

  return renderReference(foundKey, ref)
}

function renderReference(key: string, ref: Reference): string {
  const descHtml = marked.parse(ref.description) as string

  const variants = isFunctionReference(ref)
    ? renderFunctionVariants(key, ref)
    : isCustomReference(ref)
      ? renderCustomVariants(ref)
      : ''

  const examples = ref.examples.length > 0
    ? `<div class="doc-page__section">
        <div class="doc-page__section-title">Examples</div>
        ${ref.examples.map(ex => renderExample(ex)).join('\n')}
      </div>`
    : ''

  const seeAlso = ref.seeAlso && ref.seeAlso.length > 0
    ? `<div class="doc-page__section">
        <div class="doc-page__section-title">See Also</div>
        <div class="doc-page__see-also">
          ${ref.seeAlso.map(name => `<a class="doc-page__see-also-link" href="${href(`/ref/${name}`)}">${escapeHtml(String(name))}</a>`).join(' ')}
        </div>
      </div>`
    : ''

  return `
<div class="doc-page">
  <h1 class="doc-page__title">${escapeHtml(ref.title)}</h1>
  <div class="doc-page__category">${escapeHtml(ref.category)}</div>

  ${variants ? `<div class="doc-page__section">
    <div class="doc-page__section-title">Signature</div>
    <div class="doc-page__signature">${variants}</div>
  </div>` : ''}

  <div class="doc-page__section">
    <div class="doc-page__section-title">Description</div>
    <div class="doc-page__description">${descHtml}</div>
  </div>

  ${examples}
  ${seeAlso}
</div>`.trim()
}

function renderFunctionVariants(name: string, ref: ReturnType<typeof isFunctionReference> extends true ? never : Parameters<typeof isFunctionReference>[0]): string {
  if (!isFunctionReference(ref)) return ''
  const { args, variants } = ref
  const argNames = Object.keys(args)

  return variants.map(v => {
    const params = v.argumentNames.map(argName => {
      const arg = args[argName]
      if (!arg) return argName
      const typeStr = Array.isArray(arg.type) ? arg.type.join(' | ') : String(arg.type)
      return `${argName}: ${typeStr}`
    }).join(', ')

    const retType = Array.isArray(ref.returns.type)
      ? ref.returns.type.join(' | ')
      : String(ref.returns.type)

    void argNames // suppress unused var warning
    return `<code class="doc-page__signature-variant">${escapeHtml(name)}(${escapeHtml(params)}) → ${escapeHtml(retType)}</code>`
  }).join('\n')
}

function renderCustomVariants(ref: Reference): string {
  if (!isCustomReference(ref)) return ''
  return ref.customVariants.map(v =>
    `<code class="doc-page__signature-variant">${escapeHtml(v)}</code>`,
  ).join('\n')
}

function renderExample(code: string): string {
  const output = runExample(code)
  const outputHtml = output !== null
    ? `<div class="doc-page__example-output">${escapeHtml(output)}</div>`
    : ''

  return `
<div class="doc-page__example">
  <pre class="doc-page__example-code"><code>${escapeHtml(code)}</code></pre>
  ${outputHtml}
</div>`
}

function runExample(code: string): string | null {
  try {
    const value = dvala.run(code)
    return formatValue(value)
  } catch (e) {
    return `Error: ${String(e instanceof Error ? e.message : e)}`
  }
}

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
