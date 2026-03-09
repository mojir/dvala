import { examples } from '../../../reference/examples'
import { formatDvalaExpression } from '../formatter/rules'
import { copyIcon, lampIcon, playIcon } from '../icons'
import { styles } from '../styles'

function formatContextJson(context: Record<string, unknown>): string {
  const parts: string[] = ['{']
  const entries = Object.entries(context)
  entries.forEach(([key, value], i) => {
    const comma = i < entries.length - 1 ? ',' : ''
    if (Array.isArray(value)) {
      const items = value as Record<string, unknown>[]
      if (items.length === 0) {
        parts.push(`  ${JSON.stringify(key)}: []${comma}`)
      } else {
        parts.push(`  ${JSON.stringify(key)}: [`)
        items.forEach((item, j) => {
          const itemComma = j < items.length - 1 ? ',' : ''
          const itemEntries = Object.entries(item)
          parts.push('    {')
          itemEntries.forEach(([itemKey, itemValue], k) => {
            const fieldComma = k < itemEntries.length - 1 ? ',' : ''
            const val = typeof itemValue === 'string' ? JSON.stringify(itemValue).replace(/\\n/g, '\n').replace(/\\t/g, '\t') : JSON.stringify(itemValue)
            parts.push(`      ${JSON.stringify(itemKey)}: ${val}${fieldComma}`)
          })
          parts.push(`    }${itemComma}`)
        })
        parts.push(`  ]${comma}`)
      }
    } else {
      const record = value as Record<string, unknown>
      const subEntries = Object.entries(record)
      parts.push(`  ${JSON.stringify(key)}: {`)
      subEntries.forEach(([subKey, subValue], j) => {
        const subComma = j < subEntries.length - 1 ? ',' : ''
        const val = typeof subValue === 'string' ? JSON.stringify(subValue).replace(/\\n/g, '\n').replace(/\\t/g, '\t') : JSON.stringify(subValue)
        parts.push(`    ${JSON.stringify(subKey)}: ${val}${subComma}`)
      })
      parts.push(`  }${comma}`)
    }
  })
  parts.push('}')
  return parts.join('\n')
}

function getExamplesIndexPage(): string {
  const tocEntries = examples.map(example => {
    return `
      <a class="tutorial-nav-link" ${styles('cursor-pointer', 'py-1', 'flex', 'flex-row', 'items-start', 'gap-2')} onclick="Playground.showPage('example-${example.id}', 'smooth')">
        <span ${styles('text-xl', 'flex', 'items-center', 'line-height: 1.75rem;')}>${lampIcon}</span>
        <span ${styles('flex', 'flex-col')}>
          <span>${example.name}</span>
          <span ${styles('text-sm', 'text-color-gray-400')}>${example.description}</span>
        </span>
      </a>`
  }).join('\n')

  return `
  <div id="example-page" class="content">
    <div ${styles('mb-6', 'p-4', 'bg-gray-800', 'text-color-gray-300')}>
      <div ${styles('text-3xl', 'mb-6', 'text-center')}>Examples</div>
      <div ${styles('flex', 'flex-col', 'text-lg', 'gap-4')}>
        ${tocEntries}
      </div>
    </div>
  </div>
  `
}

function renderExamplePage(example: typeof examples[number], index: number): string {
  const prev = index > 0 ? examples[index - 1] : null
  const next = index < examples.length - 1 ? examples[index + 1] : null

  const backLink = `<a class="tutorial-nav-link" ${styles('cursor-pointer', 'text-sm')} onclick="Playground.showPage('example-page', 'smooth')">&larr; All Examples</a>`

  const header = `<div ${styles('relative', 'mb-6', 'border-0', 'border-b', 'border-solid', 'border-gray-600', 'pb-2')}><div ${styles('absolute', 'left-0', 'bottom-0', 'pb-2')}>${backLink}</div><div ${styles('text-3xl', 'text-center')}>${example.name}</div></div>`
  const description = `<p ${styles('mb-5', 'text-color-gray-400')}>${example.description}</p>`

  const encodedExample = btoa(encodeURIComponent(JSON.stringify(example)))
  const encodedCode = btoa(encodeURIComponent(example.code))
  const formattedCode = formatDvalaExpression(example.code)
  const playButton = `<div class="example-action-btn" ${styles('p-2', 'text-lg', 'cursor-pointer')} onclick="event.stopPropagation(); Playground.setPlayground('${example.name}', '${encodedExample}')">${playIcon}</div>`
  const copyButton = `<div class="example-action-btn" ${styles('p-2', 'text-lg', 'cursor-pointer')} onclick="event.stopPropagation(); Playground.copyExample('${encodedCode}')">${copyIcon}</div>`
  const actionBar = `<div class="example-action-bar" ${styles('absolute', 'top-0', 'right-0', 'flex-row', 'margin-top: 2px;')}>${playButton}${copyButton}</div>`
  const codeSection = `<div ${styles('py-3', 'px-4', 'text-sm', 'font-mono', 'whitespace-pre-wrap')}>${formattedCode}</div>`
  const codeBlock = `<div class="example-code" ${styles('relative', 'flex', 'flex-col', 'mb-5')} style="overflow-x: auto;">${actionBar}${codeSection}</div>`

  const contextBlock = example.context
    ? (() => {
      const contextJson = formatContextJson(example.context)
      const escaped = contextJson.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const chip = `<span ${styles('absolute', 'top-2', 'left-2', 'bg-gray-600', 'text-xs', 'font-mono', 'text-color-gray-400', 'select-none', 'px-2', 'py-0.5', 'border-radius: 4px;')}>JSON</span>`
      return `<div ${styles('text-sm', 'text-color-gray-400', 'mb-1')}>Context</div><div class="example-code" ${styles('relative', 'bg-gray-700', 'p-4', 'mb-5', 'overflow-x: auto;')}>${chip}<pre ${styles('text-sm', 'font-mono', 'whitespace-pre-wrap', 'margin-top: 1.75rem;')}>${escaped}</pre></div>`
    })()
    : ''

  const navFooter = `<div ${styles('flex', 'justify-between', 'py-2', 'mt-8', 'border-0', 'border-t', 'border-solid', 'border-gray-600', 'text-sm')}>${
    prev ? `<a class="tutorial-nav-link" ${styles('cursor-pointer')} onclick="Playground.showPage('example-${prev.id}', 'smooth')">&larr; ${prev.name}</a>` : '<span></span>'
  }${
    next ? `<a class="tutorial-nav-link" ${styles('cursor-pointer')} onclick="Playground.showPage('example-${next.id}', 'smooth')">${next.name} &rarr;</a>` : '<span></span>'
  }</div>`

  return `
  <div id="example-${example.id}" class="content">
    <div ${styles('mb-6', 'p-4', 'bg-gray-800', 'text-color-gray-300')}>
      ${header}
      ${description}
      ${codeBlock}
      ${contextBlock}
      ${navFooter}
    </div>
  </div>
  `
}

export function getExamplePage(): string {
  const indexPage = getExamplesIndexPage()
  const pages = examples.map((example, index) => renderExamplePage(example, index))
  return [indexPage, ...pages].join('\n')
}
