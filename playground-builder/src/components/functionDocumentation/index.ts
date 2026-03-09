import { allReference, getLinkName, isCustomReference, isEffectReference, isFunctionReference } from '../../../../reference'
import type { CustomReference, EffectReference, FunctionReference, Reference } from '../../../../reference'
import { styles } from '../../styles'
import { formatDvalaExpression } from '../../formatter/rules'
import { formatDescription } from './description'
import { getFunctionExamples } from './functionExamples'
import { getArgumentInfo } from './argumentInfo'
import { getSection } from './section'
import { getFunctionSignature } from './functionSignature'
import { getCustomSignature } from './customSignature'
import { getType } from './getType'

export async function getAllDocumentationItems() {
  const items = await Promise.all(
    Object.values(allReference)
      .map(obj => getDocumentation(obj)),
  )
  return items.join('\n')
}

async function getDocumentation(reference: Reference) {
  const docTitle = escapeTitle(reference.title)

  // Get all references for seeAlso (including module references)
  const functionReferences = reference.seeAlso
    ?.map(apiName => allReference[apiName])
    .filter((ref): ref is Reference => ref !== undefined)

  return `
  <div id="${getLinkName(reference)}" class="content function">
    <div ${styles('flex', 'justify-between', 'items-baseline', 'mb-6', 'border-0', 'border-b', 'border-solid', 'border-gray-600', 'pb-4')}>
      <span></span>
      <div ${styles('text-3xl', 'text-color-gray-200', 'font-mono')}><a ${styles('no-underline')} onclick="Playground.showPage('${getLinkName(reference)}', 'smooth')">${docTitle}</a></div>
      <div ${styles('text-sm', 'text-color-gray-400')}>${reference.category}</div>
    </div>

    ${isFunctionReference(reference)
      ? getSignature(reference)
      : isCustomReference(reference)
        ? getCustomSignatureSection(reference)
        : isEffectReference(reference)
          ? getEffectSignatureSection(reference)
          : `<div ${styles('mb-4')}></div>`}

    ${getSection('Description', formatDescription(reference.description, reference), 'text-base')}

    ${isFunctionReference(reference) ? getSection('Arguments', getArgumentInfo(reference)) : ''}
    ${isEffectReference(reference) && Object.keys(reference.args).length > 0 ? getSection('Arguments', getEffectArgumentInfo(reference)) : ''}
    ${isCustomReference(reference) && reference.details ? getSection('Details', getDetailsTable(reference.details)) : ''}

    ${functionReferences
      ? getSection(
        'See also',
        getSeeAlsoLinks(functionReferences),
        'text-base',
        'text-color-gray-400',
      )
      : ''}

    ${getSection('Examples', await getFunctionExamples(reference))}

  </div>`
}

export function getDetailsTable(content: [string, string, string | undefined][]): string {
  return `<table>
    ${content.map(row => `
    <tr>
      <td ${styles('text-color-Rose')}>${row[0]}</td>
      <td ${styles('pl-8')}>${formatDvalaExpression(row[1])}</td>
      ${row[2] ? `<td ${styles('pl-4', 'italic', 'text-base')}>${formatDescription(row[2])}</td>` : ''}
    </tr>`,
    ).join('')}
  </table>`
}

function getSignature(reference: FunctionReference) {
  return `<div ${styles('mb-6', 'mt-4', 'font-mono', 'text-base')}>
    ${getFunctionSignature(reference)}
  </div>`
}

function getCustomSignatureSection(reference: CustomReference) {
  return `<div ${styles('mb-6', 'mt-4', 'font-mono', 'text-base')}>
    ${getCustomSignature(reference.customVariants)}
  </div>`
}

function getEffectSignatureSection(reference: EffectReference) {
  return `<div ${styles('mb-6', 'mt-4', 'font-mono', 'text-base')}>
    ${getEffectSignature(reference)}
  </div>`
}

function getEffectSignature(reference: EffectReference) {
  return `<table>
  ${reference.variants.map(variant => {
    const argsStr = variant.argumentNames.length > 0
      ? `, ${variant.argumentNames.map(argName => {
        let result = ''
        const arg = reference.args[argName]
        if (arg?.rest)
          result += '...'
        result += argName
        return result
      }).join(', ')}`
      : ''

    const expression = `perform(effect(${reference.title})${argsStr})`
    return `
      <tr>
        <td>${formatDvalaExpression(expression)}</td>
        <td><span ${styles('text-color-gray-400', 'mx-4', 'text-xl', 'line-height: 1rem;')}>&rarr;</span></td>
        <td><span>${reference.returns.type}</span></td>
      </tr>`
  }).join('')}
  </table>`
}

function getEffectArgumentInfo(reference: EffectReference) {
  return `<table ${styles('text-sm')}>
  ${Object.entries(reference.args).map(([argName, arg]) => {
    return `<tr>
              <td>${formatDvalaExpression(argName)}</td>
              <td ${styles('pl-4', 'whitespace-nowrap')}>${getType(arg)}</td>
              ${arg.description ? `<td ${styles('pl-4', 'italic', 'text-base')}>${formatDescription(arg.description)}</td>` : ''}
            </tr>`
  }).join(' ')}
  </table>`
}

function getSeeAlsoLinks(references: Reference[]) {
  return `<div ${styles('flex', 'flex-row', 'flex-wrap', 'gap-2')}>
    ${references.map(reference => {
      return `<a ${styles('whitespace-nowrap')} onclick="Playground.showPage('${getLinkName(reference)}', 'smooth')"><span>${escapeTitle(reference.title)}</span></a>`
    }).join('')}
  </div>`
}

function escapeTitle(title: string) {
  return title.replace(/"/g, '&quot;')
}
