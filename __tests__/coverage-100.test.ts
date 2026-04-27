import { describe, expect, it } from 'vitest'
import { createDvala } from '../src/createDvala'
import { AssertionError, DvalaError } from '../src/errors'
import { getAutoCompleter, getUndefinedSymbols } from '../src/tooling'
import { AutoCompleter } from '../src/AutoCompleter/AutoCompleter'
import { resume } from '../src/resume'
import { retrigger } from '../src/retrigger'
import { mathUtilsModule } from '../src/builtin/modules/math'
import { miscNormalExpression } from '../src/builtin/core/misc'
import {
  assertEffectNameToken,
  asEffectNameToken,
  assertTemplateStringToken,
  asTemplateStringToken,
} from '../src/tokenizer/token'
import { asUserDefinedSymbolNode } from '../src/typeGuards/astNode'
import { splitSegments } from '../src/parser/subParsers/parseTemplateString'
import { tokenizeSource } from '../src/tooling'
import type { Snapshot } from '../src/evaluator/effectTypes'
import '../src/initReferenceData'

const dvala = createDvala({ disableAutoCheckpoint: true })

// ---------------------------------------------------------------------------
// resume.ts — modules option (line 61)
// ---------------------------------------------------------------------------
describe('resume with modules option', () => {
  it('should resume with modules provided', async () => {
    // Create a program that suspends via host effect
    const result = await dvala.runAsync('perform(@test.suspend, 42)', {
      effectHandlers: [
        {
          pattern: 'test.suspend',
          handler: ({ suspend }) => {
            suspend()
          },
        },
      ],
    })
    expect(result.type).toBe('suspended')
    if (result.type !== 'suspended') return

    // Resume with modules option — exercises line 61 of resume.ts
    const resumed = await resume(result.snapshot, 'resumed', {
      modules: [mathUtilsModule],
      disableAutoCheckpoint: true,
    })
    expect(resumed.type).toBe('completed')
    if (resumed.type === 'completed') {
      expect(resumed.value).toBe('resumed')
    }
  })
})

// ---------------------------------------------------------------------------
// misc.ts — line 328 (macroexpand evaluate throw)
// ---------------------------------------------------------------------------
describe('misc.ts macroexpand evaluate stub', () => {
  it('should throw when macroexpand evaluate is called directly', () => {
    expect(() =>
      miscNormalExpression['macroexpand']!.evaluate([] as never, undefined as never, undefined as never),
    ).toThrow('macroexpand is handled by the evaluator')
  })
})

// ---------------------------------------------------------------------------
// misc.ts — line 401 (qualifiedMatcher with non-string/regexp)
// ---------------------------------------------------------------------------
describe('qualifiedMatcher error for invalid type', () => {
  it('should throw when given a number argument', () => {
    expect(() => dvala.run('qualifiedMatcher(42)')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// misc.ts — line 469 (raise evaluate stub)
// ---------------------------------------------------------------------------
describe('misc.ts raise evaluate stub', () => {
  it('should throw when raise evaluate is called directly', () => {
    expect(() => miscNormalExpression['raise']!.evaluate([] as never, undefined as never, undefined as never)).toThrow(
      'raise is implemented in Dvala',
    )
  })
})

// ---------------------------------------------------------------------------
// token.ts — assertEffectNameToken / asEffectNameToken (lines 123-129)
// ---------------------------------------------------------------------------
describe('token.ts assert/as functions', () => {
  it('should throw on assertEffectNameToken with wrong token type', () => {
    expect(() => assertEffectNameToken(['Symbol', 'foo'])).toThrow()
  })

  it('should throw on asEffectNameToken with wrong token type', () => {
    expect(() => asEffectNameToken(['Symbol', 'foo'])).toThrow()
  })

  // token.ts — assertTemplateStringToken / asTemplateStringToken (lines 342-348)
  it('should throw on assertTemplateStringToken with wrong token type', () => {
    expect(() => assertTemplateStringToken(['Symbol', 'foo'])).toThrow()
  })

  it('should throw on asTemplateStringToken with wrong token type', () => {
    expect(() => asTemplateStringToken(['Symbol', 'foo'])).toThrow()
  })
})

// ---------------------------------------------------------------------------
// typeGuards/astNode.ts — assertUserDefinedSymbolNode (line 40)
// ---------------------------------------------------------------------------
describe('astNode.ts assertUserDefinedSymbolNode', () => {
  it('should throw when non-symbol node is passed to asUserDefinedSymbolNode', () => {
    // Pass a number node instead of a symbol node
    expect(() => asUserDefinedSymbolNode(['Num', 42, 0] as never)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// parseObject.ts — template string as object key (line 24)
// ---------------------------------------------------------------------------
describe('parseObject template string key', () => {
  it('should use template string as object key', () => {
    const result = dvala.run('let k = "name"; {`${k}`: 42}')
    expect(result).toEqual({ name: 42 })
  })
})

// ---------------------------------------------------------------------------
// parseMacro.ts — error on invalid macro params (line 26)
// ---------------------------------------------------------------------------
describe('parseMacro error path', () => {
  it('should throw on macro without valid parameters', () => {
    // macro without parenthesized params followed by ->
    expect(() => dvala.run('macro -> 1')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// parseOperand.ts — unknown dvala effect (line 196)
// ---------------------------------------------------------------------------
describe('parseOperand unknown dvala effect', () => {
  it('should throw on unknown dvala.* effect name', () => {
    expect(() => dvala.run('@dvala.nonexistent')).toThrow('Unknown dvala effect')
  })
})

// ---------------------------------------------------------------------------
// parseHandler.ts — error paths (lines 52, 75)
// ---------------------------------------------------------------------------
describe('parseHandler error paths', () => {
  it('should throw when handler clause is not an effect name (line 52)', () => {
    // After handler keyword, should see @effect or transform or end
    expect(() => dvala.run('handler 42 end')).toThrow()
  })

  it('should throw for duplicate effect clause', () => {
    expect(() => dvala.run('handler @test.a(x) -> resume(x) @test.a(y) -> resume(y) end')).toThrow('Duplicate')
  })
})

// ---------------------------------------------------------------------------
// parseFunctionCall.ts — error paths (lines 166, 190, 198)
// ---------------------------------------------------------------------------
describe('parseFunctionCall error paths', () => {
  it('should throw for function() call form (line 166)', () => {
    expect(() => dvala.run('function(1, 2)')).toThrow('not allowed')
  })

  it('should throw for effect() with non-symbol arg (line 190)', () => {
    expect(() => dvala.run('effect(42)')).toThrow()
  })

  it('should throw for effect() with bad dotted path (line 198)', () => {
    // After first segment and dot, needs another identifier
    expect(() => dvala.run('effect(a.42)')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// parseBindingTarget.ts — template string as binding target (lines 58-61)
// ---------------------------------------------------------------------------
describe('parseBindingTarget template string literal', () => {
  it('should match template string literal in match expression', () => {
    // Template string as a literal pattern in match — exercises lines 57-61
    const result = dvala.run('match "hello" case `hello` then true case _ then false end')
    expect(result).toBe(true)
  })

  it('should not match when template string literal differs', () => {
    const result = dvala.run('match "world" case `hello` then true case _ then false end')
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parseQuote.ts — property access after dot in quote (lines 98-100)
// ---------------------------------------------------------------------------
describe('parseQuote edge cases', () => {
  it('should handle property access after dot in quote body (lines 98-100)', () => {
    // A symbol after a dot should be treated as property access, not a keyword.
    // This exercises the dot-skip logic in pass 2 of parseQuote.
    // We use a simple code template that includes a property access.
    const result = dvala.run('let obj = {x: 1}; let q = quote obj.x end; q')
    expect(result).toBeDefined()
  })

  it('should throw on empty splice expression (line 231)', () => {
    expect(() => dvala.run('quote $^{} end')).toThrow('Empty splice')
  })
})

// ---------------------------------------------------------------------------
// parseTemplateString.ts — various uncovered paths
// ---------------------------------------------------------------------------
describe('parseTemplateString edge cases', () => {
  it('should handle quoted symbol inside interpolation via splitSegments (scanQuotedSymbol)', () => {
    // A quoted symbol ('sym) inside interpolation — scanQuotedSymbol skips over it
    // so brace matching works correctly
    const segments = splitSegments("${x.'key'}")
    expect(segments).toEqual([{ type: 'expression', value: "x.'key'", offset: 2 }])
  })

  it('should handle quoted symbol with escape inside interpolation', () => {
    const segments = splitSegments("${x.'k\\'ey'}")
    expect(segments).toEqual([{ type: 'expression', value: "x.'k\\'ey'", offset: 2 }])
  })

  it('should handle nested template string inside interpolation via splitSegments (scanNestedTemplate)', () => {
    // A nested backtick template inside interpolation
    const segments = splitSegments('${`inner`}')
    expect(segments).toEqual([{ type: 'expression', value: '`inner`', offset: 2 }])
  })

  it('should handle nested template with interpolation via splitSegments', () => {
    const segments = splitSegments('${`${x}`}')
    expect(segments).toEqual([{ type: 'expression', value: '`${x}`', offset: 2 }])
  })

  it('should handle double-quoted string inside interpolation via splitSegments (scanString)', () => {
    // A double-quoted string inside interpolation — scanString skips over it
    const segments = splitSegments('${concat("hello", "world")}')
    expect(segments).toEqual([{ type: 'expression', value: 'concat("hello", "world")', offset: 2 }])
  })

  it('should handle escaped quotes in string inside interpolation', () => {
    const segments = splitSegments('${concat("he\\"llo")}')
    expect(segments).toEqual([{ type: 'expression', value: 'concat("he\\"llo")', offset: 2 }])
  })

  it('should skip empty literal segments between adjacent interpolations', () => {
    const result = dvala.run('`${1}${2}`')
    expect(result).toBe('12')
  })

  it('should throw on empty interpolation', () => {
    expect(() => dvala.run('`${}`')).toThrow()
  })

  // splitSegments — deferred splice (lines 148-165)
  it('should parse deferred splice segments', () => {
    const segments = splitSegments('prefix$${inner}suffix')
    expect(segments).toEqual([
      { type: 'literal', value: 'prefix' },
      { type: 'deferred', value: 'inner', dollarCount: 2, offset: 9 },
      { type: 'literal', value: 'suffix' },
    ])
  })

  it('should parse deferred splice with no prefix literal', () => {
    const segments = splitSegments('$${x}')
    expect(segments).toEqual([{ type: 'deferred', value: 'x', dollarCount: 2, offset: 3 }])
  })

  it('should parse triple-dollar deferred splice', () => {
    const segments = splitSegments('$$${x}')
    expect(segments).toEqual([{ type: 'deferred', value: 'x', dollarCount: 3, offset: 4 }])
  })
})

// ---------------------------------------------------------------------------
// tokenizers.ts — template string error paths (lines 497-501, 512)
// ---------------------------------------------------------------------------
describe('tokenizer template string error paths', () => {
  it('should return error for unclosed nested template string', () => {
    // Template with an unclosed nested template inside interpolation
    const stream = tokenizeSource('`${`unclosed}`')
    const errorTokens = stream.tokens.filter(t => t[0] === 'Error')
    expect(errorTokens.length).toBeGreaterThan(0)
  })

  it('should return error for unclosed interpolation in template string', () => {
    const stream = tokenizeSource('`${1 + 2`')
    const errorTokens = stream.tokens.filter(t => t[0] === 'Error')
    expect(errorTokens.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// getUndefinedSymbols/index.ts — handler with transform (line 204)
// ---------------------------------------------------------------------------
describe('getUndefinedSymbols handler with transform', () => {
  it('should detect undefined symbols in handler transform body', () => {
    const result = getUndefinedSymbols(`
      handler
        @test.eff(arg) -> resume(arg)
        transform x -> unknownFn(x)
      end
    `)
    expect(result).toContain('unknownFn')
  })
})

// ---------------------------------------------------------------------------
// getUndefinedSymbols/index.ts — Splice node (line 177)
// ---------------------------------------------------------------------------
describe('getUndefinedSymbols splice node', () => {
  it('should handle splice nodes inside code templates', () => {
    // A code template with a splice — the splice node itself should not
    // produce undefined symbols, but the splice expression should be checked
    const result = getUndefinedSymbols('let x = 1; quote $^{x} end')
    expect(result).toEqual(new Set())
  })

  it('should detect undefined in splice expression', () => {
    const result = getUndefinedSymbols('quote $^{unknownVar} end')
    expect(result).toContain('unknownVar')
  })
})

// ---------------------------------------------------------------------------
// getUndefinedSymbols/index.ts — Perform node (line 122)
// ---------------------------------------------------------------------------
describe('getUndefinedSymbols perform expression', () => {
  it('should detect undefined in perform effect expression', () => {
    const result = getUndefinedSymbols('perform(unknownEff, 42)')
    expect(result).toContain('unknownEff')
  })
})

// ---------------------------------------------------------------------------
// getUndefinedSymbols/index.ts — Resume node with ref (line 211)
// ---------------------------------------------------------------------------
describe('getUndefinedSymbols resume', () => {
  it('should handle resume with argument inside handler clause', () => {
    // resume(arg) inside handler — exercises Resume case with payload
    // Note: handler params like 'arg' are not removed by getUndefinedSymbols
    // (it's a conservative over-approximation), so 'arg' will be reported
    const result = getUndefinedSymbols(`
      do
        with handler @test.eff(arg) -> resume(arg) end;
        perform(@test.eff, 42)
      end
    `)
    expect(result).toContain('arg')
  })

  it('should handle bare resume (ref) inside handler clause (line 211)', () => {
    // Bare resume — creates Resume node with 'ref' payload
    const result = getUndefinedSymbols(`
      handler @test.eff() -> resume end
    `)
    // bare resume has no undefined symbols
    expect(result).not.toContain('resume')
  })
})

// ---------------------------------------------------------------------------
// Special expressions getUndefinedSymbols (dead code via SpecialExpression case)
// These are only called when the parser creates SpecialExpression nodes,
// which doesn't happen for most expressions. But let's cover what we can.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// bindingSlot.ts lines 231, 249
// ---------------------------------------------------------------------------
describe('bindingSlot uncovered paths', () => {
  it('should handle binding slot edge case in object destructuring with defaults', () => {
    const result = dvala.run('let {a = 1, b = 2} = {a: 10}; [a, b]')
    expect(result).toEqual([10, 2])
  })
})

// ---------------------------------------------------------------------------
// tokenizers.ts — template string with quoted symbols and nested templates (lines 470-498)
// ---------------------------------------------------------------------------
describe('tokenizers.ts template string edge cases', () => {
  it('should tokenize template with quoted symbol in interpolation', () => {
    // Single-quote inside interpolation exercises the quoted symbol scanner
    const stream = tokenizeSource("`${x.'key'}`")
    // Should successfully tokenize (not error)
    expect(stream.tokens.length).toBeGreaterThan(0)
  })

  it('should tokenize template with string containing braces in interpolation', () => {
    // A string with braces inside an interpolation
    const stream = tokenizeSource('`${concat("{", "}")}`')
    expect(stream.tokens.length).toBeGreaterThan(0)
  })

  it('should tokenize template with nested template in interpolation', () => {
    const stream = tokenizeSource('`${`nested`}`')
    expect(stream.tokens.length).toBeGreaterThan(0)
  })

  it('should handle error in nested template within interpolation', () => {
    // Nested template that has an error (unclosed) inside an interpolation
    const stream = tokenizeSource('`${`unclosed}`')
    const hasError = stream.tokens.some(t => t[0] === 'Error')
    expect(hasError).toBe(true)
  })
})

// lucky.ts lines 68-73 — sieve extension path is already tested by luckyNth(3000)
// in the lucky.test.ts unit test. The coverage gap is likely due to v8's
// branch-level tracking within the sieve loop. Skipping.

// ---------------------------------------------------------------------------
// parseQuote.ts — additional uncovered lines
// ---------------------------------------------------------------------------
describe('parseQuote additional paths', () => {
  it('should handle quote-splice skipping inside pass 1 (line 52)', () => {
    // A splice inside a quote should be tracked during token collection
    const result = dvala.run('let x = 42; quote $^{x} + 1 end')
    expect(result).toBeDefined()
  })

  it('should throw on unterminated quote block (line 77)', () => {
    expect(() => dvala.run('quote 1 + 2')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// parseFunctionCall.ts — object() with odd args (line 116-117)
// ---------------------------------------------------------------------------
describe('parseFunctionCall object() edge cases', () => {
  it('should throw for object() with odd number of args', () => {
    expect(() => dvala.run('object("a", 1, "b")')).toThrow('even number')
  })

  it('should throw for expected closing paren after effect name (line 204)', () => {
    expect(() => dvala.run('effect(a.b.c extra)')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// parseFunctionCall.ts — object() with spread (lines 116-117)
// ---------------------------------------------------------------------------
describe('parseFunctionCall object() with spread', () => {
  it('should handle spread in object() call form', () => {
    const result = dvala.run('let obj = {a: 1, b: 2}; object(...obj)')
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('should handle spread mixed with key-value pairs in object()', () => {
    const result = dvala.run('let obj = {a: 1}; object("b", 2, ...obj)')
    expect(result).toEqual({ b: 2, a: 1 })
  })
})

// ---------------------------------------------------------------------------
// bindingSlot.ts — extractValueByPath null/undefined (line 249)
// ---------------------------------------------------------------------------
describe('bindingSlot extractValueByPath edge cases', () => {
  it('should return null for deep destructuring with null intermediate', () => {
    // Nested destructuring on null value — extractValueByPath returns undefined
    // which becomes null in Dvala
    const result = dvala.run('let {a: {b}} = {a: null}; b')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parseQuote.ts — nested quote with inner splice (line 142)
// ---------------------------------------------------------------------------
describe('parseQuote nested quote with splice passthrough', () => {
  it('should pass through inner-level splices in nested quotes (line 142)', () => {
    // When $^{expr} appears inside a nested quote, its effective level is 0
    // (level 1 - innerQuoteDepth 1 = 0), so it belongs to the inner quote
    // and should be passed through as-is in the outer quote's processing.
    // We just verify it parses without error.
    expect(() =>
      dvala.run(`
      quote
        quote $^{42} end
      end
    `),
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// trampoline-evaluator.ts — retriggerWithEffects catch paths (lines 4966-4971, 5017)
// These lines are in the retrigger path's catch block, not evaluateWithEffects.
// ---------------------------------------------------------------------------
describe('retriggerWithEffects catch paths', () => {
  // Helper: create a suspended snapshot from a simple effect
  async function createSuspendedSnapshot(): Promise<Snapshot> {
    const result = await dvala.runAsync('perform(@test.action, 42)', {
      effectHandlers: [
        {
          pattern: 'test.action',
          handler: ({ suspend }) => {
            suspend()
          },
        },
      ],
    })
    if (result.type !== 'suspended') throw new Error('Expected suspended')
    return result.snapshot
  }

  it('should return halted when retrigger handler calls halt (line 4966-4967)', async () => {
    const snapshot = await createSuspendedSnapshot()
    const result = await retrigger(snapshot, {
      disableAutoCheckpoint: true,
      handlers: [
        {
          pattern: 'test.action',
          handler: ({ halt, arg }) => {
            halt(arg)
          },
        },
      ],
    })
    expect(result.type).toBe('halted')
    if (result.type === 'halted') {
      expect(result.value).toBe(42)
    }
  })

  it('should catch DvalaError thrown in retrigger handler (line 4969-4970)', async () => {
    const snapshot = await createSuspendedSnapshot()
    const result = await retrigger(snapshot, {
      disableAutoCheckpoint: true,
      handlers: [
        {
          pattern: 'test.action',
          handler: () => {
            // Throw a DvalaError directly to hit the instanceof DvalaError path
            throw new DvalaError('retrigger error', undefined)
          },
        },
      ],
    })
    expect(result.type).toBe('error')
  })

  it('should wrap non-DvalaError thrown in retrigger handler (line 4971)', async () => {
    const snapshot = await createSuspendedSnapshot()
    const result = await retrigger(snapshot, {
      disableAutoCheckpoint: true,
      handlers: [
        {
          pattern: 'test.action',
          handler: () => {
            throw 'plain string error'
          },
        },
      ],
    })
    expect(result.type).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// trampoline-evaluator.ts — terminal snapshot halted meta (line 5017)
// ---------------------------------------------------------------------------
describe('trampoline-evaluator terminal snapshot halted', () => {
  it('should produce terminal snapshot with halted meta when terminalSnapshot enabled', async () => {
    const result = await dvala.runAsync('perform(@test.halt, 42)', {
      effectHandlers: [
        {
          pattern: 'test.halt',
          handler: ({ halt, arg }) => {
            halt(arg)
          },
        },
      ],
      terminalSnapshot: true,
    })
    expect(result.type).toBe('halted')
    // The terminal snapshot is created internally; we just verify the halt works
    // with terminalSnapshot enabled to cover line 5017
    if (result.type === 'halted') {
      expect(result.value).toBe(42)
    }
  })
})

// ---------------------------------------------------------------------------
// Branch coverage: errors.ts — AssertionError with Error instance
// ---------------------------------------------------------------------------

describe('errors.ts branch coverage', () => {
  it('assertionError wraps Error instance message', () => {
    const err = new AssertionError(new Error('wrapped'))
    expect(err.message).toBe('wrapped')
  })
})

// ---------------------------------------------------------------------------
// Branch coverage: resume.ts / retrigger.ts — terminalSnapshot option
// ---------------------------------------------------------------------------

describe('resume.ts branch coverage', () => {
  it('resume with terminalSnapshot option', async () => {
    const resumeDvala = createDvala()
    const suspended = await resumeDvala.runAsync('perform(@my.eff, 42)', {
      effectHandlers: [
        {
          pattern: 'my.eff',
          handler: async ({ suspend }) => {
            suspend()
          },
        },
      ],
    })
    if (suspended.type !== 'suspended') throw new Error('expected suspended')
    const result = await resume(suspended.snapshot, 'ok', { terminalSnapshot: true })
    expect(result.type).toBe('completed')
  })
})

describe('retrigger.ts branch coverage', () => {
  it('retrigger with terminalSnapshot option', async () => {
    const retriggerDvala = createDvala()
    const suspended = await retriggerDvala.runAsync('perform(@my.eff, 42)', {
      effectHandlers: [
        {
          pattern: 'my.eff',
          handler: async ({ suspend }) => {
            suspend()
          },
        },
      ],
    })
    if (suspended.type !== 'suspended') throw new Error('expected suspended')
    const result = await retrigger(suspended.snapshot, {
      terminalSnapshot: true,
      handlers: [
        {
          pattern: 'my.eff',
          handler: async ({ resume: r }) => {
            r('done')
          },
        },
      ],
    })
    expect(result.type).toBe('completed')
  })
})

// ---------------------------------------------------------------------------
// Branch coverage: tooling.ts — custom effectNames
// ---------------------------------------------------------------------------

describe('tooling.ts branch coverage', () => {
  it('getAutoCompleter with custom effectNames passes them through', () => {
    // Exercises the truthy branch of `params.effectNames` in getAutoCompleter
    const ac = getAutoCompleter('perform(@custom.f', 17, { effectNames: ['custom.foo', 'custom.bar'] })
    const suggestions = ac.getSuggestions()
    expect(suggestions).toContain('custom.foo')
  })
})

// ---------------------------------------------------------------------------
// Branch coverage: AutoCompleter.ts — dotPrefix path
// ---------------------------------------------------------------------------

describe('AutoCompleter.ts branch coverage', () => {
  it('completes dotted effect names with prefix', () => {
    const ac = getAutoCompleter('perform(@dvala.io.', 18)
    const suggestions = ac.getSuggestions()
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.some(s => s.includes('print'))).toBe(true)
  })

  it('dotPrefix path with no effectNames uses empty fallback', () => {
    const ac = new AutoCompleter('perform(@dvala.io.p', 19)
    const suggestions = ac.getSuggestions()
    expect(Array.isArray(suggestions)).toBe(true)
  })

  it('handles empty program', () => {
    const ac = getAutoCompleter('', 0)
    expect(ac.getSuggestions()).toEqual([])
  })

  it('handles error token at end', () => {
    const ac = getAutoCompleter('`unterminated', 13)
    expect(ac.getSuggestions()).toEqual([])
  })

  it('handles cursor right after dot operator', () => {
    const ac = getAutoCompleter('obj.', 4)
    expect(Array.isArray(ac.getSuggestions())).toBe(true)
  })

  it('getPreviousSuggestion works', () => {
    const ac = getAutoCompleter('le', 2)
    const first = ac.getNextSuggestion()
    expect(first).not.toBeNull()
    const prev = ac.getPreviousSuggestion()
    expect(prev).not.toBeNull()
  })

  it('getPreviousSuggestion wraps around', () => {
    const ac = getAutoCompleter('le', 2)
    const prev = ac.getPreviousSuggestion()
    expect(prev).not.toBeNull()
    for (let i = 0; i < 50; i++) ac.getPreviousSuggestion()
    expect(ac.getPreviousSuggestion()).not.toBeNull()
  })

  it('getNextSuggestion wraps around', () => {
    const ac = getAutoCompleter('le', 2)
    for (let i = 0; i < 50; i++) ac.getNextSuggestion()
    expect(ac.getNextSuggestion()).not.toBeNull()
  })

  it('getSearchString returns the search prefix', () => {
    const ac = getAutoCompleter('le', 2)
    expect(ac.getSearchString()).toBe('le')
  })

  it('returns null suggestion when no matches', () => {
    const ac = getAutoCompleter('zzzzzzzzNotASymbol', 18)
    expect(ac.getNextSuggestion()).toBeNull()
    expect(ac.getPreviousSuggestion()).toBeNull()
  })

  it('includes custom bindings in suggestions', () => {
    const ac = getAutoCompleter('myV', 3, { scope: { myVar: 42, myVal: 99 } })
    const suggestions = ac.getSuggestions()
    expect(suggestions).toContain('myVar')
    expect(suggestions).toContain('myVal')
  })

  it('case-insensitive includes finds match not found by earlier rounds', () => {
    // Search "XY" — a binding "axy" contains "xy" (case-insensitive) but NOT "XY" (case-sensitive).
    // Round 1 (startsWith "XY"): no match
    // Round 2 (startsWith "xy" case-insensitive): no match (doesn't start with it)
    // Round 3 (includes "XY" case-sensitive): no match ("axy" doesn't contain "XY")
    // Round 4 (includes "xy" case-insensitive): MATCH ("axy" contains "xy")
    const ac = getAutoCompleter('XY', 2, { scope: { axy: 1 } })
    const suggestions = ac.getSuggestions()
    expect(suggestions).toContain('axy')
  })
})

// ---------------------------------------------------------------------------
// Branch coverage: bindingNode.ts — nested default in object destructuring
// ---------------------------------------------------------------------------

describe('bindingNode.ts branch coverage', () => {
  it('walkDefaults finds default in object destructuring key via let', () => {
    // Exercises line 11: element[1][1] truthy (key has default value)
    const symbols = getUndefinedSymbols('let { a = someUndefined } = {}; a')
    expect(symbols.has('someUndefined')).toBe(true)
  })

  it('walkDefaults finds default in object destructuring via function param', () => {
    // Same path but via function param analysis
    const symbols = getUndefinedSymbols('let f = ({ a = someUndefined }) -> a; f')
    expect(symbols.has('someUndefined')).toBe(true)
  })

  it('walkDefaults recurses into nested object destructuring defaults', () => {
    // Nested: { a: { b = undefinedRef } }
    const symbols = getUndefinedSymbols('let { x: { y = nestedRef } } = {}; y')
    expect(symbols.has('nestedRef')).toBe(true)
  })

  it('uses default when nested object is missing', () => {
    const nestedDvala = createDvala()
    expect(nestedDvala.run('let { a: { b = 99 } = {} } = {}; b')).toBe(99)
  })
})

// ---------------------------------------------------------------------------
// Branch coverage: bindingSlot.ts — literal/wildcard binding target
// ---------------------------------------------------------------------------

describe('bindingSlot.ts branch coverage', () => {
  it('literal pattern in match covers literal/wildcard binding slot path', () => {
    const slotDvala = createDvala()
    // Match with literal pattern exercises the literal case in flattenBindingPattern
    expect(slotDvala.run('match [1, 2] case [1, x] then x end')).toBe(2)
  })
})
