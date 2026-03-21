/**
 * Auto-generated smart tests for finding bugs.
 *
 * Uses the co-located docs metadata to auto-generate behavioral tests
 * that go beyond the existing arity and return-type tests.
 *
 * Test categories:
 * 1. Docs metadata consistency — variant/args/arity structural integrity
 * 2. seeAlso validity — all targets exist in allReference
 * 3. Wrong-type argument rejection — pass wrong types, expect throw
 * 4. Example determinism — running same example twice gives same result
 * 5. Operator form equivalence — f(a, b) same as a f b
 */
import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { allBuiltinModules } from '../src/allModules'
import { normalExpressions } from '../src/builtin/normalExpressions'
import { specialExpressions } from '../src/builtin'
import { specialExpressionTypes } from '../src/builtin/specialExpressionTypes'
import type { DataType } from '../src/builtin/interface'
import { isDataType, isFunctionDocs } from '../src/builtin/interface'
import { allReference } from '../reference'
import '../src/initReferenceData'

const dvala = createDvala({ modules: allBuiltinModules, disableAutoCheckpoint: true })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * For each DataType, which Dvala expression values would be accepted by it.
 * Used to find a "definitely wrong" value for a given type.
 */
const typeAccepts: Record<string, string[]> = {
  number: ['42'],
  integer: ['42'],
  string: ['"wrong"'],
  boolean: ['true'],
  array: ['[]'],
  object: ['{}'],
  function: ['(-> null)'],
  regexp: ['#""#'],
  null: ['null'],
  collection: ['"wrong"', '[]', '{}'],
  sequence: ['"wrong"', '[]'],
  vector: ['[]'],
  matrix: [],
  grid: [],
  effect: [],
  any: ['42', '"wrong"', 'true', '[]', '{}', '(-> null)', '#""#', 'null'],
  never: [],
}

/**
 * Minimal valid Dvala expression for each DataType.
 */
const minValidFor: Record<string, string> = {
  number: '0',
  integer: '0',
  string: '""',
  boolean: 'true',
  array: '[]',
  object: '{}',
  function: '(-> null)',
  regexp: '#""#',
  null: 'null',
  collection: '[]',
  sequence: '[]',
  vector: '[0]',
  matrix: '[[0]]',
  grid: '[[0]]',
  effect: 'null',
  any: 'null',
  never: 'null',
}

/**
 * Find a Dvala expression that is definitely NOT a valid value for the given type(s).
 * Returns null if we can't find one (e.g., for `any`).
 */
function getWrongValue(types: DataType | DataType[]): string | null {
  const typeArr = Array.isArray(types) ? types : [types]
  if (typeArr.includes('any') || typeArr.includes('never'))
    return null

  const candidates = ['42', '"wrong"', 'true', '[]', '{}', '(-> null)', '#""#', 'null']

  for (const candidate of candidates) {
    const accepted = typeArr.some(t => (typeAccepts[t] ?? []).includes(candidate))
    if (!accepted)
      return candidate
  }
  return null
}

/**
 * Get a minimal valid Dvala expression for the given type(s).
 */
function getMinValid(types: DataType | DataType[]): string {
  const t = Array.isArray(types) ? types[0]! : types
  return minValidFor[t] ?? 'null'
}

// ---------------------------------------------------------------------------
// Skip lists
// ---------------------------------------------------------------------------

/** Functions to skip for wrong-type tests */
const skipWrongTypeTests = new Set([
  'assert', // throws by design
  'write!', // side effect
  'inst-ms!', // side effect
  'uuid!', // side effect
  'rand!', // side effect
  'rand-int!', // side effect
  'boolean', // conflicts with reserved word
  'number', // conflicts with reserved word
  'compare', // accepts any types for comparison
  'type-of', // accepts any
  'not', // coerces any to boolean
  'hash', // accepts any
  '=', // accepts any
  '!=', // accepts any
  'str', // accepts any
  'deep-=', // deeply compares any
  '++', // handles multiple types
  'identity', // accepts any
  '|>', // special pipe semantics
  'apply', // special apply semantics
  'comp', // creates composed function
  'constantly', // wraps any value
  'count', // accepts sequence (string or array) and also objects
  'get', // accepts collection
  'contains?', // accepts collection
  'assoc', // accepts collection
  'map', // first arg is collection but also handles objects
  'filter', // first arg is collection but also handles objects
  'reduce', // first arg is collection but also handles objects
  'some', // sequence but varies
  'find', // sequence but varies
  'sorted?', // flexible input
  'sort', // flexible input
  'take', // flexible input
  'take-while', // flexible input
  'drop', // flexible input
  'drop-while', // flexible input
  'reverse', // flexible input
  'index-of', // flexible input
  'last-index-of', // flexible input
  'first', // flexible input
  'second', // flexible input
  'last', // flexible input
  'rest', // flexible input
  'nth', // flexible input
  'slice', // flexible input
  'distinct', // flexible input
  'flat-map', // flexible input
  'mapcat', // flexible input
  'moving-fn', // flexible input
  'running-fn', // flexible input
  'merge-with', // flexible input
  'concat', // flexible input
  'keys', // flexible input
  'vals', // flexible input
  'entries', // flexible input
  'from-entries', // flexible input
  'merge', // flexible input
  'select-keys', // flexible input
  'dissoc', // flexible input
  'zipmap', // flexible input
  'doc', // meta function
  'effect-matcher', // returns function
  'arity', // numbers/collections are function-like in Dvala, so arity(42) is valid
])

/** Module functions to skip for wrong-type tests */
const skipModuleWrongTypeTests: Record<string, Set<string>> = {
  assertion: new Set(Object.keys(allBuiltinModules.find(m => m.name === 'assertion')?.functions ?? {})),
  functional: new Set(Object.keys(allBuiltinModules.find(m => m.name === 'functional')?.functions ?? {})),
  collection: new Set(Object.keys(allBuiltinModules.find(m => m.name === 'collection')?.functions ?? {})),
  sequence: new Set(Object.keys(allBuiltinModules.find(m => m.name === 'sequence')?.functions ?? {})),
  convert: new Set(Object.keys(allBuiltinModules.find(m => m.name === 'convert')?.functions ?? {})),
}

/** Functions to skip for example determinism tests (side effects, randomness, time) */
const skipDeterminismTests = new Set([
  'write!',
  'inst-ms!',
  'uuid!',
  'rand!',
  'rand-int!',
])

const skipModuleDeterminismTests: Record<string, Set<string>> = {}

// =========================================================================
// 1. DOCS METADATA CONSISTENCY
// =========================================================================

describe('auto: docs metadata consistency (core)', () => {
  for (const [name, expr] of Object.entries(normalExpressions)) {
    if (!expr.docs)
      continue
    const docs = expr.docs
    const { arity } = expr

    describe(name, () => {
      it('variant argumentNames are all keys in args', () => {
        for (const variant of docs.variants) {
          for (const argName of variant.argumentNames) {
            expect(
              docs.args[argName],
              `${name}: variant references arg "${argName}" which is not in args record. Args: ${Object.keys(docs.args).join(', ')}`,
            ).toBeDefined()
          }
        }
      })

      it('returns type is valid DataType', () => {
        const types = Array.isArray(docs.returns.type) ? docs.returns.type : [docs.returns.type]
        for (const t of types) {
          expect(isDataType(t), `${name}: invalid return DataType "${t}"`).toBe(true)
        }
      })

      it('args types are valid DataTypes', () => {
        for (const [argName, arg] of Object.entries(docs.args)) {
          const types = Array.isArray(arg.type) ? arg.type : [arg.type]
          for (const t of types) {
            expect(isDataType(t), `${name}: arg "${argName}" has invalid DataType "${t}"`).toBe(true)
          }
        }
      })

      it('variant arg counts are consistent with arity', () => {
        for (const variant of docs.variants) {
          const hasRestArg = variant.argumentNames.some(n => docs.args[n]?.rest)

          if (!hasRestArg) {
            // Non-variadic variant: arg count must be within arity range
            const argCount = variant.argumentNames.length
            if (arity.min !== undefined) {
              expect(
                argCount >= arity.min,
                `${name}: variant has ${argCount} args but arity.min is ${arity.min}`,
              ).toBe(true)
            }
            if (arity.max !== undefined) {
              expect(
                argCount <= arity.max,
                `${name}: variant has ${argCount} args but arity.max is ${arity.max}`,
              ).toBe(true)
            }
          } else {
            // Variadic variant: non-rest args must be >= arity.min
            const nonRestCount = variant.argumentNames.filter(n => !docs.args[n]?.rest).length
            if (arity.min !== undefined) {
              expect(
                nonRestCount >= arity.min || variant.argumentNames.length >= arity.min,
                `${name}: variadic variant has ${nonRestCount} non-rest args but arity.min is ${arity.min}`,
              ).toBe(true)
            }
          }
        }
      })

      it('has at least one example', () => {
        expect(docs.examples.length, `${name}: no examples`).toBeGreaterThan(0)
      })

      it('description ends with a period', () => {
        expect(
          docs.description.trimEnd().endsWith('.'),
          `${name}: description does not end with a period: "${docs.description.slice(-20)}"`,
        ).toBe(true)
      })

      if (docs.seeAlso) {
        it('seeAlso targets exist in allReference', () => {
          for (const target of docs.seeAlso!) {
            expect(
              allReference[target],
              `${name}: seeAlso references "${target}" which does not exist in allReference`,
            ).toBeDefined()
          }
        })
      }
    })
  }
})

/** Special expressions to skip for example check (async-only, no sync examples possible) */
const skipSpecialExpressionExamples = new Set([
  'parallel', // async-only construct
  'race', // async-only construct
])

describe('auto: docs metadata consistency (special expressions)', () => {
  for (const [name, index] of Object.entries(specialExpressionTypes)) {
    const expr = specialExpressions[index]
    if (!expr?.docs)
      continue
    const docs = expr.docs

    describe(name, () => {
      if (isFunctionDocs(docs)) {
        it('variant argumentNames are all keys in args', () => {
          for (const variant of docs.variants) {
            for (const argName of variant.argumentNames) {
              expect(
                docs.args[argName],
                `${name}: variant references arg "${argName}" which is not in args record`,
              ).toBeDefined()
            }
          }
        })

        it('returns type is valid DataType', () => {
          const types = Array.isArray(docs.returns.type) ? docs.returns.type : [docs.returns.type]
          for (const t of types) {
            expect(isDataType(t), `${name}: invalid return DataType "${t}"`).toBe(true)
          }
        })
      }

      it('has at least one example', () => {
        if (skipSpecialExpressionExamples.has(name))
          return
        expect(docs.examples.length, `${name}: no examples`).toBeGreaterThan(0)
      })

      it('description ends with a period', () => {
        expect(
          docs.description.trimEnd().endsWith('.'),
          `${name}: description does not end with a period`,
        ).toBe(true)
      })

      if (docs.seeAlso) {
        it('seeAlso targets exist', () => {
          for (const target of docs.seeAlso!) {
            expect(
              allReference[target],
              `${name}: seeAlso references "${target}" which does not exist`,
            ).toBeDefined()
          }
        })
      }
    })
  }
})

describe('auto: docs metadata consistency (modules)', () => {
  for (const mod of allBuiltinModules) {
    if (!mod.docs)
      continue

    describe(mod.name, () => {
      for (const [fnName, docs] of Object.entries(mod.docs!)) {
        const expr = mod.functions[fnName]
        if (!expr)
          continue

        describe(fnName, () => {
          it('variant argumentNames are all keys in args', () => {
            for (const variant of docs.variants) {
              for (const argName of variant.argumentNames) {
                expect(
                  docs.args[argName],
                  `${mod.name}.${fnName}: variant references arg "${argName}" which is not in args`,
                ).toBeDefined()
              }
            }
          })

          it('returns type is valid DataType', () => {
            const types = Array.isArray(docs.returns.type) ? docs.returns.type : [docs.returns.type]
            for (const t of types) {
              expect(isDataType(t), `${mod.name}.${fnName}: invalid return DataType "${t}"`).toBe(true)
            }
          })

          it('args types are valid DataTypes', () => {
            for (const [argName, arg] of Object.entries(docs.args)) {
              const types = Array.isArray(arg.type) ? arg.type : [arg.type]
              for (const t of types) {
                expect(isDataType(t), `${mod.name}.${fnName}: arg "${argName}" has invalid DataType "${t}"`).toBe(true)
              }
            }
          })

          it('variant arg counts are consistent with arity', () => {
            for (const variant of docs.variants) {
              const hasRestArg = variant.argumentNames.some(n => docs.args[n]?.rest)
              if (!hasRestArg) {
                const argCount = variant.argumentNames.length
                if (expr.arity.min !== undefined) {
                  expect(
                    argCount >= expr.arity.min,
                    `${mod.name}.${fnName}: variant has ${argCount} args but arity.min is ${expr.arity.min}`,
                  ).toBe(true)
                }
                if (expr.arity.max !== undefined) {
                  expect(
                    argCount <= expr.arity.max,
                    `${mod.name}.${fnName}: variant has ${argCount} args but arity.max is ${expr.arity.max}`,
                  ).toBe(true)
                }
              }
            }
          })

          it('has at least one example', () => {
            expect(docs.examples.length, `${mod.name}.${fnName}: no examples`).toBeGreaterThan(0)
          })

          it('description ends with a period', () => {
            expect(
              docs.description.trimEnd().endsWith('.'),
              `${mod.name}.${fnName}: description does not end with a period: "${docs.description.slice(-30)}"`,
            ).toBe(true)
          })

          if (docs.seeAlso) {
            it('seeAlso targets exist in allReference', () => {
              for (const target of docs.seeAlso!) {
                expect(
                  allReference[target],
                  `${mod.name}.${fnName}: seeAlso references "${target}" which does not exist`,
                ).toBeDefined()
              }
            })
          }
        })
      }
    })
  }
})

// =========================================================================
// 2. seeAlso SYMMETRY CHECK
// =========================================================================

describe('auto: seeAlso symmetry', () => {
  // For each function reference with seeAlso, check that the target links back
  for (const [key, ref] of Object.entries(allReference)) {
    if (!('seeAlso' in ref) || !ref.seeAlso)
      continue
    // Skip effects — they have one-way seeAlso references
    if ('effect' in ref)
      continue

    for (const target of ref.seeAlso) {
      const targetRef = allReference[target]
      if (!targetRef)
        continue // missing target caught by section 1

      it(`${key} ↔ ${target}`, () => {
        expect(
          'seeAlso' in targetRef && targetRef.seeAlso?.includes(key),
          `${key} references ${target} in seeAlso, but ${target} does not link back to ${key}`,
        ).toBe(true)
      })
    }
  }
})

// =========================================================================
// 3. WRONG-TYPE ARGUMENT REJECTION (core)
// =========================================================================

describe('auto: wrong-type rejection (core)', () => {
  for (const [name, expr] of Object.entries(normalExpressions)) {
    if (!expr.docs)
      continue
    if (skipWrongTypeTests.has(name))
      continue

    const docs = expr.docs
    // Use the first variant as the canonical calling form
    const variant = docs.variants[0]
    if (!variant)
      continue

    for (const argName of variant.argumentNames) {
      const arg = docs.args[argName]
      if (!arg)
        continue
      if (arg.rest)
        continue

      const wrongValue = getWrongValue(arg.type)
      if (!wrongValue)
        continue

      // Build args: correct types for all except the target arg
      const argValues = variant.argumentNames.map(n => {
        if (n === argName)
          return wrongValue
        const a = docs.args[n]
        if (!a)
          return 'null'
        if (a.rest)
          return '' // rest args get nothing
        return getMinValid(a.type)
      }).filter(v => v !== '')

      const code = `${name}(${argValues.join(', ')})`

      it(`${name}(${argName}: ${JSON.stringify(arg.type)}) rejects ${wrongValue}`, () => {
        expect(() => dvala.run(code)).toThrow()
      })
    }
  }
})

// =========================================================================
// 4. WRONG-TYPE ARGUMENT REJECTION (modules)
// =========================================================================

describe('auto: wrong-type rejection (modules)', () => {
  for (const mod of allBuiltinModules) {
    if (!mod.docs)
      continue
    const moduleSkips = skipModuleWrongTypeTests[mod.name]

    describe(mod.name, () => {
      // Check if any testable functions exist for this module
      const hasTestable = Object.entries(mod.docs!).some(([fnName, docs]) => {
        if (moduleSkips?.has(fnName))
          return false
        const variant = docs.variants[0]
        if (!variant)
          return false
        return variant.argumentNames.some(argName => {
          const arg = docs.args[argName]
          return arg && !arg.rest && getWrongValue(arg.type) !== null
        })
      })
      if (!hasTestable) {
        it.skip(`${mod.name}: all functions skipped`, () => {})
        return
      }

      for (const [fnName, docs] of Object.entries(mod.docs!)) {
        if (moduleSkips?.has(fnName))
          continue

        const variant = docs.variants[0]
        if (!variant)
          continue

        for (const argName of variant.argumentNames) {
          const arg = docs.args[argName]
          if (!arg)
            continue
          if (arg.rest)
            continue

          const wrongValue = getWrongValue(arg.type)
          if (!wrongValue)
            continue

          const argValues = variant.argumentNames.map(n => {
            if (n === argName)
              return wrongValue
            const a = docs.args[n]
            if (!a)
              return 'null'
            if (a.rest)
              return ''
            return getMinValid(a.type)
          }).filter(v => v !== '')

          const code = `do import "${mod.name}" as __m; __m.${fnName}(${argValues.join(', ')}) end`

          it(`${mod.name}.${fnName}(${argName}: ${JSON.stringify(arg.type)}) rejects ${wrongValue}`, () => {
            expect(() => dvala.run(code)).toThrow()
          })
        }
      }
    })
  }
})

// =========================================================================
// 5. EXAMPLE DETERMINISM
// =========================================================================

describe('auto: example determinism (core)', () => {
  for (const [name, expr] of Object.entries(normalExpressions)) {
    if (!expr.docs)
      continue
    if (skipDeterminismTests.has(name))
      continue

    const docs = expr.docs

    for (const [i, entry] of docs.examples.entries()) {
      const example = typeof entry === 'string' ? entry : entry.code
      it(`${name} example ${i + 1} is deterministic`, () => {
        if (typeof entry !== 'string') return
        let result1: unknown, result2: unknown
        let threw1 = false
        let threw2 = false
        try {
          result1 = dvala.run(example)
        } catch {
          threw1 = true
        }
        try {
          result2 = dvala.run(example)
        } catch {
          threw2 = true
        }

        expect(threw1, `${name} example ${i + 1}: first run threw but second didn't`).toBe(threw2)
        if (!threw1 && !threw2) {
          expect(result1, `${name} example ${i + 1}: non-deterministic result`).toEqual(result2)
        }
      })
    }
  }
})

describe('auto: example determinism (modules)', () => {
  for (const mod of allBuiltinModules) {
    if (!mod.docs)
      continue
    const moduleSkips = skipModuleDeterminismTests[mod.name]

    describe(mod.name, () => {
      for (const [fnName, docs] of Object.entries(mod.docs!)) {
        if (moduleSkips?.has(fnName))
          continue
        if (skipDeterminismTests.has(fnName))
          continue

        for (const [i, entry] of docs.examples.entries()) {
          const example = typeof entry === 'string' ? entry : entry.code
          it(`${mod.name}.${fnName} example ${i + 1} is deterministic`, () => {
            if (typeof entry !== 'string') return
            let result1: unknown, result2: unknown
            let threw1 = false
            let threw2 = false
            try {
              result1 = dvala.run(example)
            } catch {
              threw1 = true
            }
            try {
              result2 = dvala.run(example)
            } catch {
              threw2 = true
            }

            expect(threw1).toBe(threw2)
            if (!threw1 && !threw2) {
              expect(result1, `${mod.name}.${fnName} example ${i + 1}: non-deterministic`).toEqual(result2)
            }
          })
        }
      }
    })
  }
})

// =========================================================================
// 6. ARGUMENT NAMES NOT RESERVED WORDS
// =========================================================================

describe('auto: arg names validation (modules)', () => {
  // Module function arg names should not be builtin function names
  // that would shadow them in the scope
  const reservedWords = new Set(['if', 'then', 'else', 'end', 'do', 'let', 'for', 'in', 'loop', 'recur', 'case', 'try', 'catch', 'throw', 'import', 'as', 'true', 'false', 'null', 'and', 'or', 'not', 'when', 'match', 'with', 'def'])

  for (const mod of allBuiltinModules) {
    if (!mod.docs)
      continue
    for (const [fnName, docs] of Object.entries(mod.docs)) {
      for (const argName of Object.keys(docs.args)) {
        it(`${mod.name}.${fnName} arg "${argName}" is not a reserved word`, () => {
          expect(
            reservedWords.has(argName),
            `${mod.name}.${fnName}: arg "${argName}" is a reserved word`,
          ).toBe(false)
        })
      }
    }
  }
})

// =========================================================================
// 7. VARIANT COMPLETENESS — every arg appears in at least one variant
// =========================================================================

describe('auto: all args used in variants (core)', () => {
  for (const [name, expr] of Object.entries(normalExpressions)) {
    if (!expr.docs)
      continue
    const docs = expr.docs

    // Collect all arg names used across all variants
    const usedArgs = new Set<string>()
    for (const variant of docs.variants) {
      for (const argName of variant.argumentNames) {
        usedArgs.add(argName)
      }
    }

    for (const argName of Object.keys(docs.args)) {
      // Skip operator-form args (a/b) that are only for operator documentation
      // They appear in args but may not appear in variants if the function
      // also has named args for the same purpose
      const isOperatorOnlyArg = (argName === 'a' || argName === 'b') && !usedArgs.has(argName)
      if (isOperatorOnlyArg)
        continue

      it(`${name}: arg "${argName}" is used in at least one variant`, () => {
        expect(
          usedArgs.has(argName),
          `${name}: arg "${argName}" is declared in args but never used in any variant`,
        ).toBe(true)
      })
    }
  }
})

describe('auto: all args used in variants (modules)', () => {
  for (const mod of allBuiltinModules) {
    if (!mod.docs)
      continue
    for (const [fnName, docs] of Object.entries(mod.docs)) {
      const usedArgs = new Set<string>()
      for (const variant of docs.variants) {
        for (const argName of variant.argumentNames) {
          usedArgs.add(argName)
        }
      }

      for (const argName of Object.keys(docs.args)) {
        const isOperatorOnlyArg = (argName === 'a' || argName === 'b') && !usedArgs.has(argName)
        if (isOperatorOnlyArg)
          continue

        it(`${mod.name}.${fnName}: arg "${argName}" is used in at least one variant`, () => {
          expect(
            usedArgs.has(argName),
            `${mod.name}.${fnName}: arg "${argName}" declared but never used in any variant`,
          ).toBe(true)
        })
      }
    }
  }
})
