import { beforeEach, describe, expect, it } from 'vitest'
import { Dvala } from '../Dvala/Dvala'
import type { ContextParams } from '../Dvala/Dvala'
import type { DvalaFunction } from '../parser/types'
import { FUNCTION_SYMBOL } from '../utils/symbols'
import { AutoCompleter } from './AutoCompleter'

describe('autoCompleter', () => {
  let dvala: Dvala
  let params: ContextParams

  beforeEach(() => {
    dvala = new Dvala()
    const testFunction: DvalaFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'UserDefined',
      name: 'testFunction',
      evaluatedfunction: [[], [], {}],
      arity: {},
      docString: '',
    }
    const localFunction: DvalaFunction = {
      [FUNCTION_SYMBOL]: true,
      functionType: 'UserDefined',
      name: 'localFunction',
      evaluatedfunction: [[], [], {}],
      arity: {},
      docString: '',
    }
    params = {
      globalContext: {
        globalVar: { value: 'value' },
        testFunction: { value: testFunction },
      },
      contexts: [
        {
          localVar: { value: 'value' },
          localFunction: { value: localFunction },
        },
      ],
      bindings: {
        jsFunc: { fn: () => 42 },
        value_1: 1,
        value_2: 'test',
      },
    }
  })

  describe('constructor', () => {
    it('should initialize with valid input', () => {
      const completer = new AutoCompleter('(def', 4, dvala, params)
      expect(completer.getSearchString()).toBe('def')
      expect(completer.getSuggestions()).toContain('defined?')
    })

    it('should initialize with valid input 2', () => {
      const completer = new AutoCompleter('(efin', 5, dvala, params)
      expect(completer.getSearchString()).toBe('efin')
      expect(completer.getSuggestions()).toContain('defined?')
    })

    it('should initialize with no params', () => {
      const completer = new AutoCompleter('(def', 4, dvala, {})
      expect(completer.getSearchString()).toBe('def')
      expect(completer.getSuggestions()).toContain('defined?')
    })

    it('should handle empty input', () => {
      const completer = new AutoCompleter('', 0, dvala, params)
      expect(completer.getSearchString()).toBe('')
      expect(completer.getSuggestions().length).toBe(0)
    })

    it('should handle invalid token stream', () => {
      const completer = new AutoCompleter('123a', 4, dvala, params)
      expect(completer.getSearchString()).toBe('')
      expect(completer.getSuggestions().length).toBe(0)
    })
  })

  describe('suggestion generation', () => {
    it('should generate suggestions from dvalaCommands', () => {
      const completer = new AutoCompleter('(def', 4, dvala, params)
      const suggestions = completer.getSuggestions()
      expect(suggestions).toContain('defined?')
    })

    it('should generate suggestions from globalContext', () => {
      const completer = new AutoCompleter('(global', 7, dvala, params)
      const suggestions = completer.getSuggestions()
      expect(suggestions).toContain('globalVar')
    })

    it('should generate suggestions from contexts', () => {
      const completer = new AutoCompleter('(local', 6, dvala, params)
      const suggestions = completer.getSuggestions()
      expect(suggestions).toContain('localVar')
    })

    it('should generate suggestions from jsFunctions in bindings', () => {
      const completer = new AutoCompleter('(js', 3, dvala, params)
      const suggestions = completer.getSuggestions()
      expect(suggestions).toContain('jsFunc')
    })

    it('should generate suggestions from values in bindings', () => {
      const completer = new AutoCompleter('(value', 6, dvala, params)
      const suggestions = completer.getSuggestions()
      expect(suggestions).toContain('value_1')
      expect(suggestions).toContain('value_2')
    })
  })

  describe('suggestion navigation', () => {
    it('should cycle through suggestions forward', () => {
      const completer = new AutoCompleter('(value_', 7, dvala, params)
      const first = completer.getNextSuggestion()
      const second = completer.getNextSuggestion()
      const third = completer.getNextSuggestion()

      expect(first).not.toBeNull()
      expect(second).not.toBeNull()
      expect(third).not.toBeNull()
      expect(first?.program).not.toBe(second?.program)
      expect(second?.program).not.toBe(third?.program)
    })

    it('should cycle through suggestions backward', () => {
      const completer = new AutoCompleter('(value_', 7, dvala, params)
      const first = completer.getPreviousSuggestion()
      const second = completer.getPreviousSuggestion()
      const third = completer.getPreviousSuggestion()

      expect(first).not.toBeNull()
      expect(second).not.toBeNull()
      expect(third).not.toBeNull()
      expect(first?.program).not.toBe(second?.program)
      expect(second?.program).not.toBe(third?.program)
    })

    it('should return null when no suggestions are available', () => {
      const completer = new AutoCompleter('(nonexistent', 12, dvala, params)
      expect(completer.getNextSuggestion()).toBeNull()
      expect(completer.getPreviousSuggestion()).toBeNull()
    })
  })

  describe('suggestion result format', () => {
    it('should return correct program and position', () => {
      const completer = new AutoCompleter('(def s)', 4, dvala, params)
      const suggestion = completer.getNextSuggestion()

      expect(suggestion).not.toBeNull()
      expect(suggestion?.program).toBe('(defined? s)')
      expect(suggestion?.position).toBe(9)
    })
  })
})
