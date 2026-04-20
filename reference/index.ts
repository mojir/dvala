import type { SpecialExpressionName } from '../src/builtin'
import type { BuiltinNormalExpressions, ExampleEntry, FunctionDocs, SpecialExpressionDocs } from '../src/builtin/interface'
import type { DvalaModule } from '../src/builtin/modules/interface'
import type { ApiName, ArrayApiName, AssertionApiName, BitwiseApiName, Category, CollectionApiName, CoreApiName, CoreNormalExpressionName, DataType, FunctionalApiName, MathApiName, MetaApiName, MiscApiName, ModuleExpressionName, ObjectApiName, PredicateApiName, RegularExpressionApiName, SequenceApiName, StringApiName } from './api'
import { specialExpressions } from '../src/builtin'
import { arrayNormalExpression } from '../src/builtin/core/array'
// Core categories — all derive reference from co-located docs
import { assertionNormalExpression } from '../src/builtin/core/assertion'
import { bitwiseNormalExpression } from '../src/builtin/core/bitwise'
import { collectionNormalExpression } from '../src/builtin/core/collection'

import { functionalNormalExpression } from '../src/builtin/core/functional'
import { mathNormalExpression } from '../src/builtin/core/math'
import { getMetaNormalExpression } from '../src/builtin/core/meta'
import { miscNormalExpression } from '../src/builtin/core/misc'
import { objectNormalExpression } from '../src/builtin/core/object'
import { predicatesNormalExpression } from '../src/builtin/core/predicates'
import { regexpNormalExpression } from '../src/builtin/core/regexp'
import { sequenceNormalExpression } from '../src/builtin/core/sequence'
import { stringNormalExpression } from '../src/builtin/core/string'
import { isFunctionDocs } from '../src/builtin/interface'
// Module categories — derive reference from co-located docs
import { assertModule } from '../src/builtin/modules/assertion'
import { bitwiseUtilsModule } from '../src/builtin/modules/bitwise'
import { collectionUtilsModule } from '../src/builtin/modules/collection'

import { astModule } from '../src/builtin/modules/ast'
import { convertModule } from '../src/builtin/modules/convert'
import { jsonModule } from '../src/builtin/modules/json'
import { timeModule } from '../src/builtin/modules/time'
import { handlerModule } from '../src/builtin/modules/effectHandler'
import { functionalUtilsModule } from '../src/builtin/modules/functional'
import { macrosModule } from '../src/builtin/modules/macros'
import { gridModule } from '../src/builtin/modules/grid'
import { linearAlgebraModule } from '../src/builtin/modules/linear-algebra'
import { mathUtilsModule } from '../src/builtin/modules/math'
import { matrixModule } from '../src/builtin/modules/matrix'
import { numberTheoryModule } from '../src/builtin/modules/number-theory'
import { sequenceUtilsModule } from '../src/builtin/modules/sequence'
import { stringUtilsModule } from '../src/builtin/modules/string'
import { vectorModule } from '../src/builtin/modules/vector'
import { normalExpressions } from '../src/builtin/normalExpressions'
import { specialExpressionTypes } from '../src/builtin/specialExpressionTypes'
import { allStandardEffectDefinitions } from '../src/evaluator/standardEffects'
import { isSymbolicOperator } from '../src/tokenizer/operators'
import { canBeOperator } from '../src/utils/arity'
import { datatype } from './datatype'
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
      ...(docs.seeAlso ? { seeAlso: docs.seeAlso as ApiName[] } : {}),
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
      ...(docs.seeAlso ? { seeAlso: docs.seeAlso as ApiName[] } : {}),
      ...(docs.hideOperatorForm ? { noOperatorDocumentation: true } : {}),
    }
  }
  return result
}

// Derive all core category references from co-located docs
const assertionRef = docsToReference(assertionNormalExpression) as Record<AssertionApiName, FunctionReference<'assertion'>>
const bitwiseReference = docsToReference(bitwiseNormalExpression) as Record<BitwiseApiName, FunctionReference<'bitwise'>>
const arrayRef = docsToReference(arrayNormalExpression) as Record<ArrayApiName, FunctionReference<'array'>>
const collectionRef = docsToReference(collectionNormalExpression) as Record<CollectionApiName, FunctionReference<'collection'>>
const functionalRef = docsToReference(functionalNormalExpression) as Record<FunctionalApiName, FunctionReference<'functional'>>
const mathRef = docsToReference(mathNormalExpression) as Record<MathApiName, FunctionReference<'math'>>
const emptyRef: Record<string, FunctionReference> = {}
const emptyEffectRef: Record<string, EffectReference> = {}
const metaRef = docsToReference(getMetaNormalExpression(emptyRef, emptyEffectRef)) as Record<MetaApiName, FunctionReference<'meta'>>
const miscRef = docsToReference(miscNormalExpression) as Record<MiscApiName, FunctionReference<'misc'>>
const objectRef = docsToReference(objectNormalExpression) as Record<ObjectApiName, FunctionReference<'object'>>
const predicatesRef = docsToReference(predicatesNormalExpression) as Record<PredicateApiName, FunctionReference<'predicate'>>
const regexpRef = docsToReference(regexpNormalExpression) as Record<RegularExpressionApiName, FunctionReference<'regular-expression'>>
const sequenceRef = docsToReference(sequenceNormalExpression) as Record<SequenceApiName, FunctionReference<'sequence'>>
const stringRef = docsToReference(stringNormalExpression) as Record<StringApiName, FunctionReference<'string'>>

// --- Helper: derive special expression reference from co-located docs ---

function specialExpressionDocsToReference(): Record<string, FunctionReference<'special-expression'> | CustomReference<'special-expression'>> {
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
        ...(docs.seeAlso ? { seeAlso: docs.seeAlso as ApiName[] } : {}),
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
        ...(docs.seeAlso ? { seeAlso: docs.seeAlso as ApiName[] } : {}),
      }
    }
  }
  return result
}

const specialExpressionsReference = specialExpressionDocsToReference()

export interface TypedValue {
  type: DataType[] | DataType
  rest?: true
  array?: true
}

export type NormalExpressionArgument = TypedValue & {
  description?: string
}

export type Argument = NormalExpressionArgument

interface Variant {
  argumentNames: string[]
}

export interface CommonReference<T extends Category> {
  title: string
  category: T
  examples: ExampleEntry[]
  description: string
  seeAlso?: string[]
}
export type FunctionReference<T extends Category = Category> = CommonReference<T> & {
  returns: TypedValue
  args: Record<string, Argument>
  variants: Variant[]
  noOperatorDocumentation?: true
  _isOperator?: boolean
  _prefereOperator?: boolean
}

export type CustomReference<T extends Category = Category> = CommonReference<T> & {
  customVariants: string[]
  details?: [string, string, string | undefined][]
}

export interface ShorthandReference extends CommonReference<'shorthand'> {
  shorthand: true
}

export interface DatatypeReference extends CommonReference<'datatype'> {
  datatype: true
}

export interface EffectReference extends CommonReference<'effect' | 'playground-effect'> {
  effect: true
  args: Record<string, Argument>
  returns: TypedValue
  variants: Variant[]
}

export type Reference<T extends Category = Category> = FunctionReference<T> | CustomReference<T> | ShorthandReference | DatatypeReference | EffectReference

export function isFunctionReference<T extends Category>(ref: Reference<T>): ref is FunctionReference<T> {
  return 'returns' in ref && 'args' in ref && 'variants' in ref && !('effect' in ref)
}

export function isCustomReference<T extends Category>(ref: Reference<T>): ref is CustomReference<T> {
  return 'customVariants' in ref
}

export function isShorthandReference<T extends Category>(ref: Reference<T>): ref is ShorthandReference {
  return 'shorthand' in ref
}

export function isDatatypeReference<T extends Category>(ref: Reference<T>): ref is DatatypeReference {
  return 'datatype' in ref
}

export function isEffectReference<T extends Category>(ref: Reference<T>): ref is EffectReference {
  return 'effect' in ref
}

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

export const functionReference = {
  ...normalExpressionReference,
  ...specialExpressionsReference,
}

// Core API reference (always available)
export const apiReference: Record<CoreApiName, Reference> = sortByCategory({ ...functionReference, ...shorthand, ...datatype })

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
export const allReference: Record<string, Reference> = sortByCategory({ ...apiReference, ...moduleReference, ...effectReference })

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
