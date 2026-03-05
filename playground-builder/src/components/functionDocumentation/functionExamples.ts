import type { Reference } from '../../../../reference'
import { renderExample } from '../../renderExample'

export async function getFunctionExamples(reference: Reference) {
  const { examples, title: name } = reference
  const rendered = await Promise.all(
    examples
      .map(example => example.trim())
      .map(example => renderExample(example, name)),
  )
  return rendered.join('\n')
}
