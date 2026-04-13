import type { ExampleEntry } from '../../../src/builtin/interface'

/**
 * Renders a single reference doc page for /ref/<linkName>.
 * Looks up the reference in window.referenceData.api or window.referenceData.modules.
 * Runs code examples live via runExampleCode utility.
 */

import { marked } from 'marked'
import type { ReferenceData } from '../../../common/referenceData'
import type { Reference } from '../../../reference'
import { isFunctionReference, isCustomReference, makeLinkName } from '../../../reference'
import { playgroundEffectReference } from '../playgroundEffects'
import { href } from '../router'
import { renderCodeBlock } from '../renderCodeBlock'
import { renderPageHeader } from './pageHeader'
import type { Breadcrumb } from './pageHeader'
import { getRefEntries, REF_SECTIONS, refActions } from './referencePage'

declare global {
  interface Window {
    referenceData?: ReferenceData
  }
}

export function renderDocPage(linkName: string): string {
  const data = window.referenceData
  if (!data) return '<div class="doc-page"><p>Reference data not available.</p></div>'

  let decodedLinkName: string
  try { decodedLinkName = decodeURIComponent(linkName) } catch { decodedLinkName = linkName }

  // Search in api first, then modules
  let ref: Reference | undefined
  let foundKey: string | undefined

  // api keys are the bare function names; linkName is category-title or bare key
  for (const [key, r] of Object.entries(data.api)) {
    const candidate = makeLinkName(r.category, key)
    if (candidate === linkName || key === decodedLinkName || `${r.category}-${key}` === decodedLinkName) {
      ref = r
      foundKey = key
      break
    }
  }

  if (!ref) {
    for (const [key, r] of Object.entries(data.modules)) {
      const candidate = makeLinkName(r.category, key)
      if (candidate === linkName || key === decodedLinkName || `${r.category}-${key}` === decodedLinkName) {
        ref = r
        foundKey = key
        break
      }
    }
  }

  if (!ref) {
    for (const [key, r] of Object.entries(data.effects)) {
      const candidate = makeLinkName(r.category, key)
      if (candidate === linkName || key === decodedLinkName || `${r.category}-${key}` === decodedLinkName) {
        ref = r
        foundKey = key
        break
      }
    }
  }

  if (!ref) {
    for (const [key, r] of Object.entries(playgroundEffectReference)) {
      const candidate = makeLinkName(r.category, key)
      if (candidate === linkName || key === decodedLinkName || `${r.category}-${key}` === decodedLinkName) {
        ref = r
        foundKey = key
        break
      }
    }
  }

  if (!ref || !foundKey) {
    return `<div class="book-page"><div class="book-page__content"><p class="doc-page__not-found">No documentation found for <code>${escapeHtml(decodedLinkName)}</code>.</p></div></div>`
  }

  // Find prev/next in the flat reference list
  const entries = getRefEntries(data)
  const idx = entries.findIndex(e => e.linkName === linkName)
  const entry = idx >= 0 ? entries[idx] : null
  const prev = idx > 0 ? entries[idx - 1] : null
  const next = idx < entries.length - 1 ? entries[idx + 1] : null

  // Build breadcrumbs: Reference > Section > [Module >] Title
  const breadcrumbs: Breadcrumb[] = [{ label: 'Reference', path: '/ref' }]
  if (entry) {
    const section = REF_SECTIONS.find(s => s.id === entry.section)
    if (section) {
      breadcrumbs.push({ label: section.title, path: `/ref/${section.id}` })
    }
    // For modules, add the module name as an extra level
    if (entry.section === 'modules') {
      breadcrumbs.push({ label: entry.group, path: `/ref/modules/${entry.group}` })
    }
  }
  breadcrumbs.push({ label: ref.title })

  const content = renderReference(foundKey, ref, data)

  return `
<div class="book-page">
  ${renderPageHeader({
    breadcrumbs,
    actions: refActions(),
    prev: prev ? { path: `/ref/${prev.linkName}`, title: prev.title } : { path: '/ref', title: 'Back to Reference' },
    up: { path: '/ref', title: 'Back to Reference' },
    next: next ? { path: `/ref/${next.linkName}`, title: next.title } : null,
  })}
  <div class="book-page__content">
    ${content}
  </div>
</div>`.trim()
}

function seeAlsoInfo(name: string, data: ReferenceData): { title: string; linkName: string } {
  const allEntries = [
    ...Object.entries(data.api),
    ...Object.entries(data.modules),
    ...Object.entries(data.effects),
    ...Object.entries(playgroundEffectReference),
  ]
  for (const [k, r] of allEntries) {
    if (k === name || r.title === name) {
      return { title: r.title, linkName: makeLinkName(r.category, k) }
    }
  }
  // Fallback: use name as-is with safe encoding
  return { title: name, linkName: encodeURIComponent(name).replace(/%2F/gi, '~') }
}

function renderReference(key: string, ref: Reference, data: ReferenceData): string {
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
          ${ref.seeAlso.map(name => { const { title, linkName: ln } = seeAlsoInfo(String(name), data); return `<a class="doc-page__see-also-link" href="${href(`/ref/${ln}`)}" onclick="event.preventDefault();Playground.navigate('/ref/${ln}')">${escapeHtml(title)}</a>` }).join(' ')}
        </div>
      </div>`
    : ''

  return `
<div class="doc-page">
  <div class="doc-page__category">${escapeHtml(ref.category)}</div>

  ${variants ? `<div class="doc-page__section">
    <div class="doc-page__section-title">Signature</div>
    <div class="doc-page__signature">${variants}</div>
  </div>` : ''}

  <div class="doc-page__section">
    <div class="doc-page__section-title">Description</div>
    <div class="doc-page__description">${descHtml}</div>
  </div>

  ${seeAlso}
  ${examples}
</div>`.trim()
}

function renderFunctionVariants(name: string, ref: ReturnType<typeof isFunctionReference> extends true ? never : Parameters<typeof isFunctionReference>[0]): string {
  if (!isFunctionReference(ref)) return ''
  const { args, variants } = ref

  const retType = Array.isArray(ref.returns.type)
    ? ref.returns.type.join(' | ')
    : String(ref.returns.type)

  const normalVariants = variants.map(v => {
    const params = v.argumentNames.map(argName => {
      const arg = args[argName]
      if (!arg) return argName
      const typeStr = Array.isArray(arg.type) ? arg.type.join(' | ') : String(arg.type)
      return `${argName}: ${typeStr}`
    }).join(', ')
    return `<code class="doc-page__signature-variant">${escapeHtml(name)}(${escapeHtml(params)}) → ${escapeHtml(retType)}</code>`
  }).join('\n')

  if (!ref._isOperator) return normalVariants

  const operatorForm = `<span class="doc-page__signature-label">Operator form</span>
<code class="doc-page__signature-variant">${escapeHtml(`a ${name} b`)} → ${escapeHtml(retType)}</code>`

  return `${normalVariants}\n${operatorForm}`
}

function renderCustomVariants(ref: Reference): string {
  if (!isCustomReference(ref)) return ''
  return ref.customVariants.map(v =>
    `<code class="doc-page__signature-variant">${escapeHtml(v)}</code>`,
  ).join('\n')
}

function renderExample(entry: ExampleEntry): string {
  const code = typeof entry === 'string' ? entry : entry.code
  const noRun = typeof entry !== 'string' && 'noRun' in entry && entry.noRun
  return renderCodeBlock({ code, noRun })
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
