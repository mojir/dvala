import { afterEach, describe, expect, it } from 'vitest'
import type { Any } from '../interface'
import { isEffect, isObj } from '../typeGuards/dvala'
import { PersistentMap } from '../utils/persistent'
import { EFFECT_SYMBOL } from '../utils/symbols'
import { clearEffectRefInternMap, getEffectRef } from './effectRef'

describe('getEffectRef', () => {
  afterEach(() => {
    clearEffectRefInternMap()
  })

  it('should return an EffectRef with the given name', () => {
    const ref = getEffectRef('llm.complete')
    expect(ref.name).toBe('llm.complete')
    expect(ref[EFFECT_SYMBOL]).toBe(true)
  })

  it('should return the same reference for the same name', () => {
    const a = getEffectRef('llm.complete')
    const b = getEffectRef('llm.complete')
    expect(a).toBe(b)
  })

  it('should return different references for different names', () => {
    const a = getEffectRef('llm.complete')
    const b = getEffectRef('dvala.io.print')
    expect(a).not.toBe(b)
  })

  it('should handle dotted names', () => {
    const ref = getEffectRef('com.myco.human.approve')
    expect(ref.name).toBe('com.myco.human.approve')
  })

  it('should handle simple names', () => {
    const ref = getEffectRef('log')
    expect(ref.name).toBe('log')
  })

  it('should return interned references after clearing and re-creating', () => {
    const a = getEffectRef('llm.complete')
    clearEffectRefInternMap()
    const b = getEffectRef('llm.complete')
    // After clearing, a new reference is created — not the same object
    expect(a).not.toBe(b)
    // But structurally equal
    expect(a.name).toBe(b.name)
  })
})

describe('isEffect', () => {
  it('should return true for effect values', () => {
    const ref = getEffectRef('llm.complete')
    expect(isEffect(ref)).toBe(true)
  })

  it('should return true for manually constructed effect-like objects', () => {
    const ref = { [EFFECT_SYMBOL]: true, name: 'test.effect' }
    expect(isEffect(ref)).toBe(true)
  })

  it('should return false for null', () => {
    expect(isEffect(null)).toBe(false)
  })

  it('should return false for primitives', () => {
    expect(isEffect(42)).toBe(false)
    expect(isEffect('string')).toBe(false)
    expect(isEffect(true)).toBe(false)
    expect(isEffect(undefined)).toBe(false)
  })

  it('should return false for plain objects', () => {
    expect(isEffect({ name: 'test' })).toBe(false)
  })

  it('should return false for arrays', () => {
    expect(isEffect([1, 2, 3])).toBe(false)
  })
})

describe('isObj excludes effects', () => {
  it('should not treat an effect as a plain object', () => {
    const ref = getEffectRef('llm.complete')
    expect(isObj(ref as Any)).toBe(false)
  })

  it('should still treat PersistentMap as Obj', () => {
    expect(isObj(PersistentMap.fromRecord({ a: 1 }))).toBe(true)
  })
})
