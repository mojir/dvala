import { describe, expect, it, test } from 'vitest'
import {
  allReference,
  apiReference,
  getLinkName,
  isCustomReference,
  isDatatypeReference,
  isEffectReference,
  isFunctionReference,
  isShorthandReference,
  moduleReference,
  normalExpressionReference,
} from '../reference'
import { normalExpressionKeys, specialExpressionKeys, specialExpressions } from '../src/builtin'
import { isUnknownRecord } from '../src/typeGuards'
import { canBeOperator } from '../src/utils/arity'
import { normalExpressions } from '../src/builtin/normalExpressions'
import { isReservedSymbol } from '../src/tokenizer/reservedNames'
import { createDvala } from '../src/createDvala'
import { allBuiltinModules } from '../src/allModules'
import { MODULE_DESCRIPTION_MAX_LENGTH } from '../src/builtin/modules/interface'
import { specialExpressionTypes } from '../src/builtin/specialExpressionTypes'
import { type ApiName, categories } from '../reference/api'
import '../src/initReferenceData'
import { getExamples, chapters } from '../reference/book'
import type { HandlerRegistration } from '../src/evaluator/effectTypes'
import type { Any } from '../src/interface'

const corePageExamples = [
  '1 + 2 + 3',
  'upperCase("hello, world!")',
  'map([1, 2, 3], inc)',
  'if 3 > 2 then "yes" else "no" end',
]

const moduleExamples = [
  'let { dot } = import("linearAlgebra");\ndot([1, 2, 3], [4, 5, 6])',
  'let lin = import("linearAlgebra");\n{\n "Cross product": lin.cross([1, 0, 0], [0, 1, 0]),\n  "Distance": lin.euclideanDistance([1, 1], [4, 5])\n}',
]

const dvala = createDvala({ modules: allBuiltinModules })
describe('apiReference', () => {
  Object.entries(apiReference).forEach(([key, obj]) => {
    if (!isFunctionReference(obj)) return
    it(key, () => {
      expect(obj.title).toBe(key)
      expect(obj.description.length).toBeGreaterThanOrEqual(1)
      expect(obj.returns.type.length).toBeGreaterThanOrEqual(1)
      expect(obj.description[obj.description.length - 1]).toBe('.')

      expect(obj.examples.length).toBeGreaterThan(0)
      expect(isUnknownRecord(obj.args)).toBe(true)
      if (normalExpressionKeys.includes(key)) expect(obj.category).not.toBe('special-expression')
      else if (specialExpressionKeys.includes(key)) expect(obj.category).toBe('special-expression')
      else throw new Error(`${key} is not a builtin function`)
    })
  })

  it('unique linkNames', () => {
    const linkNames = Object.values(apiReference).map(obj => getLinkName(obj))
    const linkNameSet = new Set(linkNames)
    linkNameSet.forEach(linkName => linkNames.splice(linkNames.indexOf(linkName), 1))
    expect(linkNames).toEqual([])
  })

  it('everything documented', () => {
    const functionReferenceKeys = Object.entries(apiReference)
      .filter(([, obj]) => isFunctionReference(obj))
      .map(([key]) => key)

    const allReferenceKeys = functionReferenceKeys.filter(key => !specialExpressionKeys.includes(key))

    const builtinKeys = [...normalExpressionKeys]
    const missingReference = allReferenceKeys.find(key => !builtinKeys.includes(key))
    expect(missingReference, `Missing reference: ${missingReference}`).toBeUndefined()

    const missingImplementation = builtinKeys.find(key => !allReferenceKeys.includes(key))
    expect(missingImplementation, `Missing application: ${missingImplementation}`).toBeUndefined()
  })

  describe('argument names', () => {
    const allBuiltins = [...normalExpressionKeys, ...specialExpressionKeys]
    Object.entries(apiReference).forEach(([key, obj]) => {
      if (!isFunctionReference(obj)) return
      test(key, () => {
        const variants = obj.variants
        variants.forEach(variant => {
          const argumentNames = variant.argumentNames
          argumentNames.forEach(argName => {
            expect(
              isReservedSymbol(argName) || allBuiltins.includes(argName),
              `${key} in ${obj.category} has invalid argument name ${argName}`,
            ).toBe(false)
          })
        })
      })
    })
  })

  describe('examples', () => {
    Object.entries(apiReference).forEach(([key, obj]) => {
      test(key, () => {
        obj.examples.forEach((entry, index) => {
          const example = typeof entry === 'string' ? entry : entry.code
          expect(example, `${obj.category}:${key}. Example number ${index + 1} ended with ;`).not.toMatch(/;\s*$/)
          if (typeof entry === 'string' || !('noRun' in entry)) {
            if (typeof entry !== 'string' && 'throws' in entry)
              expect(() => dvala.run(example), `${obj.category}:${key}. Example number ${index + 1}`).toThrow()
            else expect(() => dvala.run(example), `${obj.category}:${key}. Example number ${index + 1}`).not.toThrow()
          }
        })
      })
    })
  })

  describe('typecheck examples', () => {
    const typecheckDvala = createDvala({ modules: allBuiltinModules, typecheck: false })
    Object.entries(apiReference).forEach(([key, obj]) => {
      test(key, () => {
        obj.examples.forEach((entry, index) => {
          // Skip examples marked noCheck (typechecker limitations)
          if (typeof entry !== 'string' && 'noCheck' in entry) return
          const example = typeof entry === 'string' ? entry : entry.code
          const result = typecheckDvala.typecheck(example)
          // Only errors are blocking — fold-generated warnings (e.g.
          // `@dvala.error` on a compile-time-provable failure like
          // `assert(0, ...)`) are advisory and expected when DVALA_FOLD=1.
          const errors = result.diagnostics.filter(d => d.severity === 'error')
          expect(
            errors,
            `${obj.category}:${key} example ${index + 1}: ${errors.map(d => d.message).join(', ')}`,
          ).toHaveLength(0)
        })
      })
    })
  })

  describe('operator functions', () => {
    Object.entries(normalExpressionReference).forEach(([key, obj]) => {
      test(key, () => {
        const arity = normalExpressions[key]!.arity
        if (canBeOperator(arity) && !obj.noOperatorDocumentation) {
          expect(obj.args.a, `${obj.category} - ${key} is missing "a" arg`).toBeDefined()
          expect(obj.args.b, `${obj.category} - ${key} is missing "b" arg`).toBeDefined()
        }
      })
    })
  })
})

describe('seeAlso', () => {
  it('if A references B in seeAlso, then B must reference A', () => {
    const asymmetric: string[] = []
    for (const [key, ref] of Object.entries(allReference)) {
      if (!('seeAlso' in ref) || !ref.seeAlso) {
        continue
      }
      // Effects have one-way seeAlso (referencing special expressions)
      if (isEffectReference(ref)) {
        continue
      }
      for (const target of ref.seeAlso) {
        const targetRef = allReference[target]
        if (!targetRef) {
          continue // missing target is caught by other tests
        }
        if (!('seeAlso' in targetRef) || !targetRef.seeAlso || !targetRef.seeAlso.includes(key as ApiName)) {
          asymmetric.push(`${key} -> ${target} (but ${target} does not link back)`)
        }
      }
    }
    expect(asymmetric, `Asymmetric seeAlso:\n${asymmetric.join('\n')}`).toEqual([])
  })

  it('all seeAlso entries point to entries that exist in allReference', () => {
    const invalidRefs: string[] = []
    for (const [key, ref] of Object.entries(allReference)) {
      if ('seeAlso' in ref && ref.seeAlso) {
        for (const sa of ref.seeAlso) {
          if (!(sa in allReference)) {
            invalidRefs.push(`${key} -> ${sa}`)
          }
        }
      }
    }
    expect(invalidRefs, `Invalid seeAlso refs: ${invalidRefs.join(', ')}`).toEqual([])
  })
})

describe('module descriptions', () => {
  for (const mod of allBuiltinModules) {
    it(`${mod.name} description within ${MODULE_DESCRIPTION_MAX_LENGTH} chars`, () => {
      expect(mod.description).toBeTruthy()
      expect(mod.description.length).toBeLessThanOrEqual(MODULE_DESCRIPTION_MAX_LENGTH)
    })
  }
})

describe('moduleReference', () => {
  describe('examples', () => {
    Object.entries(moduleReference).forEach(([key, obj]) => {
      test(key, () => {
        obj.examples.forEach((entry, index) => {
          const example = typeof entry === 'string' ? entry : entry.code
          expect(example, `${obj.category}:${key}. Example number ${index + 1} ended with ;`).not.toMatch(/;\s*$/)
          if (typeof entry === 'string' || !('noRun' in entry)) {
            if (typeof entry !== 'string' && 'throws' in entry)
              expect(() => dvala.run(example), `${obj.category}:${key}. Example number ${index + 1}`).toThrow()
            else expect(() => dvala.run(example), `${obj.category}:${key}. Example number ${index + 1}`).not.toThrow()
          }
        })
      })
    })
  })
})

describe('no orphaned reference data', () => {
  it('every documented special expression has a reference entry', () => {
    const docNames: string[] = []
    for (const [name, type] of Object.entries(specialExpressionTypes)) {
      if (specialExpressions[type as keyof typeof specialExpressions]?.docs) docNames.push(name)
    }
    const missing = docNames.filter(n => !(n in allReference))
    expect(missing, `Special expressions missing from allReference: ${missing.join(', ')}`).toEqual([])
  })

  it('every module function has a reference entry in allReference', () => {
    const missing: string[] = []
    for (const module of allBuiltinModules) {
      for (const key of Object.keys(module.functions)) {
        const qualifiedKey = `${module.name}.${key}`
        if (!(qualifiedKey in allReference)) {
          missing.push(qualifiedKey)
        }
      }
    }
    expect(missing, `Module functions missing from allReference: ${missing.join(', ')}`).toEqual([])
  })
})

describe('no duplicate function names', () => {
  it('all function names are unique across core and all modules', () => {
    const duplicates: string[] = []
    const seen = new Map<string, string>()

    for (const key of Object.keys(normalExpressions)) {
      seen.set(key, 'core')
    }

    for (const key of specialExpressionKeys) {
      if (seen.has(key)) {
        duplicates.push(`"${key}" in core (special) conflicts with core (normal)`)
      }
      seen.set(key, 'core')
    }

    for (const module of allBuiltinModules) {
      for (const key of Object.keys(module.functions)) {
        if (seen.has(key)) {
          duplicates.push(`"${key}" in ${module.name} conflicts with ${seen.get(key)}`)
        }
        seen.set(key, module.name)
      }
    }

    expect(duplicates, `Duplicate function names:\n${duplicates.join('\n')}`).toEqual([])
  })
})

describe('core and module categories', () => {
  it('module categories are a subset of all categories', () => {
    const nsCategories = Array.from(new Set(Object.values(moduleReference).map(r => r.category)))
    for (const cat of nsCategories) {
      expect(categories).toContain(cat)
    }
  })
})

describe('allReference type consistency', () => {
  it('every FunctionReference has returns, args, and variants', () => {
    for (const [key, ref] of Object.entries(allReference)) {
      if (isFunctionReference(ref)) {
        expect(ref.returns, `"${key}" returns`).toBeDefined()
        expect(ref.args, `"${key}" args`).toBeDefined()
        expect(Array.isArray(ref.variants), `"${key}" variants`).toBe(true)
      }
    }
  })

  it('every CustomReference has customVariants', () => {
    for (const [key, ref] of Object.entries(allReference)) {
      if (isCustomReference(ref)) {
        expect(Array.isArray(ref.customVariants), `"${key}" customVariants`).toBe(true)
      }
    }
  })

  it('every ShorthandReference has shorthand: true', () => {
    for (const [key, ref] of Object.entries(allReference)) {
      if (isShorthandReference(ref)) {
        expect(ref.shorthand, `"${key}" shorthand`).toBe(true)
      }
    }
  })

  it('every DatatypeReference has datatype: true', () => {
    for (const [key, ref] of Object.entries(allReference)) {
      if (isDatatypeReference(ref)) {
        expect(ref.datatype, `"${key}" datatype`).toBe(true)
      }
    }
  })

  it('every reference has title, category, description, and examples', () => {
    for (const [key, ref] of Object.entries(allReference)) {
      expect(typeof ref.title, `"${key}" title`).toBe('string')
      expect(ref.title.length, `"${key}" title is empty`).toBeGreaterThan(0)
      expect(typeof ref.category, `"${key}" category`).toBe('string')
      expect(typeof ref.description, `"${key}" description`).toBe('string')
      expect(Array.isArray(ref.examples), `"${key}" examples`).toBe(true)
    }
  })
})

describe('corePageExamples', () => {
  corePageExamples.forEach((example, index) => {
    it(`example ${index + 1}: ${example}`, () => {
      expect(() => dvala.run(example), `Core page example ${index + 1}`).not.toThrow()
    })
  })
})

describe('modulePageExamples', () => {
  moduleExamples.forEach((example, index) => {
    it(`example ${index + 1}: ${example}`, () => {
      expect(() => dvala.run(example), `Module page example ${index + 1}`).not.toThrow()
    })
  })
})

describe('chapterExamples', () => {
  // Effect handlers for running chapter examples
  // Interactive effects resume with mock values, others pass through
  const testHandlers: HandlerRegistration[] = [
    { pattern: 'dvala.io.read', handler: ctx => ctx.resume('test-input') },
    { pattern: 'dvala.io.pick', handler: ctx => ctx.resume((ctx.arg as Any[])[0]!) },
    { pattern: 'dvala.io.confirm', handler: ctx => ctx.resume(true) },
    { pattern: 'dvala.io.readStdin', handler: ctx => ctx.resume('') },
    { pattern: '*', handler: ctx => ctx.next() },
  ]

  chapters.forEach(chapter => {
    describe(chapter.title, () => {
      getExamples(chapter).forEach(({ lines, throws }, index) => {
        const example = lines.join('\n')
        it(`example ${index + 1}: ${example}`, () => {
          if (throws)
            expect(
              () => dvala.run(example, { effectHandlers: testHandlers }),
              `${chapter.title} example ${index + 1}`,
            ).toThrow()
          else
            expect(
              () => dvala.run(example, { effectHandlers: testHandlers }),
              `${chapter.title} example ${index + 1}`,
            ).not.toThrow()
        })
      })
    })
  })
})

describe('chapter IDs', () => {
  it('should have unique IDs across all chapters', () => {
    const ids = chapters.map(t => t.id)
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
    expect(duplicates, `Duplicate chapter IDs found: ${duplicates.join(', ')}`).toEqual([])
  })
})
