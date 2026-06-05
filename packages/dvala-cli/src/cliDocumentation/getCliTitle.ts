import type { Reference } from '@mojir/dvala-core-tooling/reference'
import type { Colorizer } from '../colorizer'

export function getCliTitle(fmt: Colorizer, reference: Reference) {
  return `${fmt.bright.blue(reference.title)} - ${fmt.gray(reference.category)}`
}
