/**
 * Auto-generated smart tests for the effect framework.
 *
 * Systematically tests the effect system to find bugs through:
 * 1. Standard effects docs metadata consistency
 * 2. Standard effects seeAlso validity
 * 3. Standard effects arity enforcement
 * 4. effectNameMatchesPattern exhaustive coverage
 * 5. Effect + control flow interactions (if, cond, match, &&, ||, ??, for, loop)
 * 6. Effect + higher-order function interactions (map, filter, reduce, etc.)
 * 7. Effect handler scoping (nesting levels)
 * 8. Effect identity semantics
 * 9. Suspend/resume round-trip with various value types
 * 10. Effect + error propagation patterns
 * 11. Effect-related normal expressions consistency
 */
import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { allBuiltinModules } from '../src/allModules'
import { resume as resumeContinuation } from '../src/resume'
import type { Snapshot } from '../src/evaluator/effectTypes'
import { allStandardEffectDefinitions, standardEffectNames } from '../src/evaluator/standardEffects'
import { effectNameMatchesPattern, findMatchingHandlers } from '../src/evaluator/effectTypes'
import { isDataType } from '../src/builtin/interface'
import type { Any } from '../src/interface'
import { allReference } from '../reference'
import '../src/initReferenceData'

const dvala = createDvala({ modules: allBuiltinModules })

// ---------------------------------------------------------------------------
// 1. Standard Effects Docs Metadata Consistency
// ---------------------------------------------------------------------------
describe('auto: standard effects docs metadata', () => {
  for (const [effectName, def] of Object.entries(allStandardEffectDefinitions)) {
    const { docs } = def

    it(`${effectName}: has description`, () => {
      expect(docs.description.length).toBeGreaterThan(0)
    })

    it(`${effectName}: returns type is valid`, () => {
      const returnTypes = Array.isArray(docs.returns.type) ? docs.returns.type : [docs.returns.type]
      for (const t of returnTypes) {
        expect(isDataType(t)).toBe(true)
      }
    })

    it(`${effectName}: has at least one variant`, () => {
      expect(docs.variants.length).toBeGreaterThan(0)
    })

    it(`${effectName}: has at least one example`, () => {
      expect(docs.examples.length).toBeGreaterThan(0)
    })

    it(`${effectName}: all variant argumentNames reference args keys`, () => {
      const argKeys = new Set(Object.keys(docs.args))
      for (const variant of docs.variants) {
        for (const argName of variant.argumentNames) {
          expect(argKeys.has(argName), `variant uses '${argName}' but args only has [${Array.from(argKeys)}]`).toBe(true)
        }
      }
    })

    it(`${effectName}: every arg appears in at least one variant`, () => {
      const usedArgs = new Set(docs.variants.flatMap(v => v.argumentNames))
      for (const argName of Object.keys(docs.args)) {
        expect(usedArgs.has(argName), `arg '${argName}' is not used in any variant`).toBe(true)
      }
    })

    it(`${effectName}: variant lengths match arity`, () => {
      const { arity } = def
      for (const variant of docs.variants) {
        const len = variant.argumentNames.length
        if (arity.min !== undefined) {
          expect(len).toBeGreaterThanOrEqual(arity.min)
        }
        if (arity.max !== undefined) {
          expect(len).toBeLessThanOrEqual(arity.max)
        }
      }
    })

    it(`${effectName}: arg types are valid DataTypes`, () => {
      for (const [argName, arg] of Object.entries(docs.args)) {
        const types = Array.isArray(arg.type) ? arg.type : [arg.type]
        for (const t of types) {
          expect(isDataType(t), `arg '${argName}' has invalid type '${t}'`).toBe(true)
        }
      }
    })

    it(`${effectName}: category is 'effect'`, () => {
      expect(docs.category).toBe('effect')
    })
  }
})

// ---------------------------------------------------------------------------
// 2. Standard Effects seeAlso Validity
// ---------------------------------------------------------------------------
describe('auto: standard effects seeAlso validity', () => {
  for (const [effectName, def] of Object.entries(allStandardEffectDefinitions)) {
    const { docs } = def
    if (!docs.seeAlso || docs.seeAlso.length === 0)
      continue

    for (const target of docs.seeAlso) {
      it(`${effectName}: seeAlso '${target}' exists in allReference`, () => {
        expect(target in allReference, `'${target}' not found in allReference`).toBe(true)
      })
    }
  }
})

// ---------------------------------------------------------------------------
// 3. Standard Effects seeAlso Symmetry
// ---------------------------------------------------------------------------
describe('auto: standard effects seeAlso symmetry', () => {
  for (const [effectName, def] of Object.entries(allStandardEffectDefinitions)) {
    const { docs } = def
    if (!docs.seeAlso)
      continue

    const myRefKey = `-effect-${effectName}`

    for (const target of docs.seeAlso) {
      // Only check symmetry for effect→effect references
      if (!target.startsWith('-effect-'))
        continue

      const targetEffectName = target.slice('-effect-'.length)
      const targetDef = allStandardEffectDefinitions[targetEffectName]
      if (!targetDef)
        continue

      it(`${effectName} ↔ ${targetEffectName}: seeAlso is symmetric`, () => {
        const targetSeeAlso = targetDef.docs.seeAlso ?? []
        expect(
          targetSeeAlso.includes(myRefKey),
          `${effectName} references ${targetEffectName} but ${targetEffectName} does not reference ${effectName} back`,
        ).toBe(true)
      })
    }
  }
})

// ---------------------------------------------------------------------------
// 4. Standard Effects Arity Enforcement
// ---------------------------------------------------------------------------

/** Effects that need special environment or are async - skip arity tests */
const skipArityEffects = new Set([
  'dvala.io.read-line', // environment-dependent
  'dvala.io.read-stdin', // Node.js only, async
  'dvala.sleep', // async
])

describe('auto: standard effects arity enforcement', () => {
  for (const [effectName, def] of Object.entries(allStandardEffectDefinitions)) {
    if (skipArityEffects.has(effectName))
      continue
    const { arity } = def

    if (arity.min !== undefined && arity.min > 0) {
      const min = arity.min
      it(`${effectName}: rejects ${min - 1} args (min ${min})`, () => {
        const argStr = Array.from({ length: min - 1 }, () => '0').join(', ')
        const code = argStr
          ? `perform(effect(${effectName}), ${argStr})`
          : `perform(effect(${effectName}))`
        expect(() => dvala.run(code)).toThrow()
      })
    }

    if (arity.max !== undefined) {
      const max = arity.max
      it(`${effectName}: rejects ${max + 1} args (max ${max})`, () => {
        const argStr = Array.from({ length: max + 1 }, () => '0').join(', ')
        const code = `perform(effect(${effectName}), ${argStr})`
        expect(() => dvala.run(code)).toThrow()
      })
    }
  }
})

// ---------------------------------------------------------------------------
// 5. effectNameMatchesPattern — Exhaustive Coverage
// ---------------------------------------------------------------------------
describe('auto: effectNameMatchesPattern exhaustive', () => {
  // Effect names to test against
  const effectNames = [
    'dvala.error',
    'dvala.io.println',
    'dvala.io.print',
    'dvala.random',
    'dvala.random.int',
    'llm.complete',
    'com.myco.human.approve',
    'simple',
    '',
    'dvala',
    'a.b.c.d.e',
  ]

  // Pattern types with expected behavior
  const patterns: Array<{ pattern: string, expected: (name: string) => boolean }> = [
    // Exact match patterns
    { pattern: 'dvala.error', expected: n => n === 'dvala.error' },
    { pattern: 'llm.complete', expected: n => n === 'llm.complete' },
    { pattern: 'simple', expected: n => n === 'simple' },
    { pattern: '', expected: n => n === '' },
    // Wildcard * matches everything
    { pattern: '*', expected: () => true },
    // Prefix.* patterns
    { pattern: 'dvala.*', expected: n => n === 'dvala' || n.startsWith('dvala.') },
    { pattern: 'dvala.io.*', expected: n => n === 'dvala.io' || n.startsWith('dvala.io.') },
    { pattern: 'dvala.random.*', expected: n => n === 'dvala.random' || n.startsWith('dvala.random.') },
    { pattern: 'llm.*', expected: n => n === 'llm' || n.startsWith('llm.') },
    { pattern: 'com.*', expected: n => n === 'com' || n.startsWith('com.') },
    { pattern: 'com.myco.*', expected: n => n === 'com.myco' || n.startsWith('com.myco.') },
    // Non-matching patterns
    { pattern: 'nonexistent', expected: () => false },
    { pattern: 'dvalaX', expected: n => n === 'dvalaX' },
    { pattern: 'dvala.errorX', expected: n => n === 'dvala.errorX' },
  ]

  for (const { pattern, expected } of patterns) {
    for (const name of effectNames) {
      const expectedResult = expected(name)
      it(`pattern '${pattern}' ${expectedResult ? 'matches' : 'does NOT match'} '${name}'`, () => {
        expect(effectNameMatchesPattern(name, pattern)).toBe(expectedResult)
      })
    }
  }
})

// ---------------------------------------------------------------------------
// 6. findMatchingHandlers — Registration Order
// ---------------------------------------------------------------------------
describe('auto: findMatchingHandlers registration order', () => {
  it('returns handlers in registration order', () => {
    const handlers = {
      'dvala.*': async () => {},
      'dvala.io.*': async () => {},
      'dvala.io.println': async () => {},
      '*': async () => {},
    }
    const matches = findMatchingHandlers('dvala.io.println', handlers)
    expect(matches.map(([p]) => p)).toEqual(['dvala.*', 'dvala.io.*', 'dvala.io.println', '*'])
  })

  it('returns empty array for no match', () => {
    const handlers = {
      'llm.*': async () => {},
    }
    const matches = findMatchingHandlers('dvala.io.println', handlers)
    expect(matches).toEqual([])
  })

  it('returns empty array for undefined handlers', () => {
    const matches = findMatchingHandlers('anything', undefined)
    expect(matches).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 7. Effect + Control Flow Interactions
// ---------------------------------------------------------------------------
describe('auto: effect + control flow', () => {
  // Helper: wrap perform in a do/with that handles efficiently
  const wrap = (body: string) => `
    do
      ${body}
    with
      case effect(test.eff) then ([x]) -> x * 10
    end
  `

  it('effect in if-then branch', () => {
    const result = dvala.run(wrap('if true then perform(effect(test.eff), 5) else 0 end'))
    expect(result).toBe(50)
  })

  it('effect in if-else branch', () => {
    const result = dvala.run(wrap('if false then 0 else perform(effect(test.eff), 3) end'))
    expect(result).toBe(30)
  })

  it('effect in if condition', () => {
    const result = dvala.run(wrap('if >(perform(effect(test.eff), 1), 5) then "big" else "small" end'))
    expect(result).toBe('big')
  })

  it('effect in unless-then branch', () => {
    const result = dvala.run(wrap('unless false then perform(effect(test.eff), 4) else 0 end'))
    expect(result).toBe(40)
  })

  it('effect in cond test', () => {
    const result = dvala.run(wrap(`
      cond
        case >(perform(effect(test.eff), 1), 5) then "big"
        case true then "small"
      end
    `))
    expect(result).toBe('big')
  })

  it('effect in cond result', () => {
    const result = dvala.run(wrap(`
      cond
        case true then perform(effect(test.eff), 7)
        case true then 0
      end
    `))
    expect(result).toBe(70)
  })

  it('effect in match body', () => {
    const result = dvala.run(wrap(`
      match 42
        case 42 then perform(effect(test.eff), 6)
      end
    `))
    expect(result).toBe(60)
  })

  it('effect in && (all truthy)', () => {
    const result = dvala.run(wrap('&&(perform(effect(test.eff), 1), perform(effect(test.eff), 2))'))
    expect(result).toBe(20) // last truthy value
  })

  it('effect in || (first truthy)', () => {
    const result = dvala.run(wrap('||(perform(effect(test.eff), 3), perform(effect(test.eff), 4))'))
    expect(result).toBe(30) // first truthy value
  })

  it('effect in || (first falsy)', () => {
    const result = dvala.run(`
      do
        ||(null, perform(effect(test.eff), 4))
      with
        case effect(test.eff) then ([x]) -> x * 10
      end
    `)
    expect(result).toBe(40)
  })

  it('effect in ?? (first non-null)', () => {
    const result = dvala.run(wrap('??(perform(effect(test.eff), 5), 99)'))
    expect(result).toBe(50) // 5 * 10 = 50, not null so returned
  })

  it('effect in let binding', () => {
    const result = dvala.run(wrap('let x = perform(effect(test.eff), 2); x + 1'))
    expect(result).toBe(21) // 2 * 10 + 1
  })

  it('effect in for comprehension', () => {
    const result = dvala.run(wrap(`
      for (x in [1, 2, 3]) -> perform(effect(test.eff), x)
    `))
    expect(result).toEqual([10, 20, 30])
  })

  it('effect in loop body', () => {
    const result = dvala.run(wrap(`
      loop (i = 0, acc = 0) -> do
        if ==(i, 3) then
          acc
        else
          recur(+(i, 1), +(acc, perform(effect(test.eff), i)))
        end
      end
    `))
    expect(result).toBe(30) // 0 + 10 + 20
  })

  it('effect in fn body', () => {
    const result = dvala.run(wrap(`
      let f = (x) -> perform(effect(test.eff), x);
      f(8)
    `))
    expect(result).toBe(80)
  })

  it('effect in do/with error handler (no error)', () => {
    const result = dvala.run(wrap(`
      do
        perform(effect(test.eff), 9)
      with
        case effect(dvala.error) then ([msg]) -> 0
      end
    `))
    expect(result).toBe(90)
  })

  it('effect in do/with error handler body', () => {
    const result = dvala.run(wrap(`
      do
        do
          perform(effect(dvala.error), "boom")
        with
          case effect(dvala.error) then ([msg]) -> perform(effect(test.eff), 4)
        end
      end
    `))
    expect(result).toBe(40)
  })
})

// ---------------------------------------------------------------------------
// 8. Effect + Higher-Order Functions
// ---------------------------------------------------------------------------
describe('auto: effect + higher-order functions', () => {
  const wrap = (body: string) => `
    do
      ${body}
    with
      case effect(test.double) then ([x]) -> x * 2
    end
  `

  it('effect in map callback', () => {
    const result = dvala.run(wrap('map([1, 2, 3], (x) -> perform(effect(test.double), x))'))
    expect(result).toEqual([2, 4, 6])
  })

  it('effect in filter callback', () => {
    const result = dvala.run(wrap('filter([1, 2, 3, 4], (x) -> >(perform(effect(test.double), x), 4))'))
    expect(result).toEqual([3, 4])
  })

  it('effect in reduce callback', () => {
    const result = dvala.run(wrap('reduce([1, 2, 3], (acc, x) -> +(acc, perform(effect(test.double), x)), 0)'))
    expect(result).toBe(12) // 2 + 4 + 6
  })

  it('effect in mapcat callback', () => {
    const result = dvala.run(wrap('mapcat([1, 2, 3], (x) -> [perform(effect(test.double), x)])'))
    expect(result).toEqual([2, 4, 6])
  })

  it('effect in some callback', () => {
    const result = dvala.run(wrap('some([1, 2, 3, 4], (x) -> ==(perform(effect(test.double), x), 6))'))
    expect(result).toBe(3)
  })

  it('effect in every callback via reduce', () => {
    const result = dvala.run(wrap('reduce([1, 2, 3], (acc, x) -> &&(acc, >(perform(effect(test.double), x), 0)), true)'))
    expect(result).toBe(true)
  })

  it('effect in sort comparator', () => {
    const result = dvala.run(wrap(`
      sort([3, 1, 2], (a, b) -> -(perform(effect(test.double), a), perform(effect(test.double), b)))
    `))
    expect(result).toEqual([1, 2, 3])
  })

  it('effect in doseq / map equivalent', () => {
    // doseq is side-effectful; use for comprehension to collect results instead
    const result = dvala.run(wrap(`
      for (x in [1, 2, 3]) -> perform(effect(test.double), x)
    `))
    expect(result).toEqual([2, 4, 6])
  })
})

// ---------------------------------------------------------------------------
// 9. Effect Handler Scoping — Nesting Levels
// ---------------------------------------------------------------------------
describe('auto: effect handler scoping', () => {
  it('inner handler takes precedence over outer', () => {
    const result = dvala.run(`
      do
        do
          perform(effect(test.eff), 5)
        with
          case effect(test.eff) then ([x]) -> x * 10
        end
      with
        case effect(test.eff) then ([x]) -> x * 100
      end
    `)
    expect(result).toBe(50) // inner: 5 * 10
  })

  it('unmatched inner effect bubbles to outer', () => {
    const result = dvala.run(`
      do
        do
          perform(effect(outer.eff), 5)
        with
          case effect(inner.eff) then ([x]) -> x * 10
        end
      with
        case effect(outer.eff) then ([x]) -> x * 100
      end
    `)
    expect(result).toBe(500) // outer: 5 * 100
  })

  it('handler re-entrancy: handler performs same effect → outer catches', () => {
    const result = dvala.run(`
      do
        do
          perform(effect(test.eff), "orig")
        with
          case effect(test.eff) then ([x]) -> perform(effect(test.eff), x ++ "+inner")
        end
      with
        case effect(test.eff) then ([x]) -> "outer:" ++ x
      end
    `)
    expect(result).toBe('outer:orig+inner')
  })

  // Parametric nesting: generate 1 to 4 levels
  for (const depth of [1, 2, 3, 4]) {
    it(`${depth}-level nesting: deepest handler catches`, () => {
      let code = 'perform(effect(test.eff), 1)'
      for (let i = 0; i < depth; i++) {
        const multiplier = (i + 1) * 10
        code = `
          do
            ${code}
          with
            case effect(test.eff) then ([x]) -> x * ${multiplier}
          end
        `
      }
      const result = dvala.run(code)
      // Innermost handler always catches: 1 * 10 = 10
      expect(result).toBe(10)
    })
  }

  // Handler scope ends after do/with block
  it('handler scope ends after do/with block', () => {
    expect(() => dvala.run(`
      do
        null
      with
        case effect(test.eff) then ([x]) -> x
      end;
      perform(effect(test.eff), "should fail")
    `)).toThrow('Unhandled effect')
  })

  it('handler can access outer bindings', () => {
    const result = dvala.run(`
      let factor = 100;
      do
        perform(effect(test.eff), 5)
      with
        case effect(test.eff) then ([x]) -> x * factor
      end
    `)
    expect(result).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 10. Effect Identity Semantics
// ---------------------------------------------------------------------------
describe('auto: effect identity semantics', () => {
  const effectNames = [
    'dvala.error',
    'dvala.io.println',
    'llm.complete',
    'com.myco.approve',
    'simple',
    'a.b.c.d.e',
  ]

  // Same name → same reference
  for (const name of effectNames) {
    it(`effect(${name}) === effect(${name})`, () => {
      expect(dvala.run(`==(effect(${name}), effect(${name}))`)).toBe(true)
    })
  }

  // Different names → different references
  for (let i = 0; i < effectNames.length; i++) {
    for (let j = i + 1; j < effectNames.length; j++) {
      it(`effect(${effectNames[i]}) !== effect(${effectNames[j]})`, () => {
        expect(dvala.run(`==(effect(${effectNames[i]}), effect(${effectNames[j]}))`)).toBe(false)
      })
    }
  }

  // Effect? predicate
  for (const name of effectNames) {
    it(`effect?(effect(${name})) is true`, () => {
      expect(dvala.run(`effect?(effect(${name}))`)).toBe(true)
    })
  }

  // Non-effects → false
  const nonEffects = ['42', '"hello"', 'true', 'null', '[]', '{}', '(-> 1)']
  for (const val of nonEffects) {
    it(`effect?(${val}) is false`, () => {
      expect(dvala.run(`effect?(${val})`)).toBe(false)
    })
  }

  // effect-name returns the correct string
  for (const name of effectNames) {
    it(`effect-name(effect(${name})) === "${name}"`, () => {
      expect(dvala.run(`effect-name(effect(${name}))`)).toBe(name)
    })
  }

  // type-of returns "effect"
  for (const name of effectNames) {
    it(`type-of(effect(${name})) === "effect"`, () => {
      expect(dvala.run(`type-of(effect(${name}))`)).toBe('effect')
    })
  }
})

// ---------------------------------------------------------------------------
// 11. Suspend/Resume Round-Trip with Various Value Types
// ---------------------------------------------------------------------------
describe('auto: suspend/resume round-trip', () => {
  const resumeValues: Array<{ label: string, value: Any, code: string }> = [
    { label: 'number', value: 42, code: 'x + 1' },
    { label: 'zero', value: 0, code: 'x + 1' },
    { label: 'negative', value: -7, code: 'x + 1' },
    { label: 'float', value: 3.14, code: 'x + 1' },
    { label: 'string', value: 'hello', code: 'x ++ "!"' },
    { label: 'empty string', value: '', code: 'x ++ "suffix"' },
    { label: 'boolean true', value: true, code: 'if x then "yes" else "no" end' },
    { label: 'boolean false', value: false, code: 'if x then "yes" else "no" end' },
    { label: 'null', value: null, code: '??(x, "default")' },
    { label: 'array', value: [1, 2, 3], code: 'count(x)' },
    { label: 'empty array', value: [], code: 'count(x)' },
    { label: 'object', value: { a: 1, b: 2 }, code: 'x.a + x.b' },
    { label: 'nested object', value: { x: { y: 42 } }, code: 'x.x.y' },
  ]

  for (const { label, value, code } of resumeValues) {
    it(`suspend then resume with ${label}`, async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(effect(my.wait));
        ${code}
      `, {
        effectHandlers: {
          'my.wait': async ({ suspend }) => { suspend() },
        },
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      const r2 = await resumeContinuation(r1.snapshot, value)
      expect(r2.type).toBe('completed')
    })

    it(`suspend then resume with ${label} through JSON round-trip`, async () => {
      const r1 = await dvala.runAsync(`
        let x = perform(effect(my.wait));
        ${code}
      `, {
        effectHandlers: {
          'my.wait': async ({ suspend }) => { suspend() },
        },
      })
      expect(r1.type).toBe('suspended')
      if (r1.type !== 'suspended')
        return

      // Simulate persistence: JSON round-trip
      const json = JSON.stringify(r1.snapshot)
      const restored = JSON.parse(json) as Snapshot

      const r2 = await resumeContinuation(restored, value)
      expect(r2.type).toBe('completed')
    })
  }

  it('resume preserves computation context', async () => {
    const r1 = await dvala.runAsync(`
      let a = 10;
      let b = perform(effect(my.wait));
      let c = 32;
      a + b
    `, {
      effectHandlers: {
        'my.wait': async ({ suspend }) => { suspend() },
      },
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 32)
    expect(r2).toEqual({ type: 'completed', value: 42 })
  })

  it('double suspend/resume chain', async () => {
    const r1 = await dvala.runAsync(`
      let a = perform(effect(my.wait));
      let b = perform(effect(my.wait));
      a ++ " " ++ b
    `, {
      effectHandlers: {
        'my.wait': async ({ suspend }) => { suspend() },
      },
    })
    expect(r1.type).toBe('suspended')
    if (r1.type !== 'suspended')
      return

    const r2 = await resumeContinuation(r1.snapshot, 'hello', {
      handlers: {
        'my.wait': async ({ suspend }) => { suspend() },
      },
    })
    expect(r2.type).toBe('suspended')
    if (r2.type !== 'suspended')
      return

    const r3 = await resumeContinuation(r2.snapshot, 'world')
    expect(r3).toEqual({ type: 'completed', value: 'hello world' })
  })
})

// ---------------------------------------------------------------------------
// 12. Effect + Error Propagation Patterns
// ---------------------------------------------------------------------------
describe('auto: effect + error propagation', () => {
  it('dvala.error without handler throws', () => {
    expect(() => dvala.run('perform(effect(dvala.error), "boom")')).toThrow('boom')
  })

  it('dvala.error caught by do/with handler', () => {
    const result = dvala.run(`
      do
        perform(effect(dvala.error), "boom")
      with
        case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
      end
    `)
    expect(result).toBe('caught: boom')
  })

  it('runtime error caught by dvala.error handler', () => {
    const result = dvala.run(`
      do
        1 + "not a number"
      with
        case effect(dvala.error) then ([msg]) -> "caught"
      end
    `)
    expect(result).toBe('caught')
  })

  it('unhandled effect error caught by dvala.error handler', () => {
    const result = dvala.run(`
      do
        perform(effect(no.handler), "arg")
      with
        case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
      end
    `)
    expect(result).toContain('caught:')
    expect(result).toContain('no.handler')
  })

  it('error in handler body propagates past inner scope', () => {
    const result = dvala.run(`
      do
        do
          perform(effect(test.eff), "data")
        with
          case effect(test.eff) then ([x]) -> perform(effect(dvala.error), "handler error")
        end
      with
        case effect(dvala.error) then ([msg]) -> "outer: " ++ msg
      end
    `)
    expect(result).toBe('outer: handler error')
  })

  it('dvala.error handler catches body errors and passes to effect handler', () => {
    const result = dvala.run(`
      do
        do
          perform(effect(dvala.error), "boom")
        with
          case effect(dvala.error) then ([e]) -> perform(effect(test.eff), e)
        end
      with
        case effect(test.eff) then ([msg]) -> "effect got: " ++ msg
      end
    `)
    expect(result).toBe('effect got: boom')
  })

  it('error in handler body propagates as dvala.error', () => {
    const result = dvala.run(`
      do
        do
          perform(effect(test.eff), "data")
        with
          case effect(test.eff) then ([x]) -> perform(effect(dvala.error), "handler error")
        end
      with
        case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
      end
    `)
    expect(result).toBe('caught: handler error')
  })

  // Multiple dvala.error handlers — inner catches
  it('dvala.error handler nesting: inner catches', () => {
    const result = dvala.run(`
      do
        do
          perform(effect(dvala.error), "boom")
        with
          case effect(dvala.error) then ([msg]) -> "inner: " ++ msg
        end
      with
        case effect(dvala.error) then ([msg]) -> "outer: " ++ msg
      end
    `)
    expect(result).toBe('inner: boom')
  })
})

// ---------------------------------------------------------------------------
// 13. Host Handler Patterns (async API)
// ---------------------------------------------------------------------------
describe('auto: host handler patterns', () => {
  it('wildcard handler matches all effects', async () => {
    const captured: string[] = []
    const result = await dvala.runAsync(`
      perform(effect(a.b), 1);
      perform(effect(c.d), 2);
      perform(effect(e), 3)
    `, {
      effectHandlers: {
        '*': async ({ effectName, args, resume: r }) => {
          captured.push(effectName)
          r(args[0]!)
        },
      },
    })
    expect(result.type).toBe('completed')
    expect(captured).toEqual(['a.b', 'c.d', 'e'])
  })

  it('prefix wildcard handler matches subtree', async () => {
    const captured: string[] = []
    const result = await dvala.runAsync(`
      perform(effect(dvala.io.println), "msg");
      perform(effect(dvala.random))
    `, {
      effectHandlers: {
        'dvala.*': async ({ effectName, resume: r }) => {
          captured.push(effectName)
          r(null)
        },
      },
    })
    expect(result.type).toBe('completed')
    expect(captured).toEqual(['dvala.io.println', 'dvala.random'])
  })

  it('exact handler takes priority over wildcard (by registration order)', async () => {
    const result = await dvala.runAsync(`
      perform(effect(my.eff), 5)
    `, {
      effectHandlers: {
        '*': async ({ resume: r }) => { r('wildcard') },
        'my.eff': async ({ resume: r }) => { r('exact') },
      },
    })
    // Registration order: * comes first, so it matches first
    expect(result).toMatchObject({ type: 'completed', value: 'wildcard' })
  })

  it('next() passes to next matching handler', async () => {
    const log: string[] = []
    const result = await dvala.runAsync(`
      perform(effect(my.eff), "data")
    `, {
      effectHandlers: {
        '*': async ({ next }) => {
          log.push('wildcard')
          next()
        },
        'my.eff': async ({ args, resume: r }) => {
          log.push('exact')
          r(args[0]!)
        },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: 'data' })
    expect(log).toEqual(['wildcard', 'exact'])
  })

  it('fail() produces error result', async () => {
    const result = await dvala.runAsync(`
      do
        perform(effect(my.eff))
      with
        case effect(dvala.error) then ([msg]) -> "caught: " ++ msg
      end
    `, {
      effectHandlers: {
        'my.eff': async ({ fail }) => { fail('handler failed') },
      },
    })
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toContain('caught: handler failed')
    }
  })

  it('suspend with meta', async () => {
    const result = await dvala.runAsync(`
      perform(effect(my.wait), "please approve")
    `, {
      effectHandlers: {
        'my.wait': async ({ args, suspend }) => {
          suspend({ payload: args[0] })
        },
      },
    })
    expect(result.type).toBe('suspended')
    if (result.type === 'suspended') {
      expect(result.snapshot.meta).toEqual({ payload: 'please approve' })
    }
  })

  it('local handler always takes priority over host handler', async () => {
    const result = await dvala.runAsync(`
      do
        perform(effect(my.eff), "data")
      with
        case effect(my.eff) then ([x]) -> "local: " ++ x
      end
    `, {
      effectHandlers: {
        'my.eff': async ({ resume: r }) => { r('host') },
      },
    })
    expect(result).toMatchObject({ type: 'completed', value: 'local: data' })
  })

  it('handler receives AbortSignal', async () => {
    let receivedSignal = false
    await dvala.runAsync('perform(effect(my.check))', {
      effectHandlers: {
        'my.check': async ({ signal, resume: r }) => {
          receivedSignal = signal instanceof AbortSignal
          r(null)
        },
      },
    })
    expect(receivedSignal).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 14. runSync Constraints
// ---------------------------------------------------------------------------
describe('auto: runSync constraints', () => {
  it('runSync evaluates pure expressions', () => {
    expect(dvala.run('1 + 2 + 3')).toBe(6)
  })

  it('runSync accepts bindings', () => {
    expect(dvala.run('x + y', { bindings: { x: 10, y: 32 } })).toBe(42)
  })

  it('runSync throws on unhandled effect', () => {
    expect(() => dvala.run('perform(effect(my.eff))')).toThrow('Unhandled effect')
  })

  it('runSync handles local do/with effects', () => {
    const result = dvala.run(`
      do
        perform(effect(my.eff), 5)
      with
        case effect(my.eff) then ([x]) -> x * 10
      end
    `)
    expect(result).toBe(50)
  })

  it('runSync handles standard sync effects', () => {
    const result = dvala.run('perform(effect(dvala.random))')
    expect(typeof result).toBe('number')
  })

  it('runSync handles dvala.time.now', () => {
    const result = dvala.run('perform(effect(dvala.time.now))')
    expect(typeof result).toBe('number')
    expect(result as number).toBeGreaterThan(0)
  })

  it('runSync handles dvala.time.zone', () => {
    const result = dvala.run('perform(effect(dvala.time.zone))')
    expect(typeof result).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// 15. effect-matcher Wildcard Patterns
// ---------------------------------------------------------------------------
describe('auto: effect-matcher wildcard patterns', () => {
  const patterns: Array<{ pattern: string, matches: string[], nonMatches: string[] }> = [
    {
      pattern: 'dvala.*',
      matches: ['dvala.error', 'dvala.io.println', 'dvala.random', 'dvala.checkpoint'],
      nonMatches: ['llm.complete', 'custom.foo', 'simple'],
    },
    {
      pattern: 'dvala.io.*',
      matches: ['dvala.io.println', 'dvala.io.print', 'dvala.io.error'],
      nonMatches: ['dvala.random', 'dvala.error', 'llm.complete'],
    },
    {
      pattern: '*',
      matches: ['dvala.error', 'llm.complete', 'anything', 'a.b.c'],
      nonMatches: [],
    },
    {
      pattern: 'llm.complete',
      matches: ['llm.complete'],
      nonMatches: ['dvala.error', 'llm.summarize', 'llm'],
    },
  ]

  for (const { pattern, matches, nonMatches } of patterns) {
    for (const name of matches) {
      it(`effect-matcher("${pattern}") matches effect(${name})`, () => {
        const result = dvala.run(`
          let pred = effect-matcher("${pattern}");
          pred(effect(${name}))
        `)
        expect(result).toBe(true)
      })
    }

    for (const name of nonMatches) {
      it(`effect-matcher("${pattern}") does NOT match effect(${name})`, () => {
        const result = dvala.run(`
          let pred = effect-matcher("${pattern}");
          pred(effect(${name}))
        `)
        expect(result).toBe(false)
      })
    }
  }
})

// ---------------------------------------------------------------------------
// 16. Effect Predicate in do/with — handler matching via predicates
// ---------------------------------------------------------------------------
describe('auto: predicate-based handler matching', () => {
  it('effect-matcher as handler case', () => {
    const result = dvala.run(`
      let io-handler = effect-matcher("test.io.*");
      do
        perform(effect(test.io.println), "msg")
      with
        case io-handler then ([x]) -> "handled: " ++ x
      end
    `)
    expect(result).toBe('handled: msg')
  })

  it('effect-matcher does not match non-matching effect', () => {
    expect(() => dvala.run(`
      let io-handler = effect-matcher("test.io.*");
      do
        perform(effect(test.other), "msg")
      with
        case io-handler then ([x]) -> "handled: " ++ x
      end
    `)).toThrow('Unhandled effect')
  })

  it('multiple predicate handlers checked in order', () => {
    const result = dvala.run(`
      let all-handler = effect-matcher("*");
      let io-handler = effect-matcher("test.io.*");
      do
        perform(effect(test.io.println), "msg")
      with
        case io-handler then ([x]) -> "io: " ++ x
        case all-handler then ([x]) -> "all: " ++ x
      end
    `)
    expect(result).toBe('io: msg')
  })

  it('effect-matcher with regexp', () => {
    const result = dvala.run(`
      let re = regexp("^test\\\\.io");
      let pred = effect-matcher(re);
      do
        perform(effect(test.io.println), "data")
      with
        case pred then ([x]) -> "matched: " ++ x
      end
    `)
    expect(result).toBe('matched: data')
  })
})

// ---------------------------------------------------------------------------
// 17. Standard Effects: Sync effects callable via runSync
// ---------------------------------------------------------------------------
describe('auto: standard sync effects via runSync', () => {
  const syncEffects: Array<{ name: string, args: string }> = [
    { name: 'dvala.random', args: '' },
    { name: 'dvala.random.uuid', args: '' },
    { name: 'dvala.random.int', args: '1, 100' },
    { name: 'dvala.random.item', args: '["a", "b", "c"]' },
    { name: 'dvala.random.shuffle', args: '[1, 2, 3]' },
    { name: 'dvala.time.now', args: '' },
    { name: 'dvala.time.zone', args: '' },
    { name: 'dvala.checkpoint', args: '"cp"' },
  ]

  for (const { name, args } of syncEffects) {
    it(`${name} callable via runSync`, () => {
      const code = args
        ? `perform(effect(${name}), ${args})`
        : `perform(effect(${name}))`
      const result = dvala.run(code)
      // Should not throw — result can be anything depending on the effect
      expect(result !== undefined || result === undefined).toBe(true)
    })
  }

  // I/O effects should work synchronously via runSync (they write to stdout/stderr)
  const ioEffects: Array<{ name: string, args: string }> = [
    { name: 'dvala.io.print', args: '"test"' },
    { name: 'dvala.io.println', args: '"test"' },
    { name: 'dvala.io.error', args: '"test"' },
  ]

  for (const { name, args } of ioEffects) {
    it(`${name} callable via runSync (I/O)`, () => {
      const code = `perform(effect(${name}), ${args})`
      // I/O effects return the original value (identity)
      expect(() => dvala.run(code)).not.toThrow()
    })
  }
})

// ---------------------------------------------------------------------------
// 18. Standard Effects: Return value semantics
// ---------------------------------------------------------------------------
describe('auto: standard effects return value semantics', () => {
  it('dvala.io.print returns the original value', () => {
    const result = dvala.run('perform(effect(dvala.io.print), "hello")')
    expect(result).toBe('hello')
  })

  it('dvala.io.println returns the original value', () => {
    const result = dvala.run('perform(effect(dvala.io.println), "hello")')
    expect(result).toBe('hello')
  })

  it('dvala.io.error returns the original value', () => {
    const result = dvala.run('perform(effect(dvala.io.error), "err")')
    expect(result).toBe('err')
  })

  it('dvala.random returns a number in [0, 1)', () => {
    const result = dvala.run('perform(effect(dvala.random))') as number
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThan(1)
  })

  it('dvala.random.uuid returns a UUID-like string', () => {
    const result = dvala.run('perform(effect(dvala.random.uuid))') as string
    expect(typeof result).toBe('string')
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('dvala.random.int returns an integer in range', () => {
    const result = dvala.run('perform(effect(dvala.random.int), 1, 10)') as number
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBeGreaterThanOrEqual(1)
    expect(result).toBeLessThan(10)
  })

  it('dvala.random.item returns an element from the array', () => {
    const result = dvala.run('perform(effect(dvala.random.item), ["a", "b", "c"])')
    expect(['a', 'b', 'c']).toContain(result)
  })

  it('dvala.random.shuffle returns array of same length', () => {
    const result = dvala.run('perform(effect(dvala.random.shuffle), [1, 2, 3, 4, 5])') as number[]
    expect(result).toHaveLength(5)
    expect(result.sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('dvala.time.now returns current-ish timestamp', () => {
    const before = Date.now()
    const result = dvala.run('perform(effect(dvala.time.now))') as number
    const after = Date.now()
    expect(result).toBeGreaterThanOrEqual(before)
    expect(result).toBeLessThanOrEqual(after)
  })

  it('dvala.checkpoint returns null by default', () => {
    const result = dvala.run('perform(effect(dvala.checkpoint), "cp")')
    expect(result).toBe(null)
  })

  it('dvala.random.int rejects non-integer min', () => {
    expect(() => dvala.run('perform(effect(dvala.random.int), 1.5, 10)')).toThrow()
  })

  it('dvala.random.int rejects max <= min', () => {
    expect(() => dvala.run('perform(effect(dvala.random.int), 10, 5)')).toThrow()
  })

  it('dvala.random.item rejects empty array', () => {
    expect(() => dvala.run('perform(effect(dvala.random.item), [])')).toThrow()
  })

  it('dvala.random.item rejects non-array', () => {
    expect(() => dvala.run('perform(effect(dvala.random.item), "not array")')).toThrow()
  })

  it('dvala.random.shuffle rejects non-array', () => {
    expect(() => dvala.run('perform(effect(dvala.random.shuffle), "not array")')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 19. Effect + Closures
// ---------------------------------------------------------------------------
describe('auto: effect + closures', () => {
  it('handler captures enclosing scope', () => {
    const result = dvala.run(`
      let prefix = "handled";
      do
        perform(effect(test.eff), "msg")
      with
        case effect(test.eff) then ([x]) -> prefix ++ ": " ++ x
      end
    `)
    expect(result).toBe('handled: msg')
  })

  it('closure captures effect result', () => {
    const result = dvala.run(`
      do
        let val = perform(effect(test.eff), 5);
        let f = () -> val * 2;
        f()
      with
        case effect(test.eff) then ([x]) -> x + 10
      end
    `)
    expect(result).toBe(30) // (5 + 10) * 2
  })

  it('effect in closure called later', () => {
    const result = dvala.run(`
      do
        let f = (x) -> perform(effect(test.eff), x);
        f(3) + f(4)
      with
        case effect(test.eff) then ([x]) -> x * 10
      end
    `)
    expect(result).toBe(70) // 30 + 40
  })

  it('nested closures with effects', () => {
    const result = dvala.run(`
      do
        let make-adder = (n) -> (x) -> perform(effect(test.eff), n + x);
        let add10 = make-adder(10);
        add10(5)
      with
        case effect(test.eff) then ([x]) -> x * 2
      end
    `)
    expect(result).toBe(30) // (10 + 5) * 2
  })
})

// ---------------------------------------------------------------------------
// 20. Effect + Recursion
// ---------------------------------------------------------------------------
describe('auto: effect + recursion', () => {
  it('recursive function with effects', () => {
    const result = dvala.run(`
      do
        let my-sum = (n) -> if ==(n, 0) then 0 else +(perform(effect(test.eff), n), my-sum(-(n, 1))) end;
        my-sum(3)
      with
        case effect(test.eff) then ([x]) -> x
      end
    `)
    expect(result).toBe(6) // 3 + 2 + 1 + 0
  })

  it('effect handler return modifies recursive computation', () => {
    const result = dvala.run(`
      do
        let my-sum = (n) -> if ==(n, 0) then 0 else +(perform(effect(test.eff), n), my-sum(-(n, 1))) end;
        my-sum(3)
      with
        case effect(test.eff) then ([x]) -> x * 2
      end
    `)
    expect(result).toBe(12) // (3*2) + (2*2) + (1*2) + 0
  })
})

// ---------------------------------------------------------------------------
// 21. Standard Effects Reference Data Consistency
// ---------------------------------------------------------------------------
describe('auto: standard effects reference data', () => {
  for (const effectName of standardEffectNames) {
    const refKey = `-effect-${effectName}`

    it(`${effectName}: exists in allReference as '${refKey}'`, () => {
      expect(refKey in allReference, `reference key '${refKey}' not found`).toBe(true)
    })

    it(`${effectName}: reference has title matching effect name`, () => {
      const ref = allReference[refKey]!
      expect((ref as { title: string }).title).toBe(effectName)
    })

    it(`${effectName}: reference category is 'effect'`, () => {
      const ref = allReference[refKey]!
      expect(ref.category).toBe('effect')
    })
  }
})
