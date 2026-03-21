import { beforeEach, describe, expect, it } from 'vitest'
import type { AutoCompleterParams } from './AutoCompleter'
import { AutoCompleter } from './AutoCompleter'

describe('autoCompleter', () => {
  let params: AutoCompleterParams

  beforeEach(() => {
    params = {
      bindings: {
        jsFunc: 42,
        value_1: 1,
        value_2: 'test',
      },
    }
  })

  describe('constructor', () => {
    it('should initialize with valid input', () => {
      const completer = new AutoCompleter('(le', 3, params)
      expect(completer.getSearchString()).toBe('le')
      expect(completer.getSuggestions()).toContain('let')
    })

    it('should initialize with valid input 2', () => {
      const completer = new AutoCompleter('(mat', 4, params)
      expect(completer.getSearchString()).toBe('mat')
      expect(completer.getSuggestions()).toContain('match')
    })

    it('should initialize with no params', () => {
      const completer = new AutoCompleter('(le', 3, {})
      expect(completer.getSearchString()).toBe('le')
      expect(completer.getSuggestions()).toContain('let')
    })

    it('should handle empty input', () => {
      const completer = new AutoCompleter('', 0, params)
      expect(completer.getSearchString()).toBe('')
      expect(completer.getSuggestions().length).toBe(0)
    })

    it('should handle invalid token stream', () => {
      const completer = new AutoCompleter('123a', 4, params)
      expect(completer.getSearchString()).toBe('')
      expect(completer.getSuggestions().length).toBe(0)
    })
  })

  describe('suggestion generation', () => {
    it('should generate suggestions from dvalaCommands', () => {
      const completer = new AutoCompleter('(le', 3, params)
      const suggestions = completer.getSuggestions()
      expect(suggestions).toContain('let')
    })

    it('should generate suggestions from bindings', () => {
      const completer = new AutoCompleter('(js', 3, params)
      const suggestions = completer.getSuggestions()
      expect(suggestions).toContain('jsFunc')
    })

    it('should generate suggestions from values in bindings', () => {
      const completer = new AutoCompleter('(value', 6, params)
      const suggestions = completer.getSuggestions()
      expect(suggestions).toContain('value_1')
      expect(suggestions).toContain('value_2')
    })
  })

  describe('suggestion navigation', () => {
    it('should cycle through suggestions forward', () => {
      const completer = new AutoCompleter('(value_', 7, params)
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
      const completer = new AutoCompleter('(value_', 7, params)
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
      const completer = new AutoCompleter('(nonexistent', 12, params)
      expect(completer.getNextSuggestion()).toBeNull()
      expect(completer.getPreviousSuggestion()).toBeNull()
    })
  })

  describe('effect name suggestions', () => {
    const effectParams: AutoCompleterParams = {
      effectNames: ['dvala.io.print', 'dvala.io.read', 'dvala.random', 'dvala.random.int'],
    }

    it('should suggest full effect names when searching from start', () => {
      const completer = new AutoCompleter('@dvala', 6, effectParams)
      const suggestions = completer.getSuggestions()
      expect(suggestions).toContain('dvala.io.print')
      expect(suggestions).toContain('dvala.io.read')
      expect(suggestions).toContain('dvala.random')
      expect(suggestions).toContain('dvala.random.int')
    })

    it.skip('should complete effect name suffix in dotted context', () => {
      const completer = new AutoCompleter('@dvala.io.print', 15, effectParams)
      const suggestions = completer.getSuggestions()
      expect(suggestions).toContain('print')
      expect(suggestions).toContain('read')
      expect(suggestions).not.toContain('dvala.io.print')
    })

    it('should produce correct program when completing dotted effect', () => {
      const completer = new AutoCompleter('@dvala.io.print', 15, effectParams)
      const suggestion = completer.getNextSuggestion()
      expect(suggestion).not.toBeNull()
      expect(suggestion?.program).toMatch(/^@dvala\.io\.print/)
    })

    it('should only suggest effects in dotted context, not regular commands', () => {
      const completer = new AutoCompleter('@dvala.io.', 10, effectParams)
      const suggestions = completer.getSuggestions()
      expect(suggestions).toContain('print')
      expect(suggestions).toContain('read')
      // Regular commands should not appear
      expect(suggestions).not.toContain('if')
      expect(suggestions).not.toContain('let')
    })
  })

  describe('suggestion result format', () => {
    it('should return correct program and position', () => {
      const completer = new AutoCompleter('(le s)', 3, params)
      const suggestion = completer.getNextSuggestion()

      expect(suggestion).not.toBeNull()
      expect(suggestion?.program).toBe('(let s)')
      expect(suggestion?.position).toBe(4)
    })
  })
})
