import { describe, expect, it } from 'vitest'
import { Dvala } from '../src/Dvala/Dvala'
import { DvalaError } from '../src/errors'
import { regexpEquals } from './testUtils'

describe('regexpShorthand', () => {
  for (const dvala of [new Dvala(), new Dvala({ debug: true })]) {
    it('samples', () => {
      expect(regexpEquals(dvala.run('#" "g'), / /g)).toBe(true)
      expect(regexpEquals(dvala.run('#"a"gi'), /a/gi)).toBe(true)
      expect(regexpEquals(dvala.run('#"a"ig'), /a/gi)).toBe(true)
      expect(regexpEquals(dvala.run('#"a"i'), /a/i)).toBe(true)
      expect(regexpEquals(dvala.run('#"^abc"'), /^abc/)).toBe(true)
      expect(() => dvala.run('#"a"is')).toThrow(DvalaError)
      expect(() => dvala.run('#"a"s')).toThrow(DvalaError)
      expect(() => dvala.run('#"a"ii')).toThrow(DvalaError)
      expect(() => dvala.run('#"a"gg')).toThrow(DvalaError)
    })
  }
})
