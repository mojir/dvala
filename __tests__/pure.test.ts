import { describe, expect, it } from 'vitest'
import { Dvala } from '../src/Dvala/Dvala'
import type { DvalaBundle } from '../src/bundler/interface'

describe('pure mode', () => {
  describe('core builtins', () => {
    it('should allow pure functions in pure mode', () => {
      const dvala = new Dvala()
      expect(dvala.run('1 + 2', { pure: true })).toBe(3)
    })

    it('should allow all core builtins in pure mode (none are impure)', () => {
      const dvala = new Dvala()
      expect(dvala.run('map([1, 2, 3], -> $ * 2)', { pure: true })).toEqual([2, 4, 6])
      expect(dvala.run('str("hello", " ", "world")', { pure: true })).toBe('hello world')
    })
  })

  describe('async', () => {
    it('should allow pure code in async pure mode', async () => {
      const dvala = new Dvala()
      await expect(dvala.async.run('1 + 2', { pure: true })).resolves.toBe(3)
    })
  })

  describe('file modules in bundles', () => {
    it('should allow file modules that define impure functions without calling them', () => {
      const dvala = new Dvala()
      const bundle: DvalaBundle = {
        program: 'let m = import(mymod); m.greet("world")',
        fileModules: [
          ['mymod', '{ greet: -> "hello " ++ $1 }'],
        ],
      }
      expect(dvala.run(bundle)).toBe('hello world')
    })
  })
})
