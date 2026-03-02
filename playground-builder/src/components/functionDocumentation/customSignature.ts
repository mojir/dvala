import type { CustomReference } from '../../../../reference'
import { formatDvalaExpression } from '../../formatter/rules'

export function getCustomSignature(customVariants: CustomReference['customVariants']) {
  return `<table>
  ${customVariants.map(variant => `
    <tr>
      <td>${formatDvalaExpression(variant)}</td>
    </tr>`,
  ).join('')}
  </table>`
}
