import type { BuiltinNormalExpressions } from '../interface'
import type { EffectReference, FunctionReference } from '../../../reference'
import type { CoreNormalExpressionName } from '../../../reference/api'

// Core categories - always available
import { assertionNormalExpression } from '../core/assertion'
import { bitwiseNormalExpression } from '../core/bitwise'
import { collectionNormalExpression } from '../core/collection'
import { arrayNormalExpression } from '../core/array'
import { sequenceNormalExpression } from '../core/sequence'
import { mathNormalExpression } from '../core/math'
import { miscNormalExpression } from '../core/misc'
import { objectNormalExpression } from '../core/object'
import { predicatesNormalExpression } from '../core/predicates'
import { regexpNormalExpression } from '../core/regexp'
import { stringNormalExpression } from '../core/string'
import { functionalNormalExpression } from '../core/functional'
import { getMetaNormalExpression } from '../core/meta'

const normalExpressionReference: Record<string, FunctionReference> = {}
const effectReference: Record<string, EffectReference> = {}

export function setNormalExpressionReference(reference: Record<CoreNormalExpressionName, FunctionReference>) {
  Object.assign(normalExpressionReference, reference)
}

export function setEffectReference(reference: Record<string, EffectReference>) {
  Object.assign(effectReference, reference)
}

const expressions: BuiltinNormalExpressions = {
  // Core categories
  ...assertionNormalExpression,
  ...bitwiseNormalExpression,
  ...collectionNormalExpression,
  ...arrayNormalExpression,
  ...sequenceNormalExpression,
  ...mathNormalExpression,
  ...getMetaNormalExpression(normalExpressionReference, effectReference),
  ...miscNormalExpression,
  ...objectNormalExpression,
  ...predicatesNormalExpression,
  ...regexpNormalExpression,
  ...stringNormalExpression,
  ...functionalNormalExpression,
}

Object.entries(expressions).forEach(([name, expression]) => {
  expression.name = name
})

export const normalExpressions: BuiltinNormalExpressions = {
  ...expressions,
}

export const normalExpressionTypes = new Set<string>(Object.keys(normalExpressions))
