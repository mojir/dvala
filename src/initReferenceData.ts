import { effectReference, normalExpressionReference } from '../reference/index'
import { setEffectReference, setNormalExpressionReference } from '@mojir/dvala-engine'

export function initReferenceData(): void {
  setNormalExpressionReference(normalExpressionReference)
  setEffectReference(effectReference)
}
