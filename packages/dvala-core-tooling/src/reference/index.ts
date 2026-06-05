import type { SpecialExpressionName } from '@mojir/dvala-types'
import type { BuiltinNormalExpressions, FunctionDocs, SpecialExpressionDocs } from '@mojir/dvala-engine'
import type { DvalaModule } from '@mojir/dvala-engine'
import type { CustomReference, EffectReference, FunctionReference, Reference } from '@mojir/dvala-engine'
import { isFunctionReference } from '@mojir/dvala-engine'
import type {
  ArrayApiName,
  AssertionApiName,
  BitwiseApiName,
  CollectionApiName,
  CoreApiName,
  CoreNormalExpressionName,
  FunctionalApiName,
  MathApiName,
  MetaApiName,
  MiscApiName,
  ModuleExpressionName,
  ObjectApiName,
  PredicateApiName,
  RegularExpressionApiName,
  SequenceApiName,
  StringApiName,
} from './api'
import { specialExpressions } from '@mojir/dvala-engine'
import { arrayNormalExpression } from '@mojir/dvala-engine'
// Core categories — all derive reference from co-located docs
import { assertionNormalExpression } from '@mojir/dvala-engine'
import { bitwiseNormalExpression } from '@mojir/dvala-engine'
import { collectionNormalExpression } from '@mojir/dvala-engine'

import { functionalNormalExpression } from '@mojir/dvala-engine'
import { mathNormalExpression } from '@mojir/dvala-engine'
import { getMetaNormalExpression } from '@mojir/dvala-engine'
import { miscNormalExpression } from '@mojir/dvala-engine'
import { objectNormalExpression } from '@mojir/dvala-engine'
import { predicatesNormalExpression } from '@mojir/dvala-engine'
import { regexpNormalExpression } from '@mojir/dvala-engine'
import { sequenceNormalExpression } from '@mojir/dvala-engine'
import { stringNormalExpression } from '@mojir/dvala-engine'
import { isFunctionDocs } from '@mojir/dvala-engine'
// Module categories — derive reference from co-located docs
import { assertModule } from '@mojir/dvala-engine'
import { bitwiseUtilsModule } from '@mojir/dvala-engine'
import { collectionUtilsModule } from '@mojir/dvala-engine'

import { astModule } from '@mojir/dvala-engine'
import { convertModule } from '@mojir/dvala-engine'
import { jsonModule } from '@mojir/dvala-engine'
import { timeModule } from '@mojir/dvala-engine'
import { handlerModule } from '@mojir/dvala-engine'
import { functionalUtilsModule } from '@mojir/dvala-engine'
import { macrosModule } from '@mojir/dvala-engine'
import { gridModule } from '@mojir/dvala-engine'
import { linearAlgebraModule } from '@mojir/dvala-engine'
import { mathUtilsModule } from '@mojir/dvala-engine'
import { matrixModule } from '@mojir/dvala-engine'
import { numberTheoryModule } from '@mojir/dvala-engine'
import { sequenceUtilsModule } from '@mojir/dvala-engine'
import { stringUtilsModule } from '@mojir/dvala-engine'
import { vectorModule } from '@mojir/dvala-engine'
import { normalExpressions } from '@mojir/dvala-engine'
import { specialExpressionTypes } from '@mojir/dvala-types'
import { allStandardEffectDefinitions } from '@mojir/dvala-engine'
// Direct file import — see comment in reference/dvala.ts about the
// reference ↔ core-tooling load-time cycle.
import { isSymbolicOperator } from '../tokenizer/operators'
import { canBeOperator } from '@mojir/dvala-types'
import { datatype } from './datatype'
import { prelude } from './prelude'
import { shorthand } from './shorthand'

// --- Helper: derive FunctionReference from co-located docs ---

function docsToReference(expressions: BuiltinNormalExpressions): Record<string, FunctionReference> {
  const result: Record<string, FunctionReference> = {}
  for (const [key, expr] of Object.entries(expressions)) {
    const docs: FunctionDocs | undefined = expr.docs
    if (!docs) {
      throw new Error(`Missing docs for expression "${key}"`)
    }
    result[key] = {
      title: key,
      category: docs.category,
      description: docs.description,
      returns: docs.returns,
      args: docs.args,
      variants: docs.variants,
      examples: docs.examples,
      ...(docs.seeAlso ? { seeAlso: docs.seeAlso } : {}),
      ...(docs.hideOperatorForm ? { noOperatorDocumentation: true } : {}),
    }
  }
  return result
}

// --- Helper: derive FunctionReference from module co-located docs ---

function moduledDocsToReference(module: DvalaModule): Record<string, FunctionReference> {
  const result: Record<string, FunctionReference> = {}
  for (const [key, docs] of Object.entries(module.docs ?? {})) {
    const qualifiedKey = `${module.name}.${key}`
    result[qualifiedKey] = {
      title: qualifiedKey,
      category: docs.category,
      description: docs.description,
      returns: docs.returns,
      args: docs.args,
      variants: docs.variants,
      examples: docs.examples,
      ...(docs.seeAlso ? { seeAlso: docs.seeAlso } : {}),
      ...(docs.hideOperatorForm ? { noOperatorDocumentation: true } : {}),
    }
  }
  return result
}

// Derive all core category references from co-located docs
const assertionRef = docsToReference(assertionNormalExpression) as Record<
  AssertionApiName,
  FunctionReference<'assertion'>
>
const bitwiseReference = docsToReference(bitwiseNormalExpression) as Record<
  BitwiseApiName,
  FunctionReference<'bitwise'>
>
const arrayRef = docsToReference(arrayNormalExpression) as Record<ArrayApiName, FunctionReference<'array'>>
const collectionRef = docsToReference(collectionNormalExpression) as Record<
  CollectionApiName,
  FunctionReference<'collection'>
>
const functionalRef = docsToReference(functionalNormalExpression) as Record<
  FunctionalApiName,
  FunctionReference<'functional'>
>
const mathRef = docsToReference(mathNormalExpression) as Record<MathApiName, FunctionReference<'math'>>
const emptyRef: Record<string, FunctionReference> = {}
const emptyEffectRef: Record<string, EffectReference> = {}
const metaRef = docsToReference(getMetaNormalExpression(emptyRef, emptyEffectRef)) as Record<
  MetaApiName,
  FunctionReference<'meta'>
>
const miscRef = docsToReference(miscNormalExpression) as Record<MiscApiName, FunctionReference<'misc'>>
const objectRef = docsToReference(objectNormalExpression) as Record<ObjectApiName, FunctionReference<'object'>>
const predicatesRef = docsToReference(predicatesNormalExpression) as Record<
  PredicateApiName,
  FunctionReference<'predicate'>
>
const regexpRef = docsToReference(regexpNormalExpression) as Record<
  RegularExpressionApiName,
  FunctionReference<'regular-expression'>
>
const sequenceRef = docsToReference(sequenceNormalExpression) as Record<SequenceApiName, FunctionReference<'sequence'>>
const stringRef = docsToReference(stringNormalExpression) as Record<StringApiName, FunctionReference<'string'>>

// --- Helper: derive special expression reference from co-located docs ---

function specialExpressionDocsToReference(): Record<
  string,
  FunctionReference<'special-expression'> | CustomReference<'special-expression'>
> {
  const result: Record<string, FunctionReference<'special-expression'> | CustomReference<'special-expression'>> = {}
  for (const [name, type] of Object.entries(specialExpressionTypes)) {
    const expr = specialExpressions[type]
    const docs: SpecialExpressionDocs | undefined = expr?.docs
    if (!docs) {
      continue // skip undocumented special expressions
    }
    if (isFunctionDocs(docs)) {
      result[name] = {
        title: name,
        category: docs.category as 'special-expression',
        description: docs.description,
        returns: docs.returns,
        args: docs.args,
        variants: docs.variants,
        examples: docs.examples,
        ...(docs.seeAlso ? { seeAlso: docs.seeAlso } : {}),
        ...(docs.hideOperatorForm ? { noOperatorDocumentation: true } : {}),
      }
    } else {
      result[name] = {
        title: name,
        category: docs.category as 'special-expression',
        description: docs.description,
        customVariants: docs.customVariants,
        ...(docs.details ? { details: docs.details } : {}),
        ...(docs.returns ? { returns: docs.returns } : {}),
        examples: docs.examples,
        ...(docs.seeAlso ? { seeAlso: docs.seeAlso } : {}),
      }
    }
  }
  return result
}

const specialExpressionsReference = specialExpressionDocsToReference()

// Reference type family lives in @mojir/dvala-engine. Re-export here so
// existing consumers of `from '../reference'` (etc.) keep working.
export type {
  Argument,
  CommonReference,
  CustomReference,
  DatatypeReference,
  EffectReference,
  FunctionReference,
  PreludeReference,
  Reference,
  ShorthandReference,
  TypedValue,
} from '@mojir/dvala-engine'
export {
  isCustomReference,
  isDatatypeReference,
  isEffectReference,
  isFunctionReference,
  isPreludeReference,
  isShorthandReference,
} from '@mojir/dvala-engine'

export const normalExpressionReference: Record<CoreNormalExpressionName, FunctionReference> = {
  // Core categories — all derived from co-located docs
  ...assertionRef,
  ...bitwiseReference,
  ...collectionRef,
  ...arrayRef,
  ...sequenceRef,
  ...mathRef,
  ...functionalRef,
  ...metaRef,
  ...miscRef,
  ...objectRef,
  ...predicatesRef,
  ...regexpRef,
  ...stringRef,
}

// Module functions — all derived from co-located docs
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
export const moduleReference: Record<ModuleExpressionName, FunctionReference> = {
  ...moduledDocsToReference(assertModule),
  ...moduledDocsToReference(gridModule),
  ...moduledDocsToReference(vectorModule),
  ...moduledDocsToReference(linearAlgebraModule),
  ...moduledDocsToReference(matrixModule),
  ...moduledDocsToReference(numberTheoryModule),
  ...moduledDocsToReference(stringUtilsModule),
  ...moduledDocsToReference(collectionUtilsModule),
  ...moduledDocsToReference(sequenceUtilsModule),
  ...moduledDocsToReference(mathUtilsModule),
  ...moduledDocsToReference(functionalUtilsModule),
  ...moduledDocsToReference(bitwiseUtilsModule),
  ...moduledDocsToReference(convertModule),
  ...moduledDocsToReference(jsonModule),
  ...moduledDocsToReference(timeModule),
  ...moduledDocsToReference(handlerModule),
  ...moduledDocsToReference(astModule),
  ...moduledDocsToReference(macrosModule),
} as Record<ModuleExpressionName, FunctionReference>

Object.entries(normalExpressionReference).forEach(([key, obj]) => {
  if (!normalExpressions[key]) {
    throw new Error(`Missing normal expression ${key} in normalExpressions`)
  }
  const arity = normalExpressions[key].arity
  if (!obj.noOperatorDocumentation && canBeOperator(arity)) {
    obj._isOperator = true
    if (isSymbolicOperator(key)) {
      obj._prefereOperator = true
    }
  }
})

Object.entries(specialExpressionsReference).forEach(([key, obj]) => {
  if (isFunctionReference(obj)) {
    const arity = specialExpressions[specialExpressionTypes[key as SpecialExpressionName]]?.arity
    if (arity && canBeOperator(arity)) {
      obj._isOperator = true
    }
  }
})

const functionReference = {
  ...normalExpressionReference,
  ...specialExpressionsReference,
}

// Core API reference (always available)
export const apiReference: Record<CoreApiName, Reference> = sortByCategory({
  ...functionReference,
  ...shorthand,
  ...datatype,
  ...prelude,
})

// Effect reference — derived from co-located docs in standardEffects.ts
function deriveEffectReference(): Record<string, EffectReference> {
  const result: Record<string, EffectReference> = {}
  for (const [name, def] of Object.entries(allStandardEffectDefinitions)) {
    const key = `-effect-${name}`
    result[key] = {
      effect: true,
      title: name,
      category: 'effect',
      description: def.docs.description,
      args: def.docs.args,
      returns: def.docs.returns,
      variants: def.docs.variants,
      examples: def.docs.examples,
      ...(def.docs.seeAlso ? { seeAlso: def.docs.seeAlso } : {}),
    }
  }
  return result
}

export const effectReference: Record<string, EffectReference> = deriveEffectReference()

// All references including modules and effects (for search and full documentation)
export const allReference: Record<string, Reference> = sortByCategory({
  ...apiReference,
  ...moduleReference,
  ...effectReference,
})

function sortByCategory<T extends Record<string, Reference>>(ref: T): T {
  return Object.fromEntries(
    Object.entries(ref).sort(([keyA, refA], [keyB, refB]) => {
      const catA = refA.category === 'special-expression' ? '' : refA.category
      const catB = refB.category === 'special-expression' ? '' : refB.category
      if (catA !== catB) {
        return catA.localeCompare(catB)
      }
      return keyA.localeCompare(keyB)
    }),
  ) as T
}

/** Build a URL-safe linkName. Replaces %2F (slash) with ~ to avoid path-separator issues. */
export function makeLinkName(category: string, key: string): string {
  return encodeURIComponent(`${category}-${key}`).replace(/%2F/gi, '~')
}

export function getLinkName(reference: Reference): string {
  return makeLinkName(reference.category, reference.title)
}
