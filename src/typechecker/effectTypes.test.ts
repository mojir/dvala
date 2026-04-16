import { afterEach, describe, expect, it } from 'vitest'
import {
  declareEffect,
  getEffectArgType,
  getEffectDeclaration,
  getEffectReturnType,
  initBuiltinEffects,
  resetEffectRegistry,
  resetUserEffects,
  restoreEffectRegistry,
  snapshotEffectRegistry,
} from './effectTypes'
import { NumberType, StringType, Unknown } from './types'

afterEach(() => {
  resetEffectRegistry()
})

// ---------------------------------------------------------------------------
// declareEffect / getEffectDeclaration
// ---------------------------------------------------------------------------

describe('declareEffect / getEffectDeclaration', () => {
  it('returns undefined for undeclared effect', () => {
    expect(getEffectDeclaration('nonexistent')).toBeUndefined()
  })

  it('returns declaration after registering', () => {
    declareEffect('my.eff', StringType, NumberType)
    const decl = getEffectDeclaration('my.eff')
    expect(decl).toEqual({ argType: StringType, retType: NumberType })
  })
})

// ---------------------------------------------------------------------------
// getEffectReturnType
// ---------------------------------------------------------------------------

describe('getEffectReturnType', () => {
  it('returns Unknown for undeclared effect', () => {
    // Covers the ?? Unknown fallback branch on line 53
    expect(getEffectReturnType('nonexistent')).toBe(Unknown)
  })

  it('returns declared return type', () => {
    declareEffect('my.eff', StringType, NumberType)
    expect(getEffectReturnType('my.eff')).toBe(NumberType)
  })
})

// ---------------------------------------------------------------------------
// getEffectArgType
// ---------------------------------------------------------------------------

describe('getEffectArgType', () => {
  it('returns Unknown for undeclared effect', () => {
    // Covers the ?? Unknown fallback branch on line 58
    expect(getEffectArgType('nonexistent')).toBe(Unknown)
  })

  it('returns declared arg type', () => {
    declareEffect('my.eff', StringType, NumberType)
    expect(getEffectArgType('my.eff')).toBe(StringType)
  })
})

// ---------------------------------------------------------------------------
// snapshot / restore
// ---------------------------------------------------------------------------

describe('snapshotEffectRegistry / restoreEffectRegistry', () => {
  it('snapshot captures current state and restore replays it', () => {
    declareEffect('a', StringType, NumberType)
    const snap = snapshotEffectRegistry()

    // Mutate the registry after snapshot
    declareEffect('b', NumberType, StringType)
    expect(getEffectDeclaration('b')).toBeDefined()

    // Restore should bring back only what was snapshotted
    restoreEffectRegistry(snap)
    expect(getEffectDeclaration('a')).toEqual({ argType: StringType, retType: NumberType })
    expect(getEffectDeclaration('b')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// resetUserEffects — preserves builtin effects
// ---------------------------------------------------------------------------

describe('resetUserEffects', () => {
  it('removes user-declared effects but keeps builtins', () => {
    initBuiltinEffects()
    declareEffect('user.custom', StringType, NumberType)

    // Both should exist before reset
    expect(getEffectDeclaration('dvala.error')).toBeDefined()
    expect(getEffectDeclaration('user.custom')).toBeDefined()

    resetUserEffects()

    // Builtin survives, user effect is gone
    expect(getEffectDeclaration('dvala.error')).toBeDefined()
    expect(getEffectDeclaration('user.custom')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// initBuiltinEffects
// ---------------------------------------------------------------------------

describe('initBuiltinEffects', () => {
  it('registers core dvala effects', () => {
    initBuiltinEffects()
    expect(getEffectDeclaration('dvala.error')).toBeDefined()
    expect(getEffectDeclaration('dvala.io.print')).toBeDefined()
    expect(getEffectDeclaration('dvala.io.read')).toBeDefined()
  })
})
