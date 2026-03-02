/* eslint-disable no-console */

import { stringifyValue } from '../../../common/utils'
import type { Reference } from '../../../reference'
import { Dvala } from '../../../src/Dvala/Dvala'
import type { Colorizer } from '../colorizer'
import { getDvalaFormatter } from '../cliFormatterRules'

const dvala = new Dvala({ debug: false })

export function getCliFunctionExamples(fmt: Colorizer, reference: Reference) {
  const { examples } = reference
  return examples
    .map(example => example.trim())
    .map((example) => {
      const oldLog = console.log
      console.log = function () {}
      let result
      try {
        result = dvala.run(`(try (do ${example}) (catch e e))`)
        const stringifiedResult = stringifyValue(result, false)

        const formattedExample = getDvalaFormatter(fmt)(example)

        return `${formattedExample}
${fmt.gray(stringifiedResult)}`
      }
      finally {
        console.log = oldLog
      }
    })
    .join('\n\n')
}
