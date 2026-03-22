/**
 * Auto-generated behavioral tests for all normal expressions.
 *
 * Uses the co-located docs metadata (args, returns, arity, examples) to
 * generate tests automatically — no per-function manual effort.
 *
 * Three test categories:
 * 1. Arity enforcement — too few / too many args throw
 * 2. Return type injection — wraps each doc example in a type assertion
 * 3. Module function coverage — same tests for module expressions
 */
import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { allBuiltinModules } from '../src/allModules'
import { normalExpressions } from '../src/builtin/normalExpressions'
import type { TypedValue } from '../src/builtin/interface'
import '../src/initReferenceData'

const dvala = createDvala({ modules: allBuiltinModules, disableAutoCheckpoint: true })

// ---------------------------------------------------------------------------
// DataType → Dvala predicate name mapping
// ---------------------------------------------------------------------------
const typeToCheck: Record<string, string | null> = {
  number: 'isNumber',
  string: 'isString',
  boolean: 'isBoolean',
  array: 'isArray',
  object: 'isObject',
  function: 'isFunction',
  null: 'isNull',
  integer: 'isInteger',
  regexp: 'isRegexp',
  collection: 'isCollection',
  sequence: 'isSequence',
  vector: 'isVector',
  matrix: 'isMatrix',
  grid: 'isGrid',
  effect: 'isEffect',
  any: null, // anything is valid
  never: null, // should throw, not return
}

/**
 * Generate a Dvala boolean expression that checks if `varName` matches the
 * declared return type.  Returns null for 'any' / 'never' (skip check).
 *
 * Handles `array: true` — when the docs declare e.g. `{ type: 'number', array: true }`,
 * the actual return value is an array (of numbers), so we check `isArray` instead.
 */
function generateTypeCheck(varName: string, returnType: TypedValue): string | null {
  // If the return type is flagged as array, the value is an array regardless of element type
  if (returnType.array) {
    return `isArray(${varName})`
  }

  const types = Array.isArray(returnType.type) ? returnType.type : [returnType.type]
  const checks = types.map(t => typeToCheck[t]).filter((c): c is string => c !== null)
  if (checks.length === 0)
    return null
  return checks.map(c => `${c}(${varName})`).join(' || ')
}

/**
 * Generate N dummy args as a comma-separated Dvala source string.
 * Uses `null` since arity checking happens before type validation.
 */
function dummyArgs(n: number): string {
  return Array.from({ length: n }).fill('null').join(', ')
}

/**
 * Escape a function name for use in a Dvala function-call position.
 * Most names work as-is; operators like |> need no special handling
 * in function-call form in Dvala.
 */
function callExpr(name: string, args: string): string {
  // Names that can't be used in call position — skip them
  return `${name}(${args})`
}

// ---------------------------------------------------------------------------
// Expressions that need special handling
// ---------------------------------------------------------------------------

/**
 * Expressions to skip for arity tests (e.g. they have side effects,
 *  require specific runtime context, or can't be called in function form)
 */
const skipArityTests = new Set([
  'assert', // throws by design on falsy
  'write!', // side effect
  'inst-ms!', // side effect (timestamps)
  'uuid!', // side effect
  'rand!', // side effect
  'rand-int!', // side effect
  'boolean', // conflicts with reserved word handling
  'number', // conflicts with reserved word handling
])

/**
 * Expressions to skip for return-type injection on examples.
 *  Reasons:
 *  - "usage demo": examples call the returned function, so the result
 *    doesn't match the declared return type (function)
 *  - "assertion": assertion examples are self-contained test programs
 *    whose last expression isn't the assertion's null return
 */
const skipReturnTypeExamples = new Set([
  'assert', // examples intentionally show error handling

  // Functions that return functions — examples demonstrate USAGE (calling
  // the returned function) so the result is not a function.
  'comp',
  'constantly',
  'effectMatcher',
])

/**
 * Module expressions to skip for return-type injection.
 *  Key: module name, Value: set of function names to skip.
 */
const skipModuleReturnTypeExamples: Record<string, Set<string>> = {
  // Assertion examples are complete test programs, last expr isn't null
  assertion: new Set([
    'assertEqual',
    'assertNotEqual',
    'assertGt',
    'assertGte',
    'assertLt',
    'assertLte',
    'assertTrue',
    'assertFalse',
    'assertTruthy',
    'assertFalsy',
    'assertNull',
    'assert-throws',
    'assert-throws-error',
    'assert-not-throws',
    'assertArray',
    'assertBoolean',
    'assertCollection',
    'assertFunction',
    'assertGrid',
    'assertInteger',
    'assertMatrix',
    'assertNumber',
    'assertObject',
    'assertRegexp',
    'assertSequence',
    'assertString',
    'assertVector',
  ]),
  // Examples call the returned function to demonstrate usage
  functional: new Set([
    'complement',
    'everyPred',
    'somePred',
    'fnull',
    'juxt',
  ]),
}

/**
 * Core expressions with specific example indices to skip (0-based).
 * Used when some examples demonstrate secondary use cases (e.g. vector/matrix
 * overloads) that don't match the primary declared return type.
 */
const skipCoreExampleIndices: Record<string, Set<number>> = {
  inc: new Set([3, 4]), // vector/matrix element-wise demos
  dec: new Set([3, 4]), // vector/matrix element-wise demos
}

/**
 * Module expressions with specific example indices to skip (0-based).
 * Key: "moduleName.fnName", Value: set of 0-based indices.
 */
const skipModuleExampleIndices: Record<string, Set<number>> = {
  'math.asin': new Set([3, 4]), // vector/matrix demos
  'math.acos': new Set([3, 4]),
  'math.atan': new Set([3, 4]),
  'math.sin': new Set([3, 4]),
  'math.cos': new Set([3, 4]),
  'math.tan': new Set([3, 4]),
  'math.sinh': new Set([3, 4]),
  'math.cosh': new Set([3, 4]),
  'math.tanh': new Set([3, 4]),
  'math.log': new Set([3, 4]),
  'math.log2': new Set([3, 4]),
  'math.log10': new Set([3, 4]),
  'math.exp': new Set([3, 4]),
  'math.sqrt': new Set([3, 4]),
  'math.cbrt': new Set([3, 4]),
  'assertion.assertFails': new Set([1]), // failure case returns string
  'assertion.assertFailsWith': new Set([1]),
  'assertion.assertSucceeds': new Set([1]),
}

// =========================================================================
// 1. ARITY ENFORCEMENT
// =========================================================================
describe('auto: arity enforcement (core)', () => {
  for (const [name, expr] of Object.entries(normalExpressions)) {
    if (skipArityTests.has(name))
      continue
    const { arity } = expr

    if (arity.min !== undefined && arity.min > 0) {
      const min = arity.min
      it(`${name}: rejects ${min - 1} args (min ${min})`, () => {
        const code = callExpr(name, dummyArgs(min - 1))
        expect(() => dvala.run(code)).toThrow()
      })
    }

    if (arity.max !== undefined) {
      const max = arity.max
      it(`${name}: rejects ${max + 1} args (max ${max})`, () => {
        const code = callExpr(name, dummyArgs(max + 1))
        expect(() => dvala.run(code)).toThrow()
      })
    }
  }
})

// =========================================================================
// 2. RETURN TYPE INJECTION ON EXAMPLES (core)
// =========================================================================
describe('auto: return type on examples (core)', () => {
  for (const [name, expr] of Object.entries(normalExpressions)) {
    if (!expr.docs)
      continue
    if (skipReturnTypeExamples.has(name))
      continue
    const { returns, examples } = expr.docs

    const typeCheck = generateTypeCheck('__r', returns)
    if (!typeCheck)
      continue // skip 'any', 'never'

    for (const [i, example] of examples.entries()) {
      if (skipCoreExampleIndices[name]?.has(i))
        continue
      it(`${name} example ${i + 1}: returns ${JSON.stringify(returns.type)}`, () => {
        const wrapped = `do
  let __r = do
    ${example}
  end;
  assert(${typeCheck}, "${name} example ${i + 1} returned wrong type");
  __r
end`
        expect(() => dvala.run(wrapped)).not.toThrow()
      })
    }
  }
})

// =========================================================================
// 3. MODULE EXPRESSIONS — arity + return type
// =========================================================================
for (const mod of allBuiltinModules) {
  if (!mod.docs)
    continue

  describe(`auto: arity enforcement (${mod.name})`, () => {
    for (const [fnName, expr] of Object.entries(mod.functions)) {
      if (skipArityTests.has(fnName))
        continue
      const { arity } = expr

      if (arity.min !== undefined && arity.min > 0) {
        const min = arity.min
        it(`${mod.name}.${fnName}: rejects ${min - 1} args (min ${min})`, () => {
          const code = `do import "${mod.name}" as __m; __m.${fnName}(${dummyArgs(min - 1)}) end`
          expect(() => dvala.run(code)).toThrow()
        })
      }

      if (arity.max !== undefined) {
        const max = arity.max
        it(`${mod.name}.${fnName}: rejects ${max + 1} args (max ${max})`, () => {
          const code = `do import "${mod.name}" as __m; __m.${fnName}(${dummyArgs(max + 1)}) end`
          expect(() => dvala.run(code)).toThrow()
        })
      }
    }
  })

  describe(`auto: return type on examples (${mod.name})`, () => {
    const moduleSkips = skipModuleReturnTypeExamples[mod.name]

    // Pre-check: skip if no testable examples exist for this module
    const hasTestable = Object.entries(mod.docs!).some(([fnName, docs]) => {
      if (skipReturnTypeExamples.has(fnName))
        return false
      if (moduleSkips?.has(fnName))
        return false
      return generateTypeCheck('__r', docs.returns) !== null
        && docs.examples.some((_e, i) => !skipModuleExampleIndices[`${mod.name}.${fnName}`]?.has(i))
    })
    if (!hasTestable) {
      it.skip(`${mod.name}: all examples skipped`, () => {})
      return
    }

    for (const [fnName, docs] of Object.entries(mod.docs!)) {
      if (skipReturnTypeExamples.has(fnName))
        continue
      if (moduleSkips?.has(fnName))
        continue

      const typeCheck = generateTypeCheck('__r', docs.returns)
      if (!typeCheck)
        continue

      for (const [i, example] of docs.examples.entries()) {
        const moduleExampleKey = `${mod.name}.${fnName}`
        if (skipModuleExampleIndices[moduleExampleKey]?.has(i))
          continue
        it(`${mod.name}.${fnName} example ${i + 1}: returns ${JSON.stringify(docs.returns.type)}`, () => {
          const wrapped = `do
  let __r = do
    ${example}
  end;
  assert(${typeCheck}, "${mod.name}.${fnName} example ${i + 1} returned wrong type");
  __r
end`
          expect(() => dvala.run(wrapped)).not.toThrow()
        })
      }
    }
  })
}
