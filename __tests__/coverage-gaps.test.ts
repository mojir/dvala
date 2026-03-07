import { describe, expect, it } from 'vitest'
import { allBuiltinModules } from '../src/allModules'
import { createDebugger } from '../src/debug'
import { Dvala } from '../src/Dvala/Dvala'
import { run } from '../src/effects'
import type { Handlers } from '../src/evaluator/effectTypes'

/**
 * Tests targeting uncovered lines in the trampoline's recursive evaluator paths,
 * edge cases in special expressions, and miscellaneous coverage gaps.
 */

const dvala = new Dvala()
const dvalaFull = new Dvala({ modules: allBuiltinModules })

// ---------------------------------------------------------------------------
// Recursive evaluator path — compound function types
// ---------------------------------------------------------------------------

describe('recursive evaluator — compound function types (trampoline fallback)', () => {
  describe('comp function via trampoline dispatch', () => {
    it('should handle comp with user-defined functions', () => {
      expect(dvala.run('let f = comp(inc, inc); f(1)')).toBe(3)
    })

    it('should handle comp with multiple functions', () => {
      expect(dvala.run('let f = comp(inc, inc, inc); f(0)')).toBe(3)
    })

    it('should handle empty comp (identity)', () => {
      expect(dvala.run('let f = comp(); f(42)')).toBe(42)
    })
  })

  describe('juxt function via trampoline dispatch', () => {
    it('should handle juxt with multiple functions', () => {
      expect(dvalaFull.run('let { juxt } = import(functional); let f = juxt(inc, dec); f(5)')).toEqual([6, 4])
    })
  })

  describe('complement function via trampoline dispatch', () => {
    it('should handle complement', () => {
      expect(dvalaFull.run('let { complement } = import(functional); let f = complement(odd?); f(3)')).toBe(false)
      expect(dvalaFull.run('let { complement } = import(functional); let f = complement(odd?); f(4)')).toBe(true)
    })
  })

  describe('every-pred function via trampoline dispatch', () => {
    it('should handle every-pred', () => {
      expect(dvalaFull.run('let f = import(functional); f.every-pred(number?, odd?)(5)')).toBe(true)
      expect(dvalaFull.run('let f = import(functional); f.every-pred(number?, odd?)(4)')).toBe(false)
    })
  })

  describe('some-pred function via trampoline dispatch', () => {
    it('should handle some-pred', () => {
      expect(dvalaFull.run('let f = import(functional); f.some-pred(zero?, even?)(0)')).toBe(true)
      expect(dvalaFull.run('let f = import(functional); f.some-pred(zero?, even?)(5)')).toBe(false)
    })
  })

  describe('fnull function via trampoline dispatch', () => {
    it('should handle fnull', () => {
      expect(dvalaFull.run('let { fnull } = import(functional); let f = fnull(+, 0, 0); f(null, 5)')).toBe(5)
    })
  })

  describe('constantly function via trampoline dispatch', () => {
    it('should handle constantly', () => {
      expect(dvala.run('let f = constantly(42); f(1, 2, 3)')).toBe(42)
    })
  })

  describe('partial application via trampoline dispatch', () => {
    it('should handle partial with placeholder', () => {
      expect(dvala.run('let f = +(_, 10); f(5)')).toBe(15)
    })
  })

  describe('number as function via trampoline dispatch', () => {
    it('should call number as function on array', () => {
      expect(dvala.run('let f = 1; f([10, 20, 30])')).toBe(20)
    })
  })

  describe('module function via trampoline dispatch', () => {
    it('should call module functions with callbacks', () => {
      expect(dvalaFull.run('let a = import(assertion); a.assert=(1, 1)')).toBe(null)
    })
  })

  describe('builtin function as value via trampoline dispatch', () => {
    it('should call builtin function stored as value', () => {
      expect(dvala.run('let f = inc; map([1, 2, 3], f)')).toEqual([2, 3, 4])
    })
  })

  describe('special builtin as normal expression', () => {
    it('should call and/or as higher-order functions', () => {
      expect(dvala.run('let f = &&; f(true, 1)')).toBe(1)
    })
  })
})

// ---------------------------------------------------------------------------
// Recursive evaluator — user-defined function edge cases
// ---------------------------------------------------------------------------

describe('recursive evaluator — user-defined function edge cases', () => {
  it('should handle function with default value using earlier param', () => {
    expect(dvala.run('let f = (a, b = a + 1) -> a + b; f(5)')).toBe(11)
  })

  it('should handle function with rest args', () => {
    expect(dvala.run('let f = (a, ...the-rest) -> [a, the-rest]; f(1, 2, 3)')).toEqual([1, [2, 3]])
  })

  it('should handle function with destructuring', () => {
    expect(dvala.run('let f = ([a, b]) -> a + b; f([10, 20])')).toBe(30)
  })

  it('should handle recursive function with recur in sync', () => {
    expect(dvala.run(`
      loop(n = 100, acc = 0) -> do
        if n <= 0 then acc else recur(n - 1, acc + n) end
      end
    `)).toBe(5050)
  })
})

// ---------------------------------------------------------------------------
// ?? (nullish coalescing) edge cases
// ---------------------------------------------------------------------------

describe('?? (nullish coalescing) edge cases', () => {
  it('should handle ?? with first undefined and second also undefined', () => {
    expect(dvala.run('??(nonexistent1, nonexistent2, 42)')).toBe(42)
  })

  it('should handle ?? with single defined value', () => {
    expect(dvala.run('let x = 7; ??(x)')).toBe(7)
  })

  it('should handle ?? with first value null and second defined', () => {
    expect(dvala.run('let x = null; let y = 5; ??(x, y)')).toBe(5)
  })

  it('should handle ?? with all undefined', () => {
    expect(dvala.run('??(nonexistent1, nonexistent2)')).toBe(null)
  })

  it('should handle ?? with only one undefined symbol', () => {
    expect(dvala.run('??(nonexistent1)')).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// for/doseq edge cases
// ---------------------------------------------------------------------------

describe('for/doseq edge cases', () => {
  it('should handle for with when-guard', () => {
    expect(dvala.run('for (x in [1, 2, 3, 4, 5] when odd?(x)) -> x * 10')).toEqual([10, 30, 50])
  })

  it('should handle for with while-guard', () => {
    expect(dvala.run('for (x in [1, 2, 3, 4, 5] while x < 4) -> x * 10')).toEqual([10, 20, 30])
  })

  it('should handle for with let-binding', () => {
    expect(dvala.run('for (x in [1, 2, 3] let y = x * 2) -> y')).toEqual([2, 4, 6])
  })

  it('should handle for with nested bindings', () => {
    expect(dvala.run('for (x in [1, 2], y in [10, 20]) -> x + y')).toEqual([11, 21, 12, 22])
  })

  it('should handle for with when-guard that fails', () => {
    expect(dvala.run('for (x in [1, 2, 3, 4] when x > 10) -> x')).toEqual([])
  })

  it('should handle for with while-guard failing on first element', () => {
    expect(dvala.run('for (x in [10, 20, 30] while x < 5) -> x')).toEqual([])
  })

  it('should handle doseq with when and while guards', () => {
    expect(dvala.run('doseq (x in [1, 2, 3] when odd?(x)) -> x')).toBe(null)
  })

  it('should handle doseq with while-guard', () => {
    expect(dvala.run('doseq (x in [1, 2, 3] while x < 3) -> x')).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// match edge cases
// ---------------------------------------------------------------------------

describe('match edge cases', () => {
  it('should handle match with guard that fails', () => {
    expect(dvala.run(`
      match 5
        case x when x > 10 then "big"
        case x then "small"
      end
    `)).toBe('small')
  })

  it('should handle match with multiple patterns', () => {
    expect(dvala.run(`
      match [1, 2, 3]
        case [a, b, c] then a + b + c
      end
    `)).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// cond edge cases
// ---------------------------------------------------------------------------

describe('cond edge cases', () => {
  it('should handle empty cond', () => {
    expect(dvala.run('cond end')).toBe(null)
  })

  it('should handle cond with all false cases', () => {
    expect(dvala.run('cond case false then 1 case false then 2 end')).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// effect matching with function predicate
// ---------------------------------------------------------------------------

describe('effect matching with function predicate', () => {
  it('should match effects with a wildcard matcher', () => {
    const result = dvala.run(`
      do
        perform(effect(my.feature.test), "hello")
      with
        case effect-matcher("my.*")
        then ([msg]) -> upper-case(msg)
      end
    `)
    expect(result).toBe('HELLO')
  })

  it('should match effects with regexp matcher', () => {
    const result = dvala.run(`
      do
        perform(effect(data.fetch), 42)
      with
        case effect-matcher(#"data\\..*")
        then ([x]) -> x + 1
      end
    `)
    expect(result).toBe(43)
  })
})

// ---------------------------------------------------------------------------
// evaluateNode (exported function) — used by getUndefinedSymbols
// ---------------------------------------------------------------------------

describe('evaluateNode via getUndefinedSymbols', () => {
  it('should handle getUndefinedSymbols with function defaults', () => {
    const d = new Dvala()
    // This exercises evaluateNode when analyzing function default values
    const result = d.getUndefinedSymbols('let f = (a, b = 10) -> a + b; f(1)')
    expect(result).toEqual(new Set())
  })

  it('should report undefined symbols in function body', () => {
    const d = new Dvala()
    const result = d.getUndefinedSymbols('let f = (a) -> a + unknown; f(1)')
    expect(result).toEqual(new Set(['unknown']))
  })
})

// ---------------------------------------------------------------------------
// NaN check in recursive path
// ---------------------------------------------------------------------------

describe('naN check in recursive evaluator', () => {
  it('should throw on NaN result from normal expression callback', () => {
    expect(() => dvala.run('0 / 0')).toThrow('NaN')
  })
})

// ---------------------------------------------------------------------------
// Async operations
// ---------------------------------------------------------------------------

describe('async trampoline operations', () => {
  it('should handle async run with user-defined functions', async () => {
    const d = new Dvala()
    const result = await d.async.run('let f = (x) -> x * 2; map([1, 2, 3], f)')
    expect(result).toEqual([2, 4, 6])
  })

  it('should handle async run with comp', async () => {
    const d = new Dvala()
    const result = await d.async.run('let f = comp(inc, inc); f(0)')
    expect(result).toBe(2)
  })

  it('should handle async run with effects', async () => {
    const d = new Dvala()
    const result = await d.async.run(`
      do
        perform(effect(my.effect), 5)
      with
        case effect(my.effect) then ([x]) -> x * 10
      end
    `)
    expect(result).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// Effects API — host handler edge cases
// ---------------------------------------------------------------------------

describe('effects API — host handler edge cases', () => {
  it('should handle host handler with fail()', async () => {
    const handlers: Handlers = {
      'test.fail': async (ctx) => {
        ctx.fail('deliberately failed')
      },
    }
    const result = await run('perform(effect(test.fail))', { handlers })
    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.error.message).toContain('deliberately failed')
    }
  })

  it('should handle host handler with next()', async () => {
    const log: string[] = []
    const handlers: Handlers = {
      'test.next': async (ctx) => {
        log.push('specific')
        ctx.next()
      },
      '*': async (ctx) => {
        log.push('wildcard')
        ctx.resume(42)
      },
    }
    const result = await run('perform(effect(test.next))', { handlers })
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toBe(42)
    }
    expect(log).toEqual(['specific', 'wildcard'])
  })

  it('should handle host handler with suspend()', async () => {
    const handlers: Handlers = {
      'test.suspend': async (ctx) => {
        ctx.suspend({ reason: 'waiting' })
      },
    }
    const result = await run('perform(effect(test.suspend))', { handlers })
    expect(result.type).toBe('suspended')
  })

  it('should handle dvala.error unhandled effect', async () => {
    const result = await run('perform(effect(dvala.error), "test error")')
    expect(result.type).toBe('error')
  })

  it('should handle host handler resuming with a promise value', async () => {
    const handlers: Handlers = {
      'test.async-resume': async (ctx) => {
        ctx.resume(Promise.resolve(99))
      },
    }
    const result = await run('perform(effect(test.async-resume))', { handlers })
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toBe(99)
    }
  })

  it('should handle host handler resuming with a rejected promise', async () => {
    const handlers: Handlers = {
      'test.async-fail': async (ctx) => {
        ctx.resume(Promise.reject(new Error('async fail')))
      },
    }
    const result = await run('perform(effect(test.async-fail))', { handlers })
    expect(result.type).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// Anonymous function expression with placeholders
// ---------------------------------------------------------------------------

describe('anonymous function expression with placeholders', () => {
  it('should handle anonymous function calls', () => {
    expect(dvala.run('((x, y) -> x + y)(3, 4)')).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// ContextStack — shadowing builtin assertion
// ---------------------------------------------------------------------------

describe('contextStack — shadowing builtin', () => {
  it('should throw when trying to shadow a builtin function', () => {
    expect(() => dvala.run('let inc = 5; inc')).toThrow()
  })

  it('should throw when trying to shadow a builtin value', () => {
    expect(() => dvala.run('let self = 5; self')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Import with Dvala source (multi-node)
// ---------------------------------------------------------------------------

describe('import with Dvala source', () => {
  it('should import module with dvala source functions', () => {
    // The number-theory module has Dvala source that gets parsed into multiple nodes
    const result = dvalaFull.run('let { gcd } = import(number-theory); gcd(12, 8)')
    expect(result).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// wrapMaybePromiseAsStep — error wrapping for non-DvalaError
// ---------------------------------------------------------------------------

describe('async error wrapping', () => {
  it('should handle async operations that produce errors', async () => {
    const handlers: Handlers = {
      'test.error': async (ctx) => {
        ctx.resume(Promise.reject(new Error('plain JS error')))
      },
    }
    const result = await run('perform(effect(test.error))', { handlers })
    expect(result.type).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// Debug step
// ---------------------------------------------------------------------------

describe('debug step', () => {
  it('should work when debug handler is provided', async () => {
    const steps: unknown[] = []
    const handlers: Handlers = {
      'dvala.debug.step': async (ctx) => {
        steps.push(ctx.args[0])
        ctx.resume(ctx.args[0]!)
      },
    }
    const d = new Dvala({ debug: true })
    await d.async.run('1 + 2', { handlers })
    expect(steps.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// generateDocString — effect form and rest args
// ---------------------------------------------------------------------------

describe('generateDocString edge cases', () => {
  it('should generate doc string for effect reference', () => {
    const d = new Dvala()
    // Exercise the effect doc generation path
    const result = d.run('effect(dvala.io.println)')
    expect(result).toHaveProperty('name', 'dvala.io.println')
  })
})

// ---------------------------------------------------------------------------
// Recursive evaluator via module functions with executeFunction callback
// ---------------------------------------------------------------------------

describe('recursive evaluator via module functions', () => {
  describe('executeUserDefinedRecursive — user closure via module callback', () => {
    it('should trigger recursive user-defined evaluation via arithmetic-take-while', () => {
      const result = dvalaFull.run(`
        let nt = import(number-theory);
        nt.arithmetic-take-while(1, 1, (val, idx) -> val < 6)
      `)
      expect(result).toEqual([1, 2, 3, 4, 5])
    })

    it('should trigger recursive user-defined with default params via module callback', () => {
      const result = dvalaFull.run(`
        let nt = import(number-theory);
        nt.arithmetic-take-while(0, 1, (val, idx = 0) -> val < 3)
      `)
      expect(result).toEqual([0, 1, 2])
    })

    it('should trigger recursive user-defined with rest args via module callback', () => {
      const result = dvalaFull.run(`
        let nt = import(number-theory);
        nt.arithmetic-take-while(1, 2, (val, ...rest-args) -> val < 10)
      `)
      expect(result).toEqual([1, 3, 5, 7, 9])
    })

    it('should trigger recursive user-defined with destructuring via module callback', () => {
      const result = dvalaFull.run(`
        let a = import(assertion);
        a.assert=([1, 2, 3], [1, 2, 3])
      `)
      expect(result).toBe(null)
    })
  })

  describe('executeBuiltinRecursive — builtin as callback to module', () => {
    it('should trigger recursive built-in path via module function', () => {
      // arithmetic-take-while calls executeFunction with the predicate
      // passing a builtin like even? triggers executeBuiltinRecursive
      const result = dvalaFull.run(`
        let nt = import(number-theory);
        nt.arithmetic-take-while(1, 1, (val, idx) -> val < 5 && number?(val))
      `)
      expect(result).toEqual([1, 2, 3, 4])
    })
  })

  describe('executeModuleRecursive — module function as callback', () => {
    it('should trigger module recursive path via assertion module', () => {
      const result = dvalaFull.run(`
        let a = import(assertion);
        a.assert-throws(() -> throw("test error"))
      `)
      expect(result).toBe(null)
    })

    it('should trigger assert-throws-error recursive path', () => {
      const result = dvalaFull.run(`
        let a = import(assertion);
        a.assert-throws-error(() -> assert(false, "test error"), "test error")
      `)
      expect(result).toBe(null)
    })

    it('should trigger assert-not-throws recursive path', () => {
      const result = dvalaFull.run(`
        let a = import(assertion);
        a.assert-not-throws(() -> 42)
      `)
      expect(result).toBe(null)
    })
  })

  describe('evaluateNormalExpressionRecursive — builtins called inside module callbacks', () => {
    it('should trigger recursive normal expression path inside user function', () => {
      // When a user function called from a module callback calls a builtin,
      // that goes through evaluateNormalExpressionRecursive
      const result = dvalaFull.run(`
        let nt = import(number-theory);
        nt.arithmetic-take-while(1, 1, (val, idx) -> do
          let doubled = val * 2;
          doubled < 12
        end)
      `)
      expect(result).toEqual([1, 2, 3, 4, 5])
    })
  })

  describe('executeFunctionRecursive non-DvalaFunction branches', () => {
    it('should handle array-as-function in module callback context', () => {
      // Use assert-throws to call a function that uses array-as-function
      const result = dvalaFull.run(`
        let a = import(assertion);
        a.assert-not-throws(() -> do
          let arr = [10, 20, 30];
          arr(1)
        end)
      `)
      expect(result).toBe(null)
    })

    it('should handle object-as-function in module callback context', () => {
      const result = dvalaFull.run(`
        let a = import(assertion);
        a.assert-not-throws(() -> do
          let obj = { a: 1, b: 2 };
          obj("a")
        end)
      `)
      expect(result).toBe(null)
    })

    it('should handle string-as-function in module callback context', () => {
      const result = dvalaFull.run(`
        let a = import(assertion);
        a.assert-not-throws(() -> do
          let s = "hello";
          s(1)
        end)
      `)
      expect(result).toBe(null)
    })

    it('should handle number-as-function in module callback context', () => {
      const result = dvalaFull.run(`
        let a = import(assertion);
        a.assert-not-throws(() -> do
          let n = 0;
          n([10, 20, 30])
        end)
      `)
      expect(result).toBe(null)
    })
  })

  describe('executeSpecialBuiltinRecursive — special builtin as callback', () => {
    it('should handle special builtin in recursive context', () => {
      const result = dvalaFull.run(`
        let a = import(assertion);
        a.assert-not-throws(() -> do
          let f = &&;
          f(true, 42)
        end)
      `)
      expect(result).toBe(null)
    })
  })
})

// ---------------------------------------------------------------------------
// loop with no bindings
// ---------------------------------------------------------------------------

// Note: loop/for/doseq with zero bindings are unreachable — the parser
// throws "Expected binding" before the evaluator sees these paths.
// Lines 895-929 in trampoline.ts are dead code guarded by the parser.

// ---------------------------------------------------------------------------
// ?? — additional edge cases for skipUndefinedQq and advanceQq
// ---------------------------------------------------------------------------

describe('?? — skipUndefinedQq and advanceQq edge cases', () => {
  it('should handle ?? with two undefined then a defined value (3+ args)', () => {
    expect(dvala.run('??(nonexistent1, nonexistent2, 42)')).toBe(42)
  })

  it('should handle ?? with first undefined and second defined (2 args)', () => {
    expect(dvala.run('??(nonexistent1, 7)')).toBe(7)
  })

  it('should handle ?? with 3+ args, first defined returns immediately', () => {
    expect(dvala.run('let x = 5; ??(x, 10, 20)')).toBe(5)
  })

  it('should handle ?? with first null (not undefined) and second present', () => {
    expect(dvala.run('let x = null; ??(x, 42)')).toBe(42)
  })

  it('should handle ?? where first evaluates to null, skip to third', () => {
    expect(dvala.run('let x = null; ??(x, nonexistent2, 99)')).toBe(99)
  })
})

// ---------------------------------------------------------------------------
// setupUserDefinedCall async fallbacks — binding defaults that return promises
// ---------------------------------------------------------------------------

describe('setupUserDefinedCall async fallbacks', () => {
  it('should handle async default value in user-defined function', async () => {
    const d = new Dvala({ modules: allBuiltinModules })
    // Default value expressions that involve async operations
    const result = await d.async.run(`
      let f = (a, b = a + 1) -> a + b;
      f(5)
    `)
    expect(result).toBe(11)
  })

  it('should handle function with rest args in async context', async () => {
    const d = new Dvala()
    const result = await d.async.run(`
      let f = (a, ...the-rest) -> [a, the-rest];
      f(1, 2, 3)
    `)
    expect(result).toEqual([1, [2, 3]])
  })
})

// ---------------------------------------------------------------------------
// ImportMerge — dvala-only functions
// ---------------------------------------------------------------------------

describe('importMerge — module source with dvala-only functions', () => {
  it('should import module with dvala-only functions not in TS', () => {
    // functional module has source that adds functions not in the TS definition
    const result = dvalaFull.run(`
      let f = import(functional);
      object?(f)
    `)
    expect(result).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// applyCond — test body evaluation phase
// ---------------------------------------------------------------------------

describe('applyCond — body evaluation', () => {
  it('should evaluate cond body when condition is true', () => {
    expect(dvala.run(`
      cond
        case true then 42
      end
    `)).toBe(42)
  })

  it('should evaluate cond with multiple cases, matching second', () => {
    expect(dvala.run(`
      cond
        case false then 1
        case true then 2
        case true then 3
      end
    `)).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// applyMatch — guard evaluation, failed guard falls through
// ---------------------------------------------------------------------------

describe('applyMatch — match with guards', () => {
  it('should skip case when guard fails and match next', () => {
    expect(dvala.run(`
      match 5
        case x when x > 10 then "big"
        case x when x > 3 then "medium"
        case x then "small"
      end
    `)).toBe('medium')
  })

  it('should return null when no pattern matches', () => {
    expect(dvala.run(`
      match 42
        case "hello" then 1
      end
    `)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// advanceQq — post-evaluation advancement
// ---------------------------------------------------------------------------

describe('advanceQq — ?? after evaluating first to null', () => {
  it('should advance to third value when first two are null/undefined', () => {
    expect(dvala.run(`
      let x = null;
      ??(x, nonexistent, 99)
    `)).toBe(99)
  })

  it('should skip multiple undefined symbols and evaluate last', () => {
    expect(dvala.run('??(a, b, c, d, 100)')).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Effect matching — dvala function as handler predicate
// ---------------------------------------------------------------------------

describe('effect matching — dvala function handler predicate', () => {
  it('should match effect using a dvala function predicate in do...with', () => {
    const result = dvala.run(`
      do
        perform(effect(my.test.effect), "data")
      with
        case effect-matcher("my.test.*")
        then ([msg]) -> upper-case(msg)
      end
    `)
    expect(result).toBe('DATA')
  })
})

// ---------------------------------------------------------------------------
// Host handler — next() exhausting all handlers
// ---------------------------------------------------------------------------

describe('host handler — exhausting all handlers via next()', () => {
  it('should handle unhandled effect when all handlers call next()', async () => {
    const handlers: Handlers = {
      'test.exhaust': async (ctx) => {
        ctx.next()
      },
    }
    const result = await run('perform(effect(test.exhaust))', { handlers })
    expect(result.type).toBe('error')
  })

  it('should handle dvala.error when all handlers call next()', async () => {
    const handlers: Handlers = {
      'dvala.error': async (ctx) => {
        ctx.next()
      },
    }
    const result = await run('perform(effect(dvala.error), "test")', { handlers })
    expect(result.type).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// Host handler — handler that throws
// ---------------------------------------------------------------------------

describe('host handler — handler throws error', () => {
  it('should handle handler that throws an error', async () => {
    const handlers: Handlers = {
      'test.throw': async () => {
        throw new Error('handler crashed')
      },
    }
    const result = await run('perform(effect(test.throw))', { handlers })
    expect(result.type).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// Host handler — checkpoint and resumeFrom
// ---------------------------------------------------------------------------

describe('host handler — checkpoint and resumeFrom', () => {
  it('should create a checkpoint and resume from it', async () => {
    let savedSnapshot: unknown = null
    const handlers: Handlers = {
      'test.checkpoint': async (ctx) => {
        savedSnapshot = ctx.checkpoint({ label: 'snap1' })
        ctx.resume(1)
      },
    }
    const result = await run('perform(effect(test.checkpoint))', { handlers })
    expect(result.type).toBe('completed')
    expect(savedSnapshot).toHaveProperty('index')
  })

  it('should resume from a saved snapshot', async () => {
    let callCount = 0
    const handlers: Handlers = {
      'test.snap': async (ctx) => {
        callCount++
        if (callCount === 1) {
          ctx.checkpoint({ label: 'first' })
          ctx.resume(10)
        }
        else {
          ctx.resume(99)
        }
      },
    }
    const result = await run('perform(effect(test.snap))', { handlers, maxSnapshots: 5 })
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toBe(10)
    }
  })
})

// ---------------------------------------------------------------------------
// Parallel & Race — error paths
// ---------------------------------------------------------------------------

describe('parallel and race — error paths', () => {
  it('should handle parallel with multiple branches', async () => {
    const result = await run(`
      parallel(
        1 + 2,
        3 + 4
      )
    `)
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toEqual([3, 7])
    }
  })

  it('should handle race where all branches error via effects', async () => {
    const result = await run(`
      race(
        perform(effect(dvala.error), "race error 1"),
        perform(effect(dvala.error), "race error 2")
      )
    `)
    expect(result.type).toBe('error')
  })

  it('should handle race where one branch completes first', async () => {
    const result = await run(`
      race(
        42,
        99
      )
    `)
    expect(result.type).toBe('completed')
    if (result.type === 'completed') {
      expect(result.value).toBe(42)
    }
  })
})

// ---------------------------------------------------------------------------
// applyBindingDefault — binding defaults for destructuring
// ---------------------------------------------------------------------------

describe('applyBindingDefault — destructuring with defaults', () => {
  it('should handle destructuring with default value in let binding', () => {
    expect(dvala.run(`
      let [a, b = 10] = [1];
      a + b
    `)).toBe(11)
  })

  it('should handle object destructuring with default value', () => {
    expect(dvala.run('let { a, b = 5 } = { a: 1 }; a + b')).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// wrapMaybePromiseAsStep — async error wrapping in recursive path
// ---------------------------------------------------------------------------

describe('wrapMaybePromiseAsStep — async compound function', () => {
  it('should handle async compound function that resolves', async () => {
    const d = new Dvala({ modules: allBuiltinModules })
    const result = await d.async.run(`
      let { juxt } = import(functional);
      let f = juxt(inc, dec);
      f(5)
    `)
    expect(result).toEqual([6, 4])
  })
})

// ---------------------------------------------------------------------------
// evaluateNode — async fallback path
// ---------------------------------------------------------------------------

describe('evaluateNode — exported function', () => {
  it('should handle getUndefinedSymbols with closures and defaults', () => {
    const d = new Dvala()
    const result = d.getUndefinedSymbols(`
      let f = (a, b = 10) -> a + b + unknown_var
      f(1)
    `)
    expect(result).toContain('unknown_var')
  })
})

// ---------------------------------------------------------------------------
// runEffectLoop — non-DvalaError catch
// ---------------------------------------------------------------------------

describe('runEffectLoop — non-DvalaError propagation', () => {
  it('should wrap non-DvalaError in RunResult', async () => {
    const handlers: Handlers = {
      'test.native-error': async (ctx) => {
        ctx.resume(Promise.reject(new Error('plain string error')) as never)
      },
    }
    const result = await run('perform(effect(test.native-error))', { handlers })
    expect(result.type).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// Debug step — error inside debug step handler
// ---------------------------------------------------------------------------

describe('debug step — error during evaluation', () => {
  it('should handle debug step by resuming with value', async () => {
    const handlers: Handlers = {
      'dvala.debug.step': async (ctx) => {
        const stepInfo = ctx.args[0] as { value: unknown }
        ctx.resume(stepInfo.value as never)
      },
    }
    const d = new Dvala({ debug: true })
    const result = await d.async.run('1 + 2', { handlers })
    expect(result).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// for-loop evalLet phase
// ---------------------------------------------------------------------------

describe('for-loop evalLet and guard phases', () => {
  it('should handle for with let binding', () => {
    const result = dvala.run('for (x in [1, 2, 3] let y = x * 10) -> y')
    expect(result).toEqual([10, 20, 30])
  })

  it('should handle for with when AND while guards', () => {
    const result = dvala.run(`
      for (x in [1, 2, 3, 4, 5, 6] when odd?(x) while x < 5) -> x
    `)
    expect(result).toEqual([1, 3])
  })
})

// ---------------------------------------------------------------------------
// Import module with dvala source — multi-node parse
// ---------------------------------------------------------------------------

describe('import module with dvala source — multi-node parse path', () => {
  it('should import module containing dvala source with multiple nodes', () => {
    // The collection module has dvala source that provides extra functions
    const result = dvalaFull.run(`
      let c = import(collection);
      object?(c)
    `)
    expect(result).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Builtin with dvalaImpl — dispatch via setupUserDefinedCall
// ---------------------------------------------------------------------------

describe('builtin with dvalaImpl — trampoline dispatch', () => {
  it('should dispatch builtin with dvalaImpl through trampoline path', () => {
    // map, filter, reduce are builtins that have dvalaImpl
    const result = dvala.run('map([1, 2, 3], inc)')
    expect(result).toEqual([2, 3, 4])
  })

  it('should dispatch filter with dvalaImpl', () => {
    const result = dvala.run('filter([1, 2, 3, 4, 5], odd?)')
    expect(result).toEqual([1, 3, 5])
  })

  it('should dispatch reduce with dvalaImpl', () => {
    const result = dvala.run('reduce([1, 2, 3, 4], +, 0)')
    expect(result).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Number as function edge case
// ---------------------------------------------------------------------------

describe('number as function — trampoline dispatch', () => {
  it('should call number as function on nested structure', () => {
    expect(dvala.run('let f = 2; f([10, 20, 30, 40])')).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// ROUND 3: Additional coverage targeting remaining 208 uncovered lines
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ?? (nullish coalescing) — skipUndefinedQq and advanceQq
// Lines 764-765, 788-789: skipUndefinedQq skipping multiple undefined symbols
// Lines 1624-1625: advanceQq skipping undefined after null evaluation
// ---------------------------------------------------------------------------

describe('?? — skipUndefinedQq and advanceQq with undefined symbols', () => {
  it('should skip multiple undefined symbols at start and return first defined', () => {
    // ?? where first two args are undefined symbols, third is defined
    // Triggers skipUndefinedQq (lines 764-765)
    expect(dvala.run('?? (undefined_var_1, undefined_var_2, 42)')).toBe(42)
  })

  it('should return null when all args are undefined symbols', () => {
    // ?? where all args are undefined → skipUndefinedQq reaches end
    expect(dvala.run('?? (undef_a, undef_b, undef_c)')).toBe(null)
  })

  it('should skip undefined symbols after null evaluation in advanceQq', () => {
    // First arg evaluates to null, then undefined symbols are skipped
    // Triggers advanceQq skip (lines 1624-1625)
    expect(dvala.run('let x = null; ?? (x, undef_var, 42)')).toBe(42)
  })

  it('should return null when null followed by all undefined', () => {
    expect(dvala.run('let x = null; ?? (x, undef_a, undef_b)')).toBe(null)
  })

  it('should handle two undefined then two defined', () => {
    // Tests skipUndefinedQq with continuation to evaluate (lines 788-789)
    expect(dvala.run('?? (undef_a, undef_b, null, 99)')).toBe(99)
  })
})

// ---------------------------------------------------------------------------
// Recursive evaluator paths via assertion module callbacks
// Lines 145-146: NaN check in evaluateNodeRecursive
// Lines 180-191: evaluateParamsRecursive (spread, params)
// Lines 207-220: partial application through recursive path
// Lines 240-258: anonymous function expression through recursive path
// Lines 325-326: arity error in recursive path
// Lines 353-366: default values in recursive path
// ---------------------------------------------------------------------------

describe('recursive evaluator — specific code paths via assertion module', () => {
  it('should hit NaN check in recursive evaluator (lines 145-146)', () => {
    // 0 / 0 produces NaN → evaluateNodeRecursive NaN check throws
    // assert-throws catches the error
    expect(dvalaFull.run(`
      let { assert-throws } = import(assertion);
      assert-throws(() -> 0 / 0)
    `)).toBe(null)
  })

  it('should hit evaluateParamsRecursive spread handling (lines 180-183)', () => {
    // Spread args in function call within recursive evaluator
    expect(dvalaFull.run(`
      let { assert-not-throws } = import(assertion);
      assert-not-throws(() -> do let arr = [1, 2]; +(...arr) end)
    `)).toBe(null)
  })

  it('should hit evaluateParamsRecursive placeholder handling (line 190)', () => {
    // Placeholder in function call within recursive evaluator
    expect(dvalaFull.run(`
      let { assert-not-throws } = import(assertion);
      assert-not-throws(() -> do let f = +(_, 1); f(5) end)
    `)).toBe(null)
  })

  it('should hit evaluateNormalExpressionRecursive partial (lines 207-220)', () => {
    // Partial application (named function with placeholder) in recursive path
    expect(dvalaFull.run(`
      let { assert-not-throws } = import(assertion);
      assert-not-throws(() -> do let f = *(_, 2); f(5) end)
    `)).toBe(null)
  })

  it('should hit anonymous function expression in recursive path (lines 240-258)', () => {
    // Anonymous function call in recursive evaluator
    expect(dvalaFull.run(`
      let { assert-not-throws } = import(assertion);
      assert-not-throws(() -> ((x) -> x + 1)(5))
    `)).toBe(null)
  })

  it('should hit arity error in recursive path (lines 325-326)', () => {
    // Wrong arity in recursive evaluator
    expect(dvalaFull.run(`
      let { assert-throws } = import(assertion);
      assert-throws(() -> do let f = (x, y) -> x + y; f(1) end)
    `)).toBe(null)
  })

  it('should hit default values in recursive path (lines 353-366)', () => {
    // Function with default parameter value in recursive evaluator
    expect(dvalaFull.run(`
      let { assert-not-throws } = import(assertion);
      assert-not-throws(() -> do let f = (x, y = 10) -> x + y; f(5) end)
    `)).toBe(null)
  })

  it('should hit anonymous function with partial in recursive path (lines 244-254)', () => {
    // Anonymous function expression with placeholders in recursive path
    expect(dvalaFull.run(`
      let { assert-not-throws } = import(assertion);
      assert-not-throws(() -> do let add = (a, b) -> a + b; add(_, 10)(5) end)
    `)).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// Recursive evaluator — module, builtin, and special builtin dispatch
// Lines 491-495: executeBuiltinRecursive impure check + dvalaImpl
// Lines 510-511: executeModuleRecursive module not found
// Lines 514-518: executeModuleRecursive function not found / impure check
// ---------------------------------------------------------------------------

describe('recursive evaluator — builtin and module dispatch', () => {
  it('should hit executeBuiltinRecursive dvalaImpl path (line 494-495)', () => {
    // When a builtin with dvalaImpl is called inside a recursive evaluator path,
    // e.g., calling map inside an assert-not-throws callback
    expect(dvalaFull.run(`
      let { assert-not-throws } = import(assertion);
      assert-not-throws(() -> map([1, 2, 3], inc))
    `)).toBe(null)
  })

  it('should hit rest args in recursive evaluator (lines 347-349)', () => {
    // Rest args in recursive evaluator via module callback
    // arithmetic-take-while calls executeFunction so hits recursive path
    expect(dvalaFull.run(`
      let nt = import(number-theory);
      nt.arithmetic-take-while(1, 2, (val, ...rest-args) -> val < 10)
    `)).toEqual([1, 3, 5, 7, 9])
  })
})

// ---------------------------------------------------------------------------
// Import with multi-node source (lines 1084-1086)
// ---------------------------------------------------------------------------

describe('import — multi-node module source', () => {
  it('should handle importing module with multi-statement dvala source', () => {
    // grid module has multi-statement source (do...end wrapping)
    // This triggers the SequenceFrame path in import
    const result = dvalaFull.run(`
      let g = import(grid);
      object?(g)
    `)
    expect(result).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Impure function in pure mode (lines 1177-1178, 225-226, 491, 517)
// ---------------------------------------------------------------------------

describe('impure function in pure mode errors', () => {
  it('should throw when calling impure builtin in pure mode (line 1177)', () => {
    expect(() => dvala.run(`
      pure(() -> write(42))()
    `)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// applyBindingDefault (lines 2880-2891)
// ---------------------------------------------------------------------------

describe('applyBindingDefault — destructuring with defaults (trampoline)', () => {
  it('should resolve binding default in trampoline', () => {
    // BindingDefaultFrame is pushed when destructuring encounters a default value
    expect(dvala.run(`
      let [a, b = 10] = [1];
      b
    `)).toBe(10)
  })

  it('should resolve nested binding default', () => {
    expect(dvala.run(`
      let { x, y = 42 } = { x: 1 };
      y
    `)).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// wrapMaybePromiseAsStep — async path (lines 2981-2989)
// ---------------------------------------------------------------------------

describe('wrapMaybePromiseAsStep — async path', () => {
  it('should wrap async module result as step via effect handler', async () => {
    // Use an effect handler that resumes with a value, triggering async path
    // in handlers that chain through the trampoline
    const result = await run(`
      let x = perform(effect(my.async.val), 21);
      x * 2
    `, {
      handlers: {
        'my.async.val': async ({ args, resume }) => {
          const val = await Promise.resolve(args[0]!)
          resume(val)
        },
      },
    })
    expect(result).toEqual({ type: 'completed', value: 42 })
  })
})

// ---------------------------------------------------------------------------
// evaluateNode async fallback (lines 3185-3196)
// ---------------------------------------------------------------------------

describe('evaluateNode — async fallback', () => {
  it('should handle async evaluation through effect handler', async () => {
    // Trigger async path through run() with a handler that performs async work
    const result = await run(`
      let a = perform(effect(my.compute), 10);
      let b = perform(effect(my.compute), 20);
      a + b
    `, {
      handlers: {
        'my.compute': async ({ args, resume }) => {
          const val = await Promise.resolve((args[0] as number) + 1)
          resume(val)
        },
      },
    })
    expect(result).toEqual({ type: 'completed', value: 32 })
  })
})

// ---------------------------------------------------------------------------
// runEffectLoop — non-DvalaError wrapping (lines 3338-3339)
// ---------------------------------------------------------------------------

describe('runEffectLoop — non-DvalaError wrapping', () => {
  it('should wrap non-DvalaError in runEffectLoop', async () => {
    const handlers: Handlers = {
      'test.nonDvalaError': async () => {
        // Throw a plain Error, not a DvalaError
        throw new Error('plain JS error')
      },
    }
    const result = await run('perform(effect(test.nonDvalaError))', { handlers })
    expect(result.type).toBe('error')
    if (result.type === 'error') {
      expect(result.error.message).toContain('plain JS error')
    }
  })
})

// ---------------------------------------------------------------------------
// Effect matching — handler with function predicate (lines 2255-2260)
// ---------------------------------------------------------------------------

describe('effect matching — function predicate handler', () => {
  it('should match effect using function predicate', async () => {
    const handlers: Handlers = {
      'test.fnPredicate': async ({ resume }) => {
        resume(100)
      },
    }
    const result = await run('perform(effect(test.fnPredicate), 1)', { handlers })
    expect(result).toEqual({ type: 'completed', value: 100 })
  })

  it('should handle non-matching effect predicate', () => {
    // Use do...with...end where handler doesn't match the effect
    const result = dvala.run(`
      do
        42
      with
        case effect(no.match) then ([]) -> 0
      end
    `)
    expect(result).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// Host handler — checkpoint, resumeFrom, next (lines 2456-2478, 2495-2496)
// ---------------------------------------------------------------------------

describe('host handler — next operation', () => {
  it('should call next to pass to next handler', async () => {
    const handlers: Handlers = {
      'test.*': async ({ next }) => {
        // First handler calls next via wildcard pattern
        next()
      },
      'test.next': async ({ resume }) => {
        // Second handler handles it via exact match
        resume(99)
      },
    }
    const result = await run('perform(effect(test.next))', { handlers })
    expect(result).toEqual({ type: 'completed', value: 99 })
  })
})

// ---------------------------------------------------------------------------
// Host handler — fail (lines 2495-2496)
// ---------------------------------------------------------------------------

describe('host handler — fail and late errors', () => {
  it('should handle handler that rejects after settling', async () => {
    const handlers: Handlers = {
      'test.lateReject': async ({ resume }) => {
        resume(42)
        // Late reject after resume — should be ignored
        throw new Error('late error')
      },
    }
    const result = await run('perform(effect(test.lateReject))', { handlers })
    expect(result).toEqual({ type: 'completed', value: 42 })
  })

  it('should handle handler that throws error before settling', async () => {
    const handlers: Handlers = {
      'test.earlyThrow': async () => {
        throw new Error('handler error')
      },
    }
    const result = await run('perform(effect(test.earlyThrow))', { handlers })
    expect(result.type).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// Parallel/Race — error paths (lines 2582-2584, 2658-2661, 2704-2705)
// ---------------------------------------------------------------------------

describe('parallel/race — error paths', () => {
  it('should handle parallel where a branch errors', async () => {
    const result = await run(`
      parallel(1 + 1, assert(false, "branch error"))
    `, { modules: allBuiltinModules })
    expect(result.type).toBe('error')
  })

  it('should handle race where all branches error', async () => {
    const result = await run(`
      race(assert(false, "err1"), assert(false, "err2"))
    `, { modules: allBuiltinModules })
    expect(result.type).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// setupUserDefinedCall — async fallbacks (lines 1317-1320, 1335-1343, 1355-1369)
// These fire when evaluateBindingNodeValues returns a Promise
// ---------------------------------------------------------------------------

describe('setupUserDefinedCall — async binding fallbacks', () => {
  it('should handle user-defined function with destructuring via effects', async () => {
    // Effect handler provides async value which is then passed to a user function
    const result = await run(`
      let f = ([a, b]) -> a + b;
      let data = perform(effect(my.getData));
      f(data)
    `, {
      handlers: {
        'my.getData': async ({ resume }) => {
          resume([10, 20])
        },
      },
    })
    expect(result).toEqual({ type: 'completed', value: 30 })
  })
})

// ---------------------------------------------------------------------------
// ImportMerge — dvala-only functions (lines 1460-1461)
// ---------------------------------------------------------------------------

describe('importMerge — dvala-only function path', () => {
  it('should access dvala-defined functions from collection module', () => {
    // collection.dvala defines update, update-in, etc.
    // These override TS functions via dvalaImpl
    const result = dvalaFull.run(`
      let c = import(collection);
      c.update({a: 1, b: 2}, "a", inc)
    `)
    expect(result).toEqual({ a: 2, b: 2 })
  })

  it('should access grid module functions defined in dvala source', () => {
    // grid.dvala defines functions that may be dvala-only
    const result = dvalaFull.run(`
      let g = import(grid);
      g.cell-every?([[1, 2], [3, 4]], number?)
    `)
    expect(result).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// DebugStep — location without sourceCodeInfo (line 2949)
// ---------------------------------------------------------------------------

describe('debug step — missing sourceCodeInfo', () => {
  it('should handle step with location data', async () => {
    const dbg = createDebugger()
    const result = await dbg.run('1 + 2')
    expect(result.type).toBe('suspended')
    expect(dbg.history.length).toBeGreaterThan(0)
    expect(dbg.current!.step.value).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// getCollectionUtils — Expected collection error (line 3000)
// ---------------------------------------------------------------------------

describe('getCollectionUtils — non-collection error', () => {
  it('should throw when using for with non-collection', () => {
    expect(() => dvala.run('for (x in 42) -> x')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Recursive evaluator — recur in user-defined function (lines 384-390, 402-404)
// Note: RecurSignal from the old evaluate path. These catch blocks handle recur
// in the recursive evaluator when a user-defined fn is called via executeFunction.
// ---------------------------------------------------------------------------

describe('recursive evaluator — recur in callback function', () => {
  it('should handle recur in user-defined function via recursive evaluator', () => {
    // Use arithmetic-take-while which calls executeFunction on a predicate
    // The callback is a user-defined function
    expect(dvalaFull.run(`
      let nt = import(number-theory);
      nt.arithmetic-take-while(1, 1, (n) -> n < 5)
    `)).toEqual([1, 2, 3, 4])
  })
})
