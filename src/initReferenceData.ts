import { effectReference, normalExpressionReference } from '../reference/index'
import { setEffectReference, setNormalExpressionReference } from './builtin/normalExpressions'

export function initReferenceData(): void {
  setNormalExpressionReference(normalExpressionReference)
  setEffectReference(effectReference)
}
