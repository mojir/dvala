import type { Reference } from '../../../reference'
import type { Colorizer } from '../colorizer'
import { stringifyValue } from '../../../common/utils'
import { createDvala } from '../../../src/createDvala'
import { getDvalaFormatter } from '../cliFormatterRules'

const dvala = createDvala({ debug: false })

export function getCliFunctionExamples(fmt: Colorizer, reference: Reference) {
  const { examples } = reference
  return examples
    .map(example => (typeof example === 'string' ? example : example.code).trim())
    .map(example => {
      // eslint-disable-next-line no-console
      const oldLog = console.log
      // eslint-disable-next-line no-console
      console.log = function () {}
      let result
      try {
        result = dvala.run(`(try (do ${example}) (catch e e))`)
        const stringifiedResult = stringifyValue(result, false)

        const formattedExample = getDvalaFormatter(fmt)(example)

        return `${formattedExample}
${fmt.gray(stringifiedResult)}`
      } finally {
        // eslint-disable-next-line no-console
        console.log = oldLog
      }
    })
    .join('\n\n')
}
